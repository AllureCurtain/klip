use std::collections::BTreeMap;
use std::ptr;
use std::thread;
use std::time::Duration;

use windows::core::HSTRING;
use windows::Win32::Foundation::{GlobalFree, HANDLE, HGLOBAL};
use windows::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatW, SetClipboardData,
};
use windows::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};

use super::backend::{ClipboardError, ClipboardImageSource, ImageWriteRepresentation};

const CF_DIB: u32 = 8;
const CF_DIBV5: u32 = 17;
const OPEN_ATTEMPTS: u32 = 10;
const OPEN_RETRY_DELAY: Duration = Duration::from_millis(50);

pub(super) fn read_bitmap_sources(
    max_bytes: usize,
) -> Result<Vec<ClipboardImageSource>, ClipboardError> {
    with_open_clipboard(|| {
        let mut sources = Vec::new();
        if let Some(data) = read_format(CF_DIBV5, max_bytes)? {
            sources.push(ClipboardImageSource {
                format_name: "dibv5".into(),
                mime_type: None,
                clipboard_format: Some("CF_DIBV5".into()),
                data,
                metadata: Some(r#"{"rawBitmap":true}"#.into()),
            });
        }
        if let Some(data) = read_format(CF_DIB, max_bytes)? {
            sources.push(ClipboardImageSource {
                format_name: "dib".into(),
                mime_type: None,
                clipboard_format: Some("CF_DIB".into()),
                data,
                metadata: Some(r#"{"rawBitmap":true}"#.into()),
            });
        }
        Ok(sources)
    })
    .map_err(|(attempts, cause)| ClipboardError::Read { attempts, cause })
}

pub(super) fn decode_bitmap_source(
    source: &ClipboardImageSource,
) -> Result<(Vec<u8>, u32, u32), ClipboardError> {
    decode_dib(&source.data).map_err(ClipboardError::ImageDecode)
}

fn decode_dib(data: &[u8]) -> Result<(Vec<u8>, u32, u32), String> {
    if data.len() < 40 {
        return Err("DIB header is shorter than BITMAPINFOHEADER".into());
    }
    let header_size = read_u32(data, 0)? as usize;
    if header_size < 40 || header_size > data.len() {
        return Err(format!("unsupported DIB header size {header_size}"));
    }
    let width = read_i32(data, 4)?;
    let signed_height = read_i32(data, 8)?;
    if width <= 0 || signed_height == 0 {
        return Err(format!("invalid DIB dimensions {width}x{signed_height}"));
    }
    let height = signed_height.unsigned_abs();
    let width = width as u32;
    let planes = read_u16(data, 12)?;
    let bit_count = read_u16(data, 14)?;
    let compression = read_u32(data, 16)?;
    if planes != 1 || !matches!(bit_count, 24 | 32) || !matches!(compression, 0 | 3) {
        return Err(format!(
            "unsupported DIB layout: planes={planes}, bit_count={bit_count}, compression={compression}"
        ));
    }

    let (red_mask, green_mask, blue_mask, alpha_mask, mask_bytes) = if compression == 3 {
        let mask_offset = 40;
        let red = read_u32(data, mask_offset)?;
        let green = read_u32(data, mask_offset + 4)?;
        let blue = read_u32(data, mask_offset + 8)?;
        let alpha = if header_size >= 56 {
            read_u32(data, mask_offset + 12)?
        } else {
            0
        };
        (
            red,
            green,
            blue,
            alpha,
            if header_size == 40 { 12 } else { 0 },
        )
    } else {
        (0x00ff_0000, 0x0000_ff00, 0x0000_00ff, 0, 0)
    };
    if red_mask == 0 || green_mask == 0 || blue_mask == 0 {
        return Err("DIB color masks are incomplete".into());
    }

    let colors_used = read_u32(data, 32)? as usize;
    let palette_entries = if colors_used > 0 {
        colors_used
    } else if bit_count <= 8 {
        1usize << bit_count
    } else {
        0
    };
    let mut pixel_offset = header_size
        .checked_add(mask_bytes)
        .and_then(|offset| offset.checked_add(palette_entries.saturating_mul(4)))
        .ok_or_else(|| "DIB pixel offset overflow".to_string())?;
    let row_stride = ((width as usize)
        .checked_mul(bit_count as usize)
        .and_then(|bits| bits.checked_add(31))
        .ok_or_else(|| "DIB row size overflow".to_string())?
        / 32)
        * 4;
    let pixel_bytes = row_stride
        .checked_mul(height as usize)
        .ok_or_else(|| "DIB pixel buffer overflow".to_string())?;
    // Several Windows producers append the three BITFIELDS masks after a
    // BITMAPV5HEADER even though that header already contains the masks. The
    // advertised image size remains correct, so detect and skip that duplicate
    // block instead of treating it as the first scanline.
    if compression == 3
        && header_size >= 56
        && data.len() >= pixel_offset.saturating_add(12).saturating_add(pixel_bytes)
        && read_u32(data, pixel_offset).ok() == Some(red_mask)
        && read_u32(data, pixel_offset + 4).ok() == Some(green_mask)
        && read_u32(data, pixel_offset + 8).ok() == Some(blue_mask)
    {
        pixel_offset += 12;
    }
    if pixel_offset
        .checked_add(pixel_bytes)
        .is_none_or(|end| end > data.len())
    {
        return Err(format!(
            "DIB pixel buffer is truncated: need {pixel_bytes} bytes at offset {pixel_offset}, have {}",
            data.len()
        ));
    }

    let output_len = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| "DIB output buffer overflow".to_string())?;
    let mut rgba = vec![0u8; output_len];
    let bytes_per_pixel = (bit_count / 8) as usize;
    for output_y in 0..height as usize {
        let source_y = if signed_height < 0 {
            output_y
        } else {
            height as usize - 1 - output_y
        };
        let row_start = pixel_offset + source_y * row_stride;
        for x in 0..width as usize {
            let source = row_start + x * bytes_per_pixel;
            let value = if bit_count == 32 {
                u32::from_le_bytes(data[source..source + 4].try_into().unwrap())
            } else {
                u32::from(data[source])
                    | (u32::from(data[source + 1]) << 8)
                    | (u32::from(data[source + 2]) << 16)
            };
            let target = (output_y * width as usize + x) * 4;
            rgba[target] = mask_component(value, red_mask);
            rgba[target + 1] = mask_component(value, green_mask);
            rgba[target + 2] = mask_component(value, blue_mask);
            rgba[target + 3] = if alpha_mask == 0 {
                255
            } else {
                mask_component(value, alpha_mask)
            };
        }
    }
    Ok((rgba, width, height))
}

fn mask_component(value: u32, mask: u32) -> u8 {
    if mask == 0 {
        return 0;
    }
    let shift = mask.trailing_zeros();
    let maximum = mask >> shift;
    let component = (value & mask) >> shift;
    ((u64::from(component) * 255 + u64::from(maximum) / 2) / u64::from(maximum)) as u8
}

fn read_u16(data: &[u8], offset: usize) -> Result<u16, String> {
    data.get(offset..offset + 2)
        .and_then(|bytes| bytes.try_into().ok())
        .map(u16::from_le_bytes)
        .ok_or_else(|| format!("DIB header is truncated at offset {offset}"))
}

fn read_u32(data: &[u8], offset: usize) -> Result<u32, String> {
    data.get(offset..offset + 4)
        .and_then(|bytes| bytes.try_into().ok())
        .map(u32::from_le_bytes)
        .ok_or_else(|| format!("DIB header is truncated at offset {offset}"))
}

fn read_i32(data: &[u8], offset: usize) -> Result<i32, String> {
    data.get(offset..offset + 4)
        .and_then(|bytes| bytes.try_into().ok())
        .map(i32::from_le_bytes)
        .ok_or_else(|| format!("DIB header is truncated at offset {offset}"))
}

pub(super) fn has_private_marker(marker: &str) -> bool {
    let format = unsafe { RegisterClipboardFormatW(&HSTRING::from(marker)) };
    format != 0 && unsafe { IsClipboardFormatAvailable(format) }.is_ok()
}

pub(super) fn write_representations(
    canonical_png: &[u8],
    rgba: &[u8],
    width: u32,
    height: u32,
    sources: &[ImageWriteRepresentation<'_>],
    marker: &str,
    marker_value: &[u8],
) -> Result<(), ClipboardError> {
    let mut formats = BTreeMap::<u32, Vec<u8>>::new();
    formats.insert(register_format("PNG")?, canonical_png.to_vec());
    formats.insert(CF_DIB, encode_dib(rgba, width, height)?);
    formats.insert(CF_DIBV5, encode_dibv5(rgba, width, height)?);
    formats.insert(register_format(marker)?, marker_value.to_vec());

    for source in sources {
        // Raw DIB buffers can depend on companion CF_BITMAP/DataObject state
        // supplied by their original owner. Republish the pixel-equivalent,
        // self-contained DIB variants generated above; encoded formats remain
        // byte-for-byte source representations.
        if matches!(source.format_name, "dib" | "dibv5") {
            continue;
        }
        let format_id = register_format(source.clipboard_format.unwrap_or(source.format_name))?;
        formats.insert(format_id, source.data.to_vec());
    }

    with_open_clipboard(|| {
        unsafe { EmptyClipboard() }.map_err(|error| error.to_string())?;
        for (format, data) in &formats {
            set_format(*format, data)?;
        }
        Ok(())
    })
    .map_err(|(attempts, cause)| ClipboardError::Write { attempts, cause })
}

fn with_open_clipboard<T>(
    mut operation: impl FnMut() -> Result<T, String>,
) -> Result<T, (u32, String)> {
    let mut last = String::new();
    for attempt in 1..=OPEN_ATTEMPTS {
        match unsafe { OpenClipboard(None) } {
            Ok(()) => {
                let result = operation();
                if let Err(error) = unsafe { CloseClipboard() } {
                    return Err((attempt, format!("failed to close clipboard: {error}")));
                }
                return result.map_err(|error| (attempt, error));
            }
            Err(error) => last = error.to_string(),
        }
        if attempt < OPEN_ATTEMPTS {
            thread::sleep(OPEN_RETRY_DELAY);
        }
    }
    Err((OPEN_ATTEMPTS, last))
}

fn read_format(format: u32, max_bytes: usize) -> Result<Option<Vec<u8>>, String> {
    if unsafe { IsClipboardFormatAvailable(format) }.is_err() {
        return Ok(None);
    }
    let handle = unsafe { GetClipboardData(format) }.map_err(|error| error.to_string())?;
    let global = HGLOBAL(handle.0);
    let size = unsafe { GlobalSize(global) };
    if size == 0 {
        return Err(format!(
            "clipboard format {format} has an empty global buffer"
        ));
    }
    if size > max_bytes {
        return Err(format!(
            "clipboard format {format} is {size} bytes, above the {max_bytes} byte limit"
        ));
    }
    let pointer = unsafe { GlobalLock(global) };
    if pointer.is_null() {
        return Err(format!("failed to lock clipboard format {format}"));
    }
    let data = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), size) }.to_vec();
    let _ = unsafe { GlobalUnlock(global) };
    Ok(Some(data))
}

