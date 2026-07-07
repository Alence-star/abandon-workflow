/// Capture the current selection using the same logic as the global hotkey.
#[tauri::command]
pub async fn get_selected_text(app: tauri::AppHandle) -> Result<String, String> {
    crate::hotkey::capture_selected_text(&app).map_err(|_| {
        "未读取到可用文本，请先复制内容，或直接使用 Ctrl/Cmd+Shift+T 翻译外部选中文本。"
            .to_string()
    })
}
