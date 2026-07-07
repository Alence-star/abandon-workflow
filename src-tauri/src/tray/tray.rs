use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

use crate::PendingTranslation;

pub fn setup(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item =
        MenuItem::with_id(app, "show", "显示/隐藏", true, None::<&str>)?;
    let wordbook_item =
        MenuItem::with_id(app, "wordbook", "生词本", true, None::<&str>)?;
    let learning_item =
        MenuItem::with_id(app, "learning", "已学单词", true, None::<&str>)?;
    let settings_item =
        MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "退出", true, Some("Cmd+Q"))?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &wordbook_item,
            &learning_item,
            &settings_item,
            &separator,
            &quit_item,
        ],
    )?;

    let icon = app.default_window_icon().cloned();

    let mut builder = TrayIconBuilder::new().menu(&menu);

    if let Some(icon) = icon {
        builder = builder.icon(icon);
    }

    builder
        .on_menu_event(move |app_handle, event| {
            let pending = app_handle.state::<PendingTranslation>();
            match event.id().as_ref() {
                "show" => {
                    let window = app_handle.get_webview_window("main");
                    if let Some(ref w) = window {
                        if w.is_visible().unwrap_or(false) {
                            let _ = w.hide();
                            return;
                        }
                    }
                    match pending.text.lock() {
                        Ok(mut guard) => *guard = Some("!toggle".to_string()),
                        Err(_) => {}
                    }
                    if let Some(w) = window {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "wordbook" => {
                    match pending.text.lock() {
                        Ok(mut guard) => *guard = Some("!wordbook".to_string()),
                        Err(_) => {}
                    }
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "learning" => {
                    match pending.text.lock() {
                        Ok(mut guard) => *guard = Some("!learning".to_string()),
                        Err(_) => {}
                    }
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "settings" => {
                    match pending.text.lock() {
                        Ok(mut guard) => *guard = Some("!settings".to_string()),
                        Err(_) => {}
                    }
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app_handle.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray_icon, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray_icon.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}
