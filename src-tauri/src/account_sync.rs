use std::fs;
use std::path::PathBuf;

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::commands::config;

#[derive(Debug, Serialize, Deserialize)]
struct SyncWordbookEntry {
    word: String,
    translation: String,
    notes: Option<String>,
    phonetic: Option<String>,
    collocations: Option<String>,
    memory_trick: Option<String>,
    familiarity: i64,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncPayload {
    username: String,
    exported_at: String,
    wordbook: Vec<SyncWordbookEntry>,
}

fn sync_dir(conn: &Connection) -> Result<Option<PathBuf>, String> {
    let value = config::get_global_config_value(conn, config::SYNC_DIR_KEY)
        .map_err(|e| format!("读取同步目录失败: {}", e))?;

    let Some(raw) = value else {
        return Ok(None);
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    Ok(Some(PathBuf::from(trimmed)))
}

fn sanitize_username(username: &str) -> String {
    let sanitized = username
        .trim()
        .to_lowercase()
        .chars()
        .map(|ch| match ch {
            'a'..='z' | '0'..='9' | '.' | '_' | '-' => ch,
            _ => '_',
        })
        .collect::<String>();

    if sanitized.is_empty() {
        "user".to_string()
    } else {
        sanitized
    }
}

fn sync_file_path(base_dir: PathBuf, username: &str) -> PathBuf {
    let mut path = base_dir;
    path.push(format!("{}.json", sanitize_username(username)));
    path
}

fn load_wordbook_snapshot(conn: &Connection, user_id: i64) -> Result<Vec<SyncWordbookEntry>, String> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT word, translation, notes, phonetic, collocations, memory_trick, familiarity, created_at
             FROM wordbook
             WHERE user_id = ?1
             ORDER BY created_at DESC, word ASC",
        )
        .map_err(|e| format!("读取生词本失败: {}", e))?;

    let entries = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncWordbookEntry {
                word: row.get(0)?,
                translation: row.get(1)?,
                notes: row.get(2).ok().or(None),
                phonetic: row.get(3).ok().or(None),
                collocations: row.get(4).ok().or(None),
                memory_trick: row.get(5).ok().or(None),
                familiarity: row.get(6).unwrap_or(0),
                created_at: row.get(7).unwrap_or_default(),
            })
        })
        .map_err(|e| format!("读取生词本失败: {}", e))?
        .filter_map(|row| row.ok())
        .collect::<Vec<_>>();

    Ok(entries)
}

pub fn lookup_username(conn: &Connection, user_id: i64) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT username FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| format!("读取账号信息失败: {}", e))
}

pub fn push_user_snapshot(conn: &Connection, user_id: i64, username: &str) -> Result<bool, String> {
    let Some(base_dir) = sync_dir(conn)? else {
        return Ok(false);
    };

    fs::create_dir_all(&base_dir).map_err(|e| format!("创建同步目录失败: {}", e))?;
    let target_path = sync_file_path(base_dir, username);
    let payload = SyncPayload {
        username: username.to_string(),
        exported_at: Utc::now().to_rfc3339(),
        wordbook: load_wordbook_snapshot(conn, user_id)?,
    };

    let json = serde_json::to_string_pretty(&payload)
        .map_err(|e| format!("生成同步文件失败: {}", e))?;

    let temp_path = target_path.with_extension("json.tmp");
    fs::write(&temp_path, json).map_err(|e| format!("写入同步文件失败: {}", e))?;
    if target_path.exists() {
        let _ = fs::remove_file(&target_path);
    }
    fs::rename(&temp_path, &target_path).map_err(|e| format!("更新同步文件失败: {}", e))?;

    Ok(true)
}

pub fn pull_user_snapshot(conn: &Connection, user_id: i64, username: &str) -> Result<bool, String> {
    let Some(base_dir) = sync_dir(conn)? else {
        return Ok(false);
    };

    let target_path = sync_file_path(base_dir, username);
    if !target_path.exists() {
        return Ok(false);
    }

    let json = fs::read_to_string(&target_path).map_err(|e| format!("读取同步文件失败: {}", e))?;
    let payload: SyncPayload =
        serde_json::from_str(&json).map_err(|e| format!("解析同步文件失败: {}", e))?;

    conn.execute("DELETE FROM wordbook WHERE user_id = ?1", params![user_id])
        .map_err(|e| format!("清理旧同步数据失败: {}", e))?;

    for entry in payload.wordbook {
        conn.execute(
            "INSERT INTO wordbook
             (user_id, word, translation, notes, phonetic, collocations, memory_trick, familiarity, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(user_id, word)
             DO UPDATE SET
               translation = excluded.translation,
               notes = excluded.notes,
               phonetic = excluded.phonetic,
               collocations = excluded.collocations,
               memory_trick = excluded.memory_trick,
               familiarity = excluded.familiarity,
               created_at = excluded.created_at",
            params![
                user_id,
                entry.word.trim(),
                entry.translation,
                entry.notes,
                entry.phonetic,
                entry.collocations,
                entry.memory_trick,
                entry.familiarity,
                entry.created_at,
            ],
        )
        .map_err(|e| format!("写入同步数据失败: {}", e))?;
    }

    Ok(true)
}

pub fn push_current_user_snapshot(conn: &Connection) -> Result<bool, String> {
    let Some(user_id) = config::get_current_user_id(conn)
        .map_err(|e| format!("读取当前账号失败: {}", e))?
    else {
        return Ok(false);
    };

    if user_id <= 0 {
        return Ok(false);
    }

    let Some(username) = lookup_username(conn, user_id)? else {
        return Ok(false);
    };

    push_user_snapshot(conn, user_id, &username)
}
