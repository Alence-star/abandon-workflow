use crate::{account_sync, commands::config, AppState};
use chrono::Datelike;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordbookEntry {
    pub id: i64,
    pub word: String,
    pub translation: String,
    pub notes: Option<String>,
    pub phonetic: Option<String>,
    pub collocations: Option<String>,
    pub memory_trick: Option<String>,
    pub familiarity: i64,
    pub created_at: String,
}

impl From<&rusqlite::Row<'_>> for WordbookEntry {
    fn from(row: &rusqlite::Row) -> Self {
        Self {
            id: row.get(0).unwrap_or(0),
            word: row.get(1).unwrap_or_default(),
            translation: row.get(2).unwrap_or_default(),
            notes: row.get(3).ok().or(None),
            phonetic: row.get(4).ok().or(None),
            collocations: row.get(5).ok().or(None),
            memory_trick: row.get(6).ok().or(None),
            familiarity: row.get(7).unwrap_or(0),
            created_at: row.get(8).unwrap_or_default(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddWordRequest {
    pub word: String,
    pub translation: String,
    pub phonetic: Option<String>,
    pub collocations: Option<String>,
    pub memory_trick: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DateGroup {
    pub label: String,
    pub count: i64,
    pub words: Vec<WordbookEntry>,
}

fn active_scope_user_id(conn: &rusqlite::Connection) -> Result<i64, String> {
    config::get_current_user_id(conn)
        .map(|user_id| user_id.unwrap_or(0))
        .map_err(|e| format!("读取账号作用域失败: {}", e))
}

fn load_entries_for_user(
    conn: &rusqlite::Connection,
    user_id: i64,
) -> Result<Vec<WordbookEntry>, String> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT id, word, translation, notes, phonetic, collocations, memory_trick, familiarity, created_at
             FROM wordbook
             WHERE user_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map(rusqlite::params![user_id], |row| Ok(WordbookEntry::from(row)))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect::<Vec<_>>();

    Ok(entries)
}

#[tauri::command]
pub async fn add_word(
    request: AddWordRequest,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;

    db.conn()
        .execute(
            "INSERT OR REPLACE INTO wordbook
             (user_id, word, translation, phonetic, collocations, memory_trick, notes)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                user_id,
                request.word.trim(),
                request.translation,
                request.phonetic,
                request.collocations,
                request.memory_trick,
                request.notes,
            ],
        )
        .map_err(|e| format!("Failed to add word: {}", e))?;

    if user_id > 0 {
        let _ = account_sync::push_current_user_snapshot(db.conn());
    }

    Ok(())
}

#[tauri::command]
pub async fn remove_word(word: String, state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;

    db.conn()
        .execute(
            "DELETE FROM wordbook WHERE user_id = ?1 AND word = ?2 COLLATE NOCASE",
            rusqlite::params![user_id, word.trim()],
        )
        .map_err(|e| format!("Failed to remove word: {}", e))?;

    if user_id > 0 {
        let _ = account_sync::push_current_user_snapshot(db.conn());
    }

    Ok(())
}

#[tauri::command]
pub async fn update_word_familiarity(
    word: String,
    familiarity: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;

    let affected = db
        .conn()
        .execute(
            "UPDATE wordbook SET familiarity = ?1 WHERE user_id = ?2 AND word = ?3 COLLATE NOCASE",
            rusqlite::params![familiarity, user_id, word.trim()],
        )
        .map_err(|e| format!("Failed to update familiarity: {}", e))?;

    if affected == 0 {
        return Err("Word not found in wordbook".into());
    }

    if user_id > 0 {
        let _ = account_sync::push_current_user_snapshot(db.conn());
    }

    Ok(())
}

#[tauri::command]
pub async fn list_words(state: State<'_, AppState>) -> Result<Vec<WordbookEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;
    load_entries_for_user(db.conn(), user_id)
}

#[tauri::command]
pub async fn search_words(
    query: String,
    state: State<'_, AppState>,
) -> Result<Vec<WordbookEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;
    let pattern = format!("%{}%", query.trim());
    let mut stmt = db
        .conn()
        .prepare_cached(
            "SELECT id, word, translation, notes, phonetic, collocations, memory_trick, familiarity, created_at
             FROM wordbook
             WHERE user_id = ?1 AND (word LIKE ?2 OR translation LIKE ?2)
             ORDER BY
               CASE WHEN word LIKE ?2 THEN 0 ELSE 1 END,
               word",
        )
        .map_err(|e| e.to_string())?;

    let entries = stmt
        .query_map(rusqlite::params![user_id, pattern], |row| Ok(WordbookEntry::from(row)))
        .map_err(|e| e.to_string())?
        .filter_map(|row| row.ok())
        .collect();

    Ok(entries)
}

#[tauri::command]
pub async fn is_word_saved(word: String, state: State<'_, AppState>) -> Result<bool, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;

    let result: bool = db
        .conn()
        .query_row(
            "SELECT COUNT(*) > 0 FROM wordbook WHERE user_id = ?1 AND word = ?2 COLLATE NOCASE",
            rusqlite::params![user_id, word.trim()],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(result)
}

#[tauri::command]
pub async fn get_words_by_date(state: State<'_, AppState>) -> Result<Vec<DateGroup>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;
    let entries = load_entries_for_user(db.conn(), user_id)?;

    let today = chrono::Local::now().date_naive();
    let yesterday = today - chrono::Duration::days(1);
    let week_start =
        today - chrono::Duration::days(today.weekday().num_days_from_monday() as i64);
    let month_start =
        chrono::NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap_or(today);

    let mut groups: Vec<DateGroup> = Vec::new();
    let mut today_words = Vec::new();
    let mut yesterday_words = Vec::new();
    let mut week_words = Vec::new();
    let mut month_words = Vec::new();
    let mut earlier_words = Vec::new();

    for entry in entries {
        if let Ok(date) = chrono::NaiveDate::parse_from_str(&entry.created_at[..10], "%Y-%m-%d") {
            if date == today {
                today_words.push(entry);
            } else if date == yesterday {
                yesterday_words.push(entry);
            } else if date >= week_start && date < today {
                week_words.push(entry);
            } else if date >= month_start && date < week_start {
                month_words.push(entry);
            } else {
                earlier_words.push(entry);
            }
        } else {
            earlier_words.push(entry);
        }
    }

    if !today_words.is_empty() {
        groups.push(DateGroup {
            label: "今天".into(),
            count: today_words.len() as i64,
            words: today_words,
        });
    }
    if !yesterday_words.is_empty() {
        groups.push(DateGroup {
            label: "昨天".into(),
            count: yesterday_words.len() as i64,
            words: yesterday_words,
        });
    }
    if !week_words.is_empty() {
        groups.push(DateGroup {
            label: "本周".into(),
            count: week_words.len() as i64,
            words: week_words,
        });
    }
    if !month_words.is_empty() {
        groups.push(DateGroup {
            label: "本月".into(),
            count: month_words.len() as i64,
            words: month_words,
        });
    }
    if !earlier_words.is_empty() {
        groups.push(DateGroup {
            label: "更早".into(),
            count: earlier_words.len() as i64,
            words: earlier_words,
        });
    }

    Ok(groups)
}

#[tauri::command]
pub async fn get_today_word_count(state: State<'_, AppState>) -> Result<i64, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let user_id = active_scope_user_id(db.conn())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let count: i64 = db
        .conn()
        .query_row(
            "SELECT COUNT(*) FROM wordbook WHERE user_id = ?1 AND date(created_at) = ?2",
            rusqlite::params![user_id, today],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(count)
}
