use base64::Engine;
use image::GenericImageView;

#[cfg(target_os = "windows")]
#[derive(serde::Deserialize)]
struct ImageDimensions {
    width: u32,
    height: u32,
}

#[cfg(target_os = "windows")]
const KLIP_IGNORE_FORMAT: &str = "Clipboard Viewer Ignore";

#[cfg(target_os = "windows")]
struct ClipboardGuard {
    _private: (),
}

#[cfg(target_os = "windows")]
impl ClipboardGuard {
    fn open(max_attempts: u32) -> Result<Self, String> {
        let mut attempts = 0;
        loop {
            match clipboard_win::raw::open() {
                Ok(()) => return Ok(Self { _private: () }),
                Err(e) => {
                    attempts += 1;
                    if attempts >= max_attempts {
                        return Err(format!(
                            "failed to open clipboard after {} retries: {}",
                            attempts, e
                        ));
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        if let Err(e) = clipboard_win::raw::close() {
            tracing::warn!("Failed to close clipboard: {}", e);
        }
    }
}

#[cfg(target_os = "windows")]
fn raw_set_text_with_marker(text: &str) -> Result<(), String> {
    let ignore_format = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    let _guard = ClipboardGuard::open(10)?;

    clipboard_win::raw::empty().map_err(|e| e.to_string())?;
    clipboard_win::raw::set_string(text).map_err(|e| e.to_string())?;

    if let Some(id) = ignore_format {
        clipboard_win::raw::set_without_clear(id.get(), b"Klip").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn raw_set_text_with_marker(text: &str) -> Result<(), String> {
    crate::platform::linux::set_text(text)
}

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
fn raw_set_text_with_marker(text: &str) -> Result<(), String> {
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_text(text).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn raw_set_image_with_marker(png_data: &[u8], metadata: Option<&str>) -> Result<(), String> {
    let img =
        image::load_from_memory(png_data).map_err(|e| format!("failed to decode PNG: {}", e))?;

    let (w, h) = if let Some(meta_str) = metadata {
        serde_json::from_str::<ImageDimensions>(meta_str)
            .map(|m| (m.width as usize, m.height as usize))
            .unwrap_or_else(|_| {
                let dims = img.dimensions();
                (dims.0 as usize, dims.1 as usize)
            })
    } else {
        let dims = img.dimensions();
        (dims.0 as usize, dims.1 as usize)
    };

    let rgba = img.to_rgba8();
    let raw = arboard::ImageData {
        width: w,
        height: h,
        bytes: rgba.as_raw().clone().into(),
    };

    let mut attempts = 0;
    loop {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        match cb.set_image(raw.clone()) {
            Ok(()) => break,
            Err(e) => {
                attempts += 1;
                if attempts >= 10 {
                    return Err(format!(
                        "failed to set image after {} retries: {}",
                        attempts, e
                    ));
                }
                std::thread::sleep(std::time::Duration::from_millis(50));
            }
        }
    }

    let ignore_format = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    if let Ok(_guard) = ClipboardGuard::open(5) {
        if let Some(id) = ignore_format {
            if let Err(e) = clipboard_win::raw::set_without_clear(id.get(), b"Klip") {
                tracing::warn!("Failed to set ignore marker: {}", e);
            }
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn raw_set_image_with_marker(png_data: &[u8], _metadata: Option<&str>) -> Result<(), String> {
    let img =
        image::load_from_memory(png_data).map_err(|e| format!("failed to decode PNG: {}", e))?;
    let dims = img.dimensions();
    let rgba = img.to_rgba8();
    let raw = arboard::ImageData {
        width: dims.0 as usize,
        height: dims.1 as usize,
        bytes: rgba.as_raw().clone().into(),
    };
    let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
    cb.set_image(raw).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn raw_set_file_list_with_marker(paths: &[&str]) -> Result<(), String> {
    const DROPEFFECT_COPY: u32 = 5;

    let ignore_format = clipboard_win::raw::register_format(KLIP_IGNORE_FORMAT);
    let dropeffect_format = clipboard_win::raw::register_format("Preferred DropEffect");

    let _guard = ClipboardGuard::open(10)?;

    clipboard_win::raw::empty().map_err(|e| e.to_string())?;
    clipboard_win::raw::set_file_list(paths).map_err(|e| e.to_string())?;

    if let Some(id) = dropeffect_format {
        clipboard_win::raw::set_without_clear(id.get(), &DROPEFFECT_COPY.to_le_bytes())
            .map_err(|e| e.to_string())?;
    } else {
        tracing::warn!("Failed to register Preferred DropEffect format");
    }

    if let Some(id) = ignore_format {
        clipboard_win::raw::set_without_clear(id.get(), b"Klip").map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(target_os = "linux")]
fn raw_set_file_list_with_marker(paths: &[&str]) -> Result<(), String> {
    crate::platform::linux::set_file_list(paths)
}

#[cfg(all(not(target_os = "windows"), not(target_os = "linux")))]
fn raw_set_file_list_with_marker(_paths: &[&str]) -> Result<(), String> {
    Err("file copy back not supported on this platform".to_string())
}

pub fn copy_to_clipboard(
    content: &str,
    content_type: &crate::database::types::ContentType,
    metadata: Option<&str>,
) -> Result<(), crate::AppError> {
    let result = match content_type {
        crate::database::types::ContentType::Text => raw_set_text_with_marker(content),
        crate::database::types::ContentType::Image => {
            let png_data = if let Some(stripped) = content.strip_prefix("data:image/png;base64,") {
                base64::engine::general_purpose::STANDARD
                    .decode(stripped)
                    .map_err(|e| e.to_string())?
            } else {
                content.as_bytes().to_vec()
            };
            raw_set_image_with_marker(&png_data, metadata)
        }
        crate::database::types::ContentType::File => {
            let paths: Vec<String> = serde_json::from_str(content)
                .map_err(|e| format!("invalid file path JSON: {}", e))?;
            let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
            raw_set_file_list_with_marker(&path_refs)
        }
    };
    result.map_err(crate::AppError::Clipboard)
}