fn register_format(name: &str) -> Result<u32, ClipboardError> {
    let format = unsafe { RegisterClipboardFormatW(&HSTRING::from(name)) };
    if format == 0 {
        return Err(ClipboardError::Write {
            attempts: 0,
            cause: format!("failed to register clipboard format {name}"),
        });
    }
    Ok(format)
}

fn set_format(format: u32, data: &[u8]) -> Result<(), String> {
    let allocation = unsafe { GlobalAlloc(GMEM_MOVEABLE, data.len()) }
        .map_err(|error| format!("failed to allocate clipboard format {format}: {error}"))?;
    let pointer = unsafe { GlobalLock(allocation) };
    if pointer.is_null() {
        let _ = unsafe { GlobalFree(Some(allocation)) };
        return Err(format!(
            "failed to lock clipboard allocation for format {format}"
        ));
    }
    unsafe { ptr::copy_nonoverlapping(data.as_ptr(), pointer.cast::<u8>(), data.len()) };
    let _ = unsafe { GlobalUnlock(allocation) };
    match unsafe { SetClipboardData(format, Some(HANDLE(allocation.0))) } {
        Ok(_) => Ok(()),
        Err(error) => {
            let _ = unsafe { GlobalFree(Some(allocation)) };
            Err(format!("failed to set clipboard format {format}: {error}"))
        }
    }
}

