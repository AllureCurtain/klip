use super::ClipboardSource;

pub(super) fn current() -> ClipboardSource {
    use windows::core::PWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
    };

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return ClipboardSource::default();
        }

        let title = {
            let len = GetWindowTextLengthW(hwnd);
            if len > 0 {
                let mut buffer = vec![0u16; len as usize + 1];
                let copied = GetWindowTextW(hwnd, &mut buffer);
                if copied > 0 {
                    Some(String::from_utf16_lossy(&buffer[..copied as usize]))
                } else {
                    None
                }
            } else {
                None
            }
        };

        let mut pid = 0u32;
        let _ = GetWindowThreadProcessId(hwnd, Some(&mut pid));
        let process_name = if pid > 0 {
            OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid)
                .ok()
                .and_then(|handle| {
                    let mut buffer = vec![0u16; 32768];
                    let mut len = buffer.len() as u32;
                    let result = QueryFullProcessImageNameW(
                        handle,
                        PROCESS_NAME_WIN32,
                        PWSTR::from_raw(buffer.as_mut_ptr()),
                        &mut len,
                    );
                    let _ = CloseHandle(handle);
                    result.ok().and_then(|_| {
                        let path = String::from_utf16_lossy(&buffer[..len as usize]);
                        std::path::Path::new(&path)
                            .file_name()
                            .and_then(|name| name.to_str())
                            .map(|name| name.to_string())
                    })
                })
        } else {
            None
        };

        ClipboardSource::new(process_name, title)
    }
}
