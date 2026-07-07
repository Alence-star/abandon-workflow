/// Capture the current selection using the same logic as the global hotkey.
#[tauri::command]
pub async fn get_selected_text(app: tauri::AppHandle) -> Result<String, String> {
    crate::hotkey::capture_selected_text(&app)
}