fn encode_dibv5(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ClipboardError> {
    let pixel_bytes = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| ClipboardError::ImageDecode("image dimensions overflow".into()))?;
    if rgba.len() != pixel_bytes {
        return Err(ClipboardError::ImageDecode(format!(
            "RGBA buffer has {} bytes, expected {pixel_bytes}",
            rgba.len()
        )));
    }

    let mut dib = vec![0u8; 124 + pixel_bytes];
    put_u32(&mut dib, 0, 124);
    put_i32(&mut dib, 4, width as i32);
    put_i32(&mut dib, 8, -(height as i32));
    put_u16(&mut dib, 12, 1);
    put_u16(&mut dib, 14, 32);
    put_u32(&mut dib, 16, 3);
    put_u32(&mut dib, 20, pixel_bytes as u32);
    put_u32(&mut dib, 40, 0x00ff_0000);
    put_u32(&mut dib, 44, 0x0000_ff00);
    put_u32(&mut dib, 48, 0x0000_00ff);
    put_u32(&mut dib, 52, 0xff00_0000);
    put_u32(&mut dib, 56, 0x7352_4742);
    put_u32(&mut dib, 108, 4);

    // RGBA -> BGRA. Both slices are exact multiples of 4 (checked above), so the
    // `as_chunks` remainders are empty and the zip covers every pixel.
    let (sources, _) = rgba.as_chunks::<4>();
    let (targets, _) = dib[124..].as_chunks_mut::<4>();
    for (source, target) in sources.iter().zip(targets) {
        *target = [source[2], source[1], source[0], source[3]];
    }
    Ok(dib)
}

