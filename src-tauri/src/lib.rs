mod account_sync;
mod commands;
mod database;
mod hotkey;
mod tray;

use database::Database;
use std::process::Child;
use std::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub db: Mutex<Database>,
}

pub struct PendingTranslation {
    pub text: Mutex<Option<String>>,
}

pub struct SpeechState {
    pub process: Mutex<Option<Child>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = match Database::new() {
        Ok(database) => database,
        Err(error) => {
            eprintln!("[Abandon] database init failed: {}", error);
            return;
        }
    };

    let app = tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(hotkey::global_shortcut_handler)
                .build(),
        )
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            db: Mutex::new(db),
        })
        .manage(PendingTranslation {
            text: Mutex::new(None),
        })
        .manage(SpeechState {
            process: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            commands::translation::translate_text,
            commands::translation::analyze_sentence,
            commands::translation::get_word_info,
            commands::dictionary::lookup_word,
            commands::wordbook::add_word,
            commands::wordbook::remove_word,
            commands::wordbook::list_words,
            commands::wordbook::search_words,
            commands::wordbook::is_word_saved,
            commands::wordbook::update_word_familiarity,
            commands::wordbook::get_words_by_date,
            commands::wordbook::get_today_word_count,
            commands::tts::speak_text,
            commands::tts::stop_speech,
            commands::tts::play_british_pronunciation,
            commands::hotkey::get_selected_text,
            commands::config::get_config,
            commands::config::get_runtime_paths,
            commands::config::set_config,
            commands::auth::register_user,
            commands::auth::login_user,
            commands::auth::logout_user,
            commands::auth::get_current_user,
            commands::sync::sync_now,
            commands::consume_pending_translation,
        ])
        .setup(|app| {
            if let Err(error) = hotkey::register_shortcuts(app) {
                eprintln!("[Abandon] shortcut registration failed: {}", error);
            }
            if let Err(error) = tray::setup(app) {
                eprintln!("[Abandon] tray setup failed: {}", error);
            }
            Ok(())
        })
        .build(tauri::generate_context!());

    let app = match app {
        Ok(app) => app,
        Err(error) => {
            eprintln!("[Abandon] app build failed: {}", error);
            return;
        }
    };

    app.run(|_, _| {});
}
