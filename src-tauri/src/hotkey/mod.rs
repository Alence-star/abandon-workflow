#[cfg(target_os = "macos")]
use std::ffi::CStr;
#[cfg(target_os = "macos")]
use std::io::Write;
#[cfg(target_os = "macos")]
use std::os::raw::c_char;
use std::process::{Command, Stdio};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

use crate::{HotkeyState, PendingTranslation};

const SHORTCUT_RELEASE_DELAY: Duration = Duration::from_millis(260);
const RETRY_SHORTCUT_RELEASE_DELAY: Duration = Duration::from_millis(420);
const COPY_RETRY_DELAY: Duration = Duration::from_millis(220);
const TRANSLATE_SHORTCUT_DEBOUNCE: Duration = Duration::from_millis(900);
const CLIPBOARD_POLL_INTERVAL: Duration = Duration::from_millis(90);
const CLIPBOARD_STABLE_DELAY: Duration = Duration::from_millis(360);
const CLIPBOARD_MIN_SETTLE_TIME: Duration = Duration::from_millis(650);
const CLIPBOARD_CAPTURE_TIMEOUT: Duration = Duration::from_millis(2500);

#[cfg(target_os = "macos")]
type CFStringRef = *const std::ffi::c_void;
#[cfg(target_os = "macos")]
type CFAllocatorRef = *const std::ffi::c_void;
#[cfg(target_os = "macos")]
type CFTypeRef = *const std::ffi::c_void;
#[cfg(target_os = "macos")]
type AXUIElementRef = CFTypeRef;

#[cfg(target_os = "macos")]
const K_CF_ALLOCATOR_DEFAULT: CFAllocatorRef = std::ptr::null();
#[cfg(target_os = "macos")]
const K_CF_STRING_ENCODING_UTF8: u32 = 0x08000100;
#[cfg(target_os = "macos")]
const K_AX_ERROR_API_DISABLED: i32 = -25211;

#[cfg(target_os = "macos")]
#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> i32;
    fn CFStringCreateWithCString(
        alloc: CFAllocatorRef,
        c_str: *const c_char,
        encoding: u32,
    ) -> CFStringRef;
    fn CFStringGetLength(the_string: CFStringRef) -> isize;
    fn CFStringGetCString(
        the_string: CFStringRef,
        buffer: *mut c_char,
        buffer_size: isize,
        encoding: u32,
    ) -> u8;
    fn CFRelease(cf: CFTypeRef);
}

#[cfg(target_os = "macos")]
unsafe fn copy_attribute_value(
    element: AXUIElementRef,
    attribute_name: &'static [u8],
) -> Result<CFTypeRef, i32> {
    let attribute = CFStringCreateWithCString(
        K_CF_ALLOCATOR_DEFAULT,
        attribute_name.as_ptr() as *const c_char,
        K_CF_STRING_ENCODING_UTF8,
    );
    if attribute.is_null() {
        return Err(-99998);
    }

    let mut value: CFTypeRef = std::ptr::null();
    let result = AXUIElementCopyAttributeValue(element, attribute, &mut value);
    CFRelease(attribute);

    if result != 0 || value.is_null() {
        Err(result)
    } else {
        Ok(value)
    }
}

#[cfg(target_os = "macos")]
unsafe fn cfstring_to_string(value: CFTypeRef) -> Option<String> {
    let length = CFStringGetLength(value);
    if length <= 0 {
        return None;
    }

    let utf8_len = length * 4 + 1;
    let mut buffer: Vec<u8> = vec![0u8; utf8_len as usize];
    let success = CFStringGetCString(
        value,
        buffer.as_mut_ptr() as *mut c_char,
        utf8_len,
        K_CF_STRING_ENCODING_UTF8,
    );

    if success == 0 {
        return None;
    }

    let text = CStr::from_ptr(buffer.as_ptr() as *const c_char)
        .to_string_lossy()
        .trim()
        .to_string();

    (!text.is_empty()).then_some(text)
}

#[cfg(target_os = "macos")]
unsafe fn read_string_attribute(
    element: AXUIElementRef,
    attribute_name: &'static [u8],
) -> Result<Option<String>, i32> {
    let value = copy_attribute_value(element, attribute_name)?;
    let text = cfstring_to_string(value);
    CFRelease(value);
    Ok(text)
}

