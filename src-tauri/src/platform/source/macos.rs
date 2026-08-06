use super::ClipboardSource;
use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use objc2_app_kit::NSWorkspace;
use std::ptr;
use std::sync::Once;

type AXError = i32;
type AXUIElementRef = CFTypeRef;
type ProcessId = i32;

const AX_ERROR_SUCCESS: AXError = 0;
static ACCESSIBILITY_NOTICE: Once = Once::new();

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXUIElementCreateApplication(pid: ProcessId) -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;

    static kAXFocusedWindowAttribute: CFStringRef;
    static kAXTitleAttribute: CFStringRef;
}

pub(super) fn current() -> ClipboardSource {
    let workspace = NSWorkspace::sharedWorkspace();
    let Some(application) = workspace.frontmostApplication() else {
        return ClipboardSource::default();
    };

    let application_name = application
        .localizedName()
        .or_else(|| application.bundleIdentifier())
        .map(|name| name.to_string());
    let pid = application.processIdentifier();
    let window_title = if pid > 0 {
        accessibility_window_title(pid)
    } else {
        None
    };

    ClipboardSource::new(application_name, window_title)
}

fn accessibility_window_title(pid: ProcessId) -> Option<String> {
    if unsafe { AXIsProcessTrusted() } == 0 {
        ACCESSIBILITY_NOTICE.call_once(|| {
            tracing::warn!(
                "macOS Accessibility permission is not granted; clipboard source application names remain available but window titles are omitted"
            );
        });
        return None;
    }

    unsafe {
        let application = AXUIElementCreateApplication(pid);
        if application.is_null() {
            return None;
        }
        let application = CFType::wrap_under_create_rule(application);
        let focused_window =
            copy_attribute(application.as_concrete_TypeRef(), kAXFocusedWindowAttribute)?;
        let title = copy_attribute(focused_window.as_concrete_TypeRef(), kAXTitleAttribute)?;
        title.downcast::<CFString>().map(|title| title.to_string())
    }
}

unsafe fn copy_attribute(element: CFTypeRef, attribute: CFStringRef) -> Option<CFType> {
    let mut value = ptr::null();
    if AXUIElementCopyAttributeValue(element, attribute, &mut value) != AX_ERROR_SUCCESS
        || value.is_null()
    {
        return None;
    }
    Some(CFType::wrap_under_create_rule(value))
}
