use crate::{account_sync, AppState};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

pub const CURRENT_USER_KEY: &str = "current_user_id";
pub const SYNC_DIR_KEY: &str = "sync_dir";

#[derive(Debug, Serialize)]
pub struct RuntimePaths {
    pub data_dir: String,
    pub database_path: String,
    pub sync_dir: Option<String>,
    pub sync_file_path: Option<String>,
}

fn is_global_only_key(key: &str) -> bool {
    matches!(key, CURRENT_USER_KEY | SYNC_DIR_KEY)
}

pub fn get_global_config_value(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM config WHERE key = ?1",
        params![key],
        |row| row.get::<_, String>(0),
    )
    .optional()
}

pub fn set_global_config_value(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO config (key, value, updated_at)
         VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
        params![key, value],
    )?;
    Ok(())
}

pub fn remove_global_config_value(conn: &Connection, key: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM config WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn get_current_user_id(conn: &Connection) -> rusqlite::Result<Option<i64>> {
    Ok(get_global_config_value(conn, CURRENT_USER_KEY)?
        .and_then(|value| value.parse::<i64>().ok()))
}

pub fn get_effective_config_value(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    if is_global_only_key(key) {
        return get_global_config_value(conn, key);
    }

    if let Some(user_id) = get_current_user_id(conn)? {
        let scoped_value = conn
            .query_row(
                "SELECT value FROM user_config WHERE user_id = ?1 AND key = ?2",
                params![user_id, key],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if scoped_value.is_some() {
            return Ok(scoped_value);
        }
    }

    get_global_config_value(conn, key)
}

pub fn set_effective_config_value(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    if is_global_only_key(key) {
        return set_global_config_value(conn, key, value);
    }

    if let Some(user_id) = get_current_user_id(conn)? {
        conn.execute(
            "INSERT INTO user_config (user_id, key, value, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(user_id, key)
             DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            params![user_id, key, value],
        )?;
        return Ok(());
    }

    set_global_config_value(conn, key, value)
}

#[tauri::command]
pub async fn get_config(key: String, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    get_effective_config_value(db.conn(), &key).map_err(|e| format!("读取配置失败: {}", e))
}

#[tauri::command]
pub async fn set_config(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    set_effective_config_value(db.conn(), &key, &value)
        .map_err(|e| format!("保存配置失败: {}", e))?;

    if key == SYNC_DIR_KEY {
        account_sync::push_current_user_snapshot(db.conn())?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_runtime_paths(state: State<'_, AppState>) -> Result<RuntimePaths, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let database_path = db.path().to_string_lossy().to_string();
    let data_dir = db
        .path()
        .parent()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_else(|| database_path.clone());
    let sync_dir = get_global_config_value(db.conn(), SYNC_DIR_KEY)
        .map_err(|e| format!("读取同步目录失败: {}", e))?;
    let sync_file_path = account_sync::resolve_current_user_sync_file(db.conn())?
        .map(|path| path.to_string_lossy().to_string());

    Ok(RuntimePaths {
        data_dir,
        database_path,
        sync_dir,
        sync_file_path,
    })
}