fn encode_dib(rgba: &[u8], width: u32, height: u32) -> Result<Vec<u8>, ClipboardError> {
    let pixel_bytes = (width as usize)
        .checked_mul(height as usize)
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or_else(|| ClipboardError::ImageDecode("image dimensions overflow".into()))?;
    if rgba.len() != pixel_bytes {
        return Err(ClipboardError::ImageDecode(format!(
            "RGBA buffer has {} bytes, expected {pixel_bytes}",
            rgba.len()
        )));
    }

    let mut dib = vec![0u8; 52 + pixel_bytes];
    put_u32(&mut dib, 0, 40);
    put_i32(&mut dib, 4, width as i32);
    put_i32(&mut dib, 8, height as i32);
    put_u16(&mut dib, 12, 1);
    put_u16(&mut dib, 14, 32);
    put_u32(&mut dib, 16, 3);
    put_u32(&mut dib, 20, pixel_bytes as u32);
    put_u32(&mut dib, 40, 0x00ff_0000);
    put_u32(&mut dib, 44, 0x0000_ff00);
    put_u32(&mut dib, 48, 0x0000_00ff);

    for y in 0..height as usize {
        let source_y = height as usize - 1 - y;
        for x in 0..width as usize {
            let source = (source_y * width as usize + x) * 4;
            let target = 52 + (y * width as usize + x) * 4;
            dib[target..target + 4].copy_from_slice(&[
                rgba[source + 2],
                rgba[source + 1],
                rgba[source],
                255,
            ]);
        }
    }
    Ok(dib)
}

fn put_u16(buffer: &mut [u8], offset: usize, value: u16) {
    buffer[offset..offset + 2].copy_from_slice(&value.to_le_bytes());
}

