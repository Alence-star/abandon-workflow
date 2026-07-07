#[cfg(target_os = "macos")]
use std::ffi::CStr;
#[cfg(target_os = "macos")]
use std::os::raw::c_char;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut};

use crate::PendingTranslation;

const SHORTCUT_RELEASE_DELAY: Duration = Duration::from_millis(120);
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
fn get_selected_text_ax_direct() -> (Option<String>, i32) {
    unsafe {
        let system_wide = AXUIElementCreateSystemWide();
        if system_wide.is_null() {
            return (None, -99999);
        }

        let attr_focused_app = CFStringCreateWithCString(
            K_CF_ALLOCATOR_DEFAULT,
            b"AXFocusedApplication\0".as_ptr() as *const c_char,
            K_CF_STRING_ENCODING_UTF8,
        );
        if attr_focused_app.is_null() {
            CFRelease(system_wide);
            return (None, -99998);
        }

        let mut focused_app: CFTypeRef = std::ptr::null();
        let focused_app_result =
            AXUIElementCopyAttributeValue(system_wide, attr_focused_app, &mut focused_app);
        CFRelease(attr_focused_app);

        if focused_app_result != 0 || focused_app.is_null() {
            CFRelease(system_wide);
            return (None, focused_app_result);
        }

        let attr_selected_text = CFStringCreateWithCString(
            K_CF_ALLOCATOR_DEFAULT,
            b"AXSelectedText\0".as_ptr() as *const c_char,
            K_CF_STRING_ENCODING_UTF8,
        );
        if attr_selected_text.is_null() {
            CFRelease(focused_app);
            CFRelease(system_wide);
            return (None, -99997);
        }

        let mut selected_text: CFTypeRef = std::ptr::null();
        let selected_text_result =
            AXUIElementCopyAttributeValue(focused_app, attr_selected_text, &mut selected_text);
        CFRelease(attr_selected_text);
        CFRelease(focused_app);
        CFRelease(system_wide);

        if selected_text_result != 0 || selected_text.is_null() {
            return (None, selected_text_result);
        }

        let length = CFStringGetLength(selected_text);
        if length <= 0 {
            CFRelease(selected_text);
            return (None, -99996);
        }

        let utf8_len = length * 4 + 1;
        let mut buffer: Vec<u8> = vec![0u8; utf8_len as usize];
        let success = CFStringGetCString(
            selected_text,
            buffer.as_mut_ptr() as *mut c_char,
            utf8_len,
            K_CF_STRING_ENCODING_UTF8,
        );
        CFRelease(selected_text);

        if success == 0 {
            return (None, -99995);
        }

        let result = CStr::from_ptr(buffer.as_ptr() as *const c_char)
            .to_string_lossy()
            .trim()
            .to_string();
        if result.is_empty() {
            return (None, -99994);
        }

        (Some(result), 0)
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

fn restore_clipboard(handle: &tauri::AppHandle, original: &str) {
    let _ = handle.clipboard().write_text(original.to_string());
}

fn is_new_clipboard_text(current: &str, previous_clipboard: &str) -> bool {
    !current.is_empty()
        && (previous_clipboard.trim().is_empty() || current != previous_clipboard.trim())
}

fn wait_for_stable_copied_text(handle: &tauri::AppHandle, previous_clipboard: &str) -> String {
    let started_at = Instant::now();
    let mut candidate = String::new();
    let mut candidate_changed_at: Option<Instant> = None;

    while started_at.elapsed() < CLIPBOARD_CAPTURE_TIMEOUT {
        let current = read_clipboard_text(handle);

        if is_new_clipboard_text(&current, previous_clipboard) {
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
        } else if !candidate.is_empty()
            && candidate_changed_at
                .map(|changed_at| changed_at.elapsed() >= CLIPBOARD_STABLE_DELAY)
                .unwrap_or(false)
            && started_at.elapsed() >= CLIPBOARD_MIN_SETTLE_TIME
        {
            return candidate;
        }

        thread::sleep(CLIPBOARD_POLL_INTERVAL);
    }

    candidate
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

        let _ = Command::new("osascript")
            .args([
                "-e",
                "tell application \"System Events\" to keystroke \"c\" using command down",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
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
    {
        let (text, error_code) = get_selected_text_ax_direct();
        if let Some(text) = text {
            return Ok(text);
        }
        if error_code == K_AX_ERROR_API_DISABLED {
            eprintln!("[Abandon] Accessibility permission not granted, falling back to clipboard capture");
        }
    }

    let original_clipboard = read_clipboard_text(handle);
    thread::sleep(SHORTCUT_RELEASE_DELAY);
    copy_selection();

    let copied_text = wait_for_stable_copied_text(handle, &original_clipboard);
    restore_clipboard(handle, &original_clipboard);

    if !copied_text.is_empty() {
        return Ok(copied_text);
    }

    if !original_clipboard.trim().is_empty() {
        return Ok(original_clipboard);
    }

    Err("未读取到选中文本，请先选中文本后再按 Ctrl/Cmd+Shift+T。".into())
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
        thread::spawn(move || {
            match capture_selected_text(&handle) {
                Ok(text) => {
                    show_main_window(&handle);
                    store_text(&handle, text);
                }
                Err(error) => {
                    show_main_window(&handle);
                    store_text(&handle, format!("!error:{}", error));
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