#[cfg(target_os = "macos")]
fn get_selected_text_ax_direct() -> (Option<String>, i32) {
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return (None, -99999);
        }

        let focused_app = match copy_attribute_value(system_wide, b"AXFocusedApplication\0") {
            Ok(value) => value,
            Err(code) => {
                CFRelease(system_wide);
                return (None, code);
            }
        };

        let mut last_error = 0;
        let focused_element =
            match copy_attribute_value(focused_app as AXUIElementRef, b"AXFocusedUIElement\0") {
                Ok(value) => Some(value),
                Err(code) => {
                    last_error = code;
                    None
                }
            };

        if let Some(element) = focused_element {
            match read_string_attribute(element as AXUIElementRef, b"AXSelectedText\0") {
                Ok(Some(text)) => {
                    CFRelease(element);
                    CFRelease(focused_app);
                    CFRelease(system_wide);
                    return (Some(text), 0);
                }
                Ok(None) => {}
                Err(code) => last_error = code,
            }

            CFRelease(element);
        }

        match read_string_attribute(focused_app as AXUIElementRef, b"AXSelectedText\0") {
            Ok(Some(text)) => {
                CFRelease(focused_app);
                CFRelease(system_wide);
                return (Some(text), 0);
            }
            Ok(None) => {}
            Err(code) => {
                if last_error == 0 {
                    last_error = code;
                }
            }
        }

        CFRelease(focused_app);
        CFRelease(system_wide);

        (None, if last_error != 0 { last_error } else { -99994 })
    }
}

fn store_text(handle: &tauri::AppHandle, text: String) {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return;
    }

    let state = handle.state::<PendingTranslation>();
    if let Ok(mut guard) = state.text.lock() {
        *guard = Some(trimmed);
    };
}

fn show_main_window(handle: &tauri::AppHandle) {
    if let Some(window) = handle.get_webview_window("main") {
        let _ = window.show();
        thread::sleep(Duration::from_millis(120));
        let _ = window.set_focus();
    }
}

fn read_clipboard_text(handle: &tauri::AppHandle) -> String {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("pbpaste");
        command.env_clear();
        command.env("LANG", "en_US.UTF-8");
        command.env("LC_ALL", "en_US.UTF-8");
        command.stdout(Stdio::piped());
        command.stderr(Stdio::null());

        if let Ok(output) = command.output() {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !text.is_empty() {
                    return text;
                }
            }
        }
    }

    handle
        .clipboard()
        .read_text()
        .unwrap_or_default()
        .trim()
        .to_string()
}

fn write_clipboard_text(handle: &tauri::AppHandle, text: &str) {
    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("pbcopy");
        command.env_clear();
        command.env("LANG", "en_US.UTF-8");
        command.env("LC_ALL", "en_US.UTF-8");
        command.stdin(Stdio::piped());
        command.stdout(Stdio::null());
        command.stderr(Stdio::null());

        if let Ok(mut child) = command.spawn() {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(text.as_bytes());
            }
            let _ = child.wait();
        }
    }

    let _ = handle.clipboard().write_text(text.to_string());
}

fn restore_clipboard(handle: &tauri::AppHandle, original: &str) {
    write_clipboard_text(handle, original);
}

fn make_clipboard_marker() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();

    format!("__ABANDON_SELECTION_MARKER__{}__", timestamp)
}

fn is_captured_clipboard_text(current: &str, clipboard_marker: &str) -> bool {
    !current.is_empty() && current != clipboard_marker.trim()
}

fn wait_for_stable_copied_text(handle: &tauri::AppHandle, clipboard_marker: &str) -> String {
    let started_at = Instant::now();
    let mut candidate = String::new();
    let mut candidate_changed_at: Option<Instant> = None;

    while started_at.elapsed() < CLIPBOARD_CAPTURE_TIMEOUT {
        let current = read_clipboard_text(handle);

        if is_captured_clipboard_text(&current, clipboard_marker) {
            if current != candidate {
                candidate = current;
                candidate_changed_at = Some(Instant::now());
            } else if candidate_changed_at
                .map(|changed_at| changed_at.elapsed() >= CLIPBOARD_STABLE_DELAY)
                .unwrap_or(false)
                && started_at.elapsed() >= CLIPBOARD_MIN_SETTLE_TIME
            {
                return candidate;
            }
        }

        thread::sleep(CLIPBOARD_POLL_INTERVAL);
    }

    candidate
}

fn capture_selection_via_clipboard(handle: &tauri::AppHandle, release_delay: Duration) -> String {
    let clipboard_marker = make_clipboard_marker();
    write_clipboard_text(handle, &clipboard_marker);
    thread::sleep(release_delay);
    copy_selection();
    wait_for_stable_copied_text(handle, &clipboard_marker)
}

struct TranslateCaptureGuard {
    handle: tauri::AppHandle,
}

impl Drop for TranslateCaptureGuard {
    fn drop(&mut self) {
        let state = self.handle.state::<HotkeyState>();
        state
            .translate_in_progress
            .store(false, Ordering::SeqCst);
    }
}

fn begin_translate_capture(handle: &tauri::AppHandle) -> Option<TranslateCaptureGuard> {
    let state = handle.state::<HotkeyState>();
    let now = Instant::now();

    if let Ok(last_started_at) = state.last_translate_started_at.lock() {
        if let Some(last_started_at) = *last_started_at {
            if now.duration_since(last_started_at) < TRANSLATE_SHORTCUT_DEBOUNCE {
                return None;
            }
        }
    }

    if state
        .translate_in_progress
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return None;
    }

    if let Ok(mut last_started_at) = state.last_translate_started_at.lock() {
        *last_started_at = Some(now);
    }

    Some(TranslateCaptureGuard {
        handle: handle.clone(),
    })
}