fn put_u32(buffer: &mut [u8], offset: usize, value: u32) {
    buffer[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

fn put_i32(buffer: &mut [u8], offset: usize, value: i32) {
    buffer[offset..offset + 4].copy_from_slice(&value.to_le_bytes());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dibv5_is_top_down_bgra_and_keeps_alpha() {
        let dib = encode_dibv5(&[1, 2, 3, 4, 10, 20, 30, 40], 2, 1).unwrap();
        assert_eq!(u32::from_le_bytes(dib[0..4].try_into().unwrap()), 124);
        assert_eq!(i32::from_le_bytes(dib[8..12].try_into().unwrap()), -1);
        assert_eq!(&dib[124..132], &[3, 2, 1, 4, 30, 20, 10, 40]);
    }

    #[test]
    fn dib_write_is_bottom_up_bgr_and_uses_windows_compatible_header() {
        let dib = encode_dib(&[1, 2, 3, 4, 10, 20, 30, 40], 2, 1).unwrap();
        assert_eq!(u32::from_le_bytes(dib[0..4].try_into().unwrap()), 40);
        assert_eq!(i32::from_le_bytes(dib[8..12].try_into().unwrap()), 1);
        assert_eq!(&dib[52..60], &[3, 2, 1, 255, 30, 20, 10, 255]);
    }

    #[test]
    fn raw_dib_sources_do_not_replace_the_self_contained_write_formats() {
        let sources = [ImageWriteRepresentation {
            format_name: "dibv5",
            clipboard_format: Some("CF_DIBV5"),
            data: &[0, 1, 2, 3],
        }];
        let mut formats = BTreeMap::<u32, Vec<u8>>::new();
        formats.insert(CF_DIB, vec![1]);
        formats.insert(CF_DIBV5, vec![2]);
        for source in sources {
            if matches!(source.format_name, "dib" | "dibv5") {
                continue;
            }
            formats.insert(
                register_format(source.clipboard_format.unwrap_or(source.format_name)).unwrap(),
                source.data.to_vec(),
            );
        }
        assert_eq!(formats.get(&CF_DIB), Some(&vec![1]));
        assert_eq!(formats.get(&CF_DIBV5), Some(&vec![2]));
    }

    #[test]
    fn dibv5_decode_restores_top_down_rgba_and_alpha() {
        let rgba = [1, 2, 3, 4, 10, 20, 30, 40];
        let mut dib = encode_dibv5(&rgba, 2, 1).unwrap();
        dib.splice(
            124..124,
            [
                0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0xff, 0x00, 0x00, 0x00,
            ],
        );
        let (decoded, width, height) = decode_dib(&dib).unwrap();
        assert_eq!((width, height), (2, 1));
        assert_eq!(decoded, rgba);
    }

    #[test]
    fn bottom_up_info_header_dib_decodes_bitfields_in_display_order() {
        let mut dib = vec![0u8; 40 + 12 + 24];
        put_u32(&mut dib, 0, 40);
        put_i32(&mut dib, 4, 3);
        put_i32(&mut dib, 8, 2);
        put_u16(&mut dib, 12, 1);
        put_u16(&mut dib, 14, 32);
        put_u32(&mut dib, 16, 3);
        put_u32(&mut dib, 20, 24);
        put_u32(&mut dib, 40, 0x00ff_0000);
        put_u32(&mut dib, 44, 0x0000_ff00);
        put_u32(&mut dib, 48, 0x0000_00ff);
        dib[52..76].copy_from_slice(&[
            20, 10, 200, 255, 40, 210, 30, 255, 220, 60, 50, 255, 56, 34, 12, 255, 123, 90, 78,
            255, 160, 150, 140, 255,
        ]);

        let (decoded, width, height) = decode_dib(&dib).unwrap();

        assert_eq!((width, height), (3, 2));
        assert_eq!(&decoded[0..4], &[12, 34, 56, 255]);
        assert_eq!(&decoded[16..20], &[30, 210, 40, 255]);
    }
}
