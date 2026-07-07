use crate::{account_sync, commands::config, AppState};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand_core::OsRng;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
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
        .map_err(|error| format!("密码加密失败: {}", error))
}

fn hash_password_sha256(username: &str, password: &str) -> String {
    let normalized = normalize_username(username);
    let mut hasher = Sha256::new();
    hasher.update(format!("abandon::{}::{}", normalized, password).as_bytes());
    let digest = hasher.finalize();
    digest
        .iter()
        .map(|byte| format!("{:02x}", byte))
        .collect::<String>()
}

fn verify_password(hash: &str, password: &str) -> Result<bool, String> {
    let parsed =
        PasswordHash::new(hash).map_err(|error| format!("密码校验失败: {}", error))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

fn verify_password_sha256(stored: &str, username: &str, password: &str) -> bool {
    if stored.trim().is_empty() {
        return false;
    }

    stored.trim() == hash_password_sha256(username, password)
}

fn set_current_user(conn: &Connection, user_id: i64) -> Result<(), String> {
    config::set_global_config_value(conn, config::CURRENT_USER_KEY, &user_id.to_string())
        .map_err(|error| format!("写入登录状态失败: {}", error))
}

fn sync_after_login(conn: &Connection, user_id: i64, username: &str) {
    if let Err(error) = account_sync::pull_user_snapshot(conn, user_id, username) {
        eprintln!("[Abandon] login sync pull failed: {}", error);
    }
    if let Err(error) = account_sync::push_user_snapshot(conn, user_id, username) {
        eprintln!("[Abandon] login sync push failed: {}", error);
    }
}

fn provision_local_user_from_remote(
    conn: &Connection,
    username: &str,
    password: &str,
    payload: &account_sync::SyncPayload,
) -> Result<(i64, String), String> {
    let remote_username = normalize_username(&payload.username);
    if remote_username.is_empty() || remote_username != normalize_username(username) {
        return Err("远程同步数据中的账号名无效。".into());
    }

    let password_matches = payload
        .password_hash
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(|hash| verify_password(hash, password))
        .transpose()?
        .unwrap_or(false)
        || payload
            .password_sha256
            .as_deref()
            .map(|digest| verify_password_sha256(digest, &remote_username, password))
            .unwrap_or(false);

    if !password_matches {
        if payload.password_hash.is_none() && payload.password_sha256.is_none() {
            return Err("该账号的同步数据尚未升级，请先在已有设备重新登录一次再试。".into());
        }
        return Err("密码不正确。".into());
    }

    let local_password_hash = payload
        .password_hash
        .clone()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(hash_password(password)?);
    let local_password_sha256 = hash_password_sha256(&remote_username, password);

    let existing_user_id = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1 COLLATE NOCASE",
            params![&remote_username],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| format!("读取本地账号失败: {}", error))?;

    let user_id = if let Some(user_id) = existing_user_id {
        conn.execute(
            "UPDATE users
             SET password_hash = ?1, password_sha256 = ?2, last_login_at = datetime('now')
             WHERE id = ?3",
            params![local_password_hash, local_password_sha256, user_id],
        )
        .map_err(|error| format!("更新本地账号失败: {}", error))?;
        user_id
    } else {
        conn.execute(
            "INSERT INTO users (username, password_hash, password_sha256, last_login_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
            params![&remote_username, local_password_hash, local_password_sha256],
        )
        .map_err(|error| format!("创建本地账号失败: {}", error))?;
        conn.last_insert_rowid()
    };

    account_sync::apply_remote_snapshot(conn, user_id, payload)?;

    Ok((user_id, remote_username))
}

#[tauri::command]
pub async fn register_user(
    username: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<UserSession, String> {
    let username = validate_credentials(&username, &password)?;
    let password_hash = hash_password(&password)?;
    let password_sha256 = hash_password_sha256(&username, &password);

    let db = state.db.lock().map_err(|error| error.to_string())?;

    let local_exists = db
        .conn()
        .query_row(
            "SELECT id FROM users WHERE username = ?1 COLLATE NOCASE",
            params![&username],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| format!("读取本地账号失败: {}", error))?
        .is_some();

    if local_exists || account_sync::remote_account_exists(db.conn(), &username)? {
        return Err("该用户名已存在，请直接登录。".into());
    }

    db.conn()
        .execute(
            "INSERT INTO users (username, password_hash, password_sha256, last_login_at)
             VALUES (?1, ?2, ?3, datetime('now'))",
            params![&username, password_hash, password_sha256],
        )
        .map_err(|error| format!("注册失败: {}", error))?;

    let user_id = db.conn().last_insert_rowid();
    set_current_user(db.conn(), user_id)?;
    sync_after_login(db.conn(), user_id, &username);

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

    let db = state.db.lock().map_err(|error| error.to_string())?;
    let local_record = db
        .conn()
        .query_row(
            "SELECT id, username, password_hash, password_sha256
             FROM users
             WHERE username = ?1 COLLATE NOCASE",
            params![&username],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|error| format!("读取账号失败: {}", error))?;

    let (user_id, username) = if let Some((user_id, username, password_hash, password_sha256)) = local_record {
        if !verify_password(&password_hash, &password)? {
            return Err("密码不正确。".into());
        }

        let fresh_sha256 = hash_password_sha256(&username, &password);
        if password_sha256.as_deref() != Some(fresh_sha256.as_str()) {
            db.conn()
                .execute(
                    "UPDATE users
                     SET password_sha256 = ?1, last_login_at = datetime('now')
                     WHERE id = ?2",
                    params![fresh_sha256, user_id],
                )
                .map_err(|error| format!("更新账号凭据失败: {}", error))?;
        } else {
            db.conn()
                .execute(
                    "UPDATE users SET last_login_at = datetime('now') WHERE id = ?1",
                    params![user_id],
                )
                .map_err(|error| format!("更新登录时间失败: {}", error))?;
        }

        (user_id, username)
    } else {
        let payload = account_sync::load_remote_snapshot(db.conn(), &username)?
            .ok_or_else(|| "账号不存在。".to_string())?;
        provision_local_user_from_remote(db.conn(), &username, &password, &payload)?
    };

    set_current_user(db.conn(), user_id)?;
    sync_after_login(db.conn(), user_id, &username);

    Ok(UserSession { id: user_id, username })
}

#[tauri::command]
pub async fn logout_user(state: State<'_, AppState>) -> Result<(), String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    config::remove_global_config_value(db.conn(), config::CURRENT_USER_KEY)
        .map_err(|error| format!("退出登录失败: {}", error))?;
    Ok(())
}

#[tauri::command]
pub async fn get_current_user(state: State<'_, AppState>) -> Result<Option<UserSession>, String> {
    let db = state.db.lock().map_err(|error| error.to_string())?;
    let Some(user_id) = config::get_current_user_id(db.conn())
        .map_err(|error| format!("读取登录状态失败: {}", error))?
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
        .map_err(|error| format!("读取账号信息失败: {}", error))?;

    if user.is_none() {
        let _ = config::remove_global_config_value(db.conn(), config::CURRENT_USER_KEY);
    }

    Ok(user)
}
