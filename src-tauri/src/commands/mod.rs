pub mod auth;
pub mod config;
pub mod dictionary;
pub mod hotkey;
pub mod sync;
pub mod translation;
pub mod tts;
pub mod wordbook;

#[tauri::command]
pub fn consume_pending_translation(
    state: tauri::State<'_, crate::PendingTranslation>,
) -> Option<String> {
    let mut guard = state.text.lock().ok()?;
    guard.take()
}