fn copy_selection() {
    #[cfg(target_os = "macos")]
    {
        let front_app_script = r###"tell application "System Events"
    set frontApp to name of first application process whose frontmost is true
end tell
return frontApp"###;

        let front_app = Command::new("osascript")
            .args(["-e", front_app_script])
            .output()
            .ok()
            .and_then(|output| output.status.success().then_some(output))
            .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
            .unwrap_or_default();

        if !front_app.is_empty() {
            let activate_script = format!("tell application \"{}\" to activate", front_app);
            let _ = Command::new("osascript")
                .args(["-e", &activate_script])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status();
            thread::sleep(Duration::from_millis(180));
        }

        for _ in 0..3 {
            let applescript = Command::new("osascript")
                .args([
                    "-e",
                    "tell application \"System Events\" to keystroke \"c\" using command down",
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|status| status.success())
                .unwrap_or(false);

            if applescript {
                thread::sleep(Duration::from_millis(180));
                return;
            }

            let javascript = Command::new("osascript")
                .args([
                    "-l",
                    "JavaScript",
                    "-e",
                    "Application('System Events').keystroke('c', { using: 'command down' })",
                ])
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .status()
                .map(|status| status.success())
                .unwrap_or(false);

            if javascript {
                thread::sleep(Duration::from_millis(180));
                return;
            }

            thread::sleep(Duration::from_millis(110));
        }
    }

    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("powershell")
            .args([
                "-NoProfile",
                "-STA",
                "-WindowStyle",
                "Hidden",
                "-Command",
                "Add-Type -AssemblyName System.Windows.Forms; 1..3 | ForEach-Object { [System.Windows.Forms.SendKeys]::SendWait('^c'); Start-Sleep -Milliseconds 70 }",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
}

pub fn capture_selected_text(handle: &tauri::AppHandle) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    let mut accessibility_denied = false;

    #[cfg(target_os = "macos")]
    {
        let (text, error_code) = get_selected_text_ax_direct();
        if let Some(text) = text {
            return Ok(text);
        }

        accessibility_denied = error_code == K_AX_ERROR_API_DISABLED;
        if accessibility_denied {
            eprintln!(
                "[Abandon] Accessibility permission not granted, falling back to clipboard capture"
            );
        }
    }

    let original_clipboard = read_clipboard_text(handle);
    let mut copied_text = capture_selection_via_clipboard(handle, SHORTCUT_RELEASE_DELAY);

    if copied_text.is_empty() {
        thread::sleep(COPY_RETRY_DELAY);
        copied_text = capture_selection_via_clipboard(handle, RETRY_SHORTCUT_RELEASE_DELAY);
    }

    restore_clipboard(handle, &original_clipboard);

    if !copied_text.is_empty() {
        return Ok(copied_text);
    }

    #[cfg(target_os = "macos")]
    if accessibility_denied {
        return Err(
            "未读取到选中文本。请先确认已经选中文本，并在系统设置 > 隐私与安全性 > 辅助功能中允许 Abandon。"
                .into(),
        );
    }

    Err("未读取到选中文本，请先确认已经选中文本后再按 Ctrl/Cmd+Shift+T。".into())
}

pub fn global_shortcut_handler(
    app_handle: &tauri::AppHandle,
    shortcut: &Shortcut,
    event: tauri_plugin_global_shortcut::ShortcutEvent,
) {
    if event.state != tauri_plugin_global_shortcut::ShortcutState::Pressed {
        return;
    }

    #[cfg(target_os = "macos")]
    let modifiers = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let modifiers = Modifiers::CONTROL | Modifiers::SHIFT;

    let translate_shortcut = Shortcut::new(Some(modifiers), Code::KeyT);
    let toggle_shortcut = Shortcut::new(Some(modifiers), Code::KeyY);

    if shortcut == &translate_shortcut {
        let handle = app_handle.clone();
        let Some(_capture_guard) = begin_translate_capture(&handle) else {
            return;
        };

        thread::spawn(move || {
            let _capture_guard = _capture_guard;

            match capture_selected_text(&handle) {
                Ok(text) => {
                    store_text(&handle, text);
                    show_main_window(&handle);
                }
                Err(error) => {
                    store_text(&handle, format!("!error:{}", error));
                    show_main_window(&handle);
                }
            }
        });
        return;
    }

    if shortcut == &toggle_shortcut {
        if let Some(window) = app_handle.get_webview_window("main") {
            if window.is_visible().unwrap_or(false) {
                let _ = window.hide();
            } else {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    }
}

pub fn register_shortcuts(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    #[cfg(target_os = "macos")]
    let modifiers = Modifiers::SUPER | Modifiers::SHIFT;
    #[cfg(not(target_os = "macos"))]
    let modifiers = Modifiers::CONTROL | Modifiers::SHIFT;

    let shortcuts = app.global_shortcut();
    shortcuts.register(Shortcut::new(Some(modifiers), Code::KeyT))?;
    shortcuts.register(Shortcut::new(Some(modifiers), Code::KeyY))?;

    Ok(())
}
