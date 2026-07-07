use crate::{account_sync, commands::config, AppState};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UserSession {
    pub id: i64,
    pub username: String,
}

fn normalize_username(username: &str) -> String {
    username.trim().to_lowercase()
}

fn validate_credentials(username: &str, password: &str) -> Result<String, String> {
    let normalized = normalize_username(username);
    if normalized.len() < 3 {
        return Err("用户名至少需要 3 个字符。".into());
    }
    if password.chars().count() < 6 {
        return Err("密码至少需要 6 个字符。".into());
    }
    Ok(normalized)
}

fn hash_password(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| format!("密码加密失败: {}", e))
}

fn verify_password(hash: &str, password: &str) -> Result<bool, String> {
    let parsed = PasswordHash::new(hash).map_err(|e| format!("密码校验失败: {}", e))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[tauri::command]
pub async fn register_user(
    username: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<UserSession, String> {
    let username = validate_credentials(&username, &password)?;
    let password_hash = hash_password(&password)?;

    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.conn()
        .execute(
            "INSERT INTO users (username, password_hash, last_login_at)
             VALUES (?1, ?2, datetime('now'))",
            params![username, password_hash],
        )
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "该用户名已存在，请直接登录。".to_string()
            } else {
                format!("注册失败: {}", e)
            }
        })?;

    let user_id = db.conn().last_insert_rowid();
    config::set_global_config_value(db.conn(), config::CURRENT_USER_KEY, &user_id.to_string())
        .map_err(|e| format!("写入登录状态失败: {}", e))?;

    if let Err(error) = account_sync::pull_user_snapshot(db.conn(), user_id, &username) {
        eprintln!("[Abandon] initial sync pull failed: {}", error);
    }
    if let Err(error) = account_sync::push_user_snapshot(db.conn(), user_id, &username) {
        eprintln!("[Abandon] initial sync push failed: {}", error);
    }

    Ok(UserSession { id: user_id, username })
}

#[tauri::command]
pub async fn login_user(
    username: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<UserSession, String> {
    let username = normalize_username(&username);
    if username.is_empty() || password.is_empty() {
        return Err("请输入用户名和密码。".into());
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    let record = db
        .conn()
        .query_row(
            "SELECT id, username, password_hash FROM users WHERE username = ?1 COLLATE NOCASE",
            params![username],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .optional()
        .map_err(|e| format!("读取账号失败: {}", e))?;

    let (user_id, username, password_hash) =
        record.ok_or_else(|| "账号不存在。".to_string())?;
    if !verify_password(&password_hash, &password)? {
        return Err("密码不正确。".into());
    }

    db.conn()
        .execute(
            "UPDATE users SET last_login_at = datetime('now') WHERE id = ?1",
            params![user_id],
        )
        .map_err(|e| format!("更新登录时间失败: {}", e))?;

    config::set_global_config_value(db.conn(), config::CURRENT_USER_KEY, &user_id.to_string())
        .map_err(|e| format!("写入登录状态失败: {}", e))?;

    if let Err(error) = account_sync::pull_user_snapshot(db.conn(), user_id, &username) {
        eprintln!("[Abandon] login sync pull failed: {}", error);
    }
    if let Err(error) = account_sync::push_user_snapshot(db.conn(), user_id, &username) {
        eprintln!("[Abandon] login sync push failed: {}", error);
    }

    Ok(UserSession { id: user_id, username })
}

#[tauri::command]
pub async fn logout_user(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    config::remove_global_config_value(db.conn(), config::CURRENT_USER_KEY)
        .map_err(|e| format!("退出登录失败: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_current_user(state: State<'_, AppState>) -> Result<Option<UserSession>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let Some(user_id) =
        config::get_current_user_id(db.conn()).map_err(|e| format!("读取登录状态失败: {}", e))?
    else {
        return Ok(None);
    };

    let user = db
        .conn()
        .query_row(
            "SELECT id, username FROM users WHERE id = ?1",
            params![user_id],
            |row| {
                Ok(UserSession {
                    id: row.get(0)?,
                    username: row.get(1)?,
                })
            },
        )
        .optional()
        .map_err(|e| format!("读取账号信息失败: {}", e))?;

    if user.is_none() {
        let _ = config::remove_global_config_value(db.conn(), config::CURRENT_USER_KEY);
    }

    Ok(user)
}
