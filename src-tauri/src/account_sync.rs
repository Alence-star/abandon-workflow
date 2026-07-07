use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use reqwest::{Client, StatusCode};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::commands::config;

const GITHUB_API_BASE: &str = "https://api.github.com";
const GITHUB_API_VERSION: &str = "2022-11-28";
const GITHUB_USER_AGENT: &str = "Abandon/1.0.1";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncWordbookEntry {
    pub word: String,
    pub translation: String,
    pub notes: Option<String>,
    pub phonetic: Option<String>,
    pub collocations: Option<String>,
    pub memory_trick: Option<String>,
    pub familiarity: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncUserConfigEntry {
    pub key: String,
    pub value: String,
}

fn default_schema_version() -> u32 {
    2
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SyncPayload {
    #[serde(default = "default_schema_version")]
    pub schema_version: u32,
    pub username: String,
    pub exported_at: String,
    #[serde(default)]
    pub password_hash: Option<String>,
    #[serde(default)]
    pub password_sha256: Option<String>,
    #[serde(default)]
    pub wordbook: Vec<SyncWordbookEntry>,
    #[serde(default)]
    pub user_config: Vec<SyncUserConfigEntry>,
}

enum SyncBackend {
    SharedDirectory(PathBuf),
    GitHubGist(String),
}

impl SyncBackend {
    fn label(&self) -> &'static str {
        match self {
            Self::SharedDirectory(_) => "shared-dir",
            Self::GitHubGist(_) => "github-gist",
        }
    }
}

fn sync_dir(conn: &Connection) -> Result<Option<PathBuf>, String> {
    let value = config::get_global_config_value(conn, config::SYNC_DIR_KEY)
        .map_err(|error| format!("读取同步目录失败: {}", error))?;

    let Some(raw) = value else {
        return Ok(None);
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    Ok(Some(PathBuf::from(trimmed)))
}

fn github_sync_token(conn: &Connection) -> Result<Option<String>, String> {
    let value = config::get_global_config_value(conn, config::GITHUB_SYNC_TOKEN_KEY)
        .map_err(|error| format!("读取 GitHub 同步令牌失败: {}", error))?;

    Ok(value.and_then(|token| {
        let trimmed = token.trim().to_string();
        (!trimmed.is_empty()).then_some(trimmed)
    }))
}

fn configured_backends(conn: &Connection) -> Result<Vec<SyncBackend>, String> {
    let mut backends = Vec::new();

    if let Some(dir) = sync_dir(conn)? {
        backends.push(SyncBackend::SharedDirectory(dir));
    }

    if let Some(token) = github_sync_token(conn)? {
        backends.push(SyncBackend::GitHubGist(token));
    }

    Ok(backends)
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

fn github_gist_file_name(username: &str) -> String {
    format!("abandon-sync-{}.json", sanitize_username(username))
}

fn load_gist_cache(conn: &Connection) -> Result<HashMap<String, String>, String> {
    let raw = config::get_global_config_value(conn, config::GITHUB_GIST_CACHE_KEY)
        .map_err(|error| format!("读取 GitHub 同步缓存失败: {}", error))?;

    let Some(raw) = raw else {
        return Ok(HashMap::new());
    };

    if raw.trim().is_empty() {
        return Ok(HashMap::new());
    }

    serde_json::from_str(&raw).map_err(|error| format!("解析 GitHub 同步缓存失败: {}", error))
}

fn save_gist_cache(conn: &Connection, cache: &HashMap<String, String>) -> Result<(), String> {
    if cache.is_empty() {
        return config::remove_global_config_value(conn, config::GITHUB_GIST_CACHE_KEY)
            .map_err(|error| format!("清理 GitHub 同步缓存失败: {}", error));
    }

    let raw = serde_json::to_string(cache)
        .map_err(|error| format!("生成 GitHub 同步缓存失败: {}", error))?;

    config::set_global_config_value(conn, config::GITHUB_GIST_CACHE_KEY, &raw)
        .map_err(|error| format!("写入 GitHub 同步缓存失败: {}", error))
}

fn cached_gist_id(conn: &Connection, username: &str) -> Result<Option<String>, String> {
    let cache = load_gist_cache(conn)?;
    Ok(cache.get(&sanitize_username(username)).cloned())
}

fn update_cached_gist_id(
    conn: &Connection,
    username: &str,
    gist_id: Option<&str>,
) -> Result<(), String> {
    let key = sanitize_username(username);
    let mut cache = load_gist_cache(conn)?;

    if let Some(gist_id) = gist_id.filter(|value| !value.trim().is_empty()) {
        cache.insert(key, gist_id.to_string());
    } else {
        cache.remove(&key);
    }

    save_gist_cache(conn, &cache)
}

fn resolve_payload_timestamp(payload: &SyncPayload) -> i64 {
    DateTime::parse_from_rfc3339(&payload.exported_at)
        .map(|value| value.timestamp())
        .unwrap_or_default()
}

fn select_latest_payload(payloads: Vec<SyncPayload>) -> Option<SyncPayload> {
    payloads
        .into_iter()
        .max_by_key(resolve_payload_timestamp)
}

fn parse_sync_payload(raw: &str, source: &str) -> Result<SyncPayload, String> {
    serde_json::from_str(raw).map_err(|error| format!("解析同步数据失败({}): {}", source, error))
}

async fn github_request(
    token: &str,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> Result<reqwest::Response, String> {
    let client = Client::new();
    let mut request = client
        .request(method, url)
        .header("Authorization", format!("Bearer {}", token))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
        .header("User-Agent", GITHUB_USER_AGENT);

    if let Some(body) = body {
        request = request.json(&body);
    }

    request
        .send()
        .await
        .map_err(|error| format!("GitHub 云同步请求失败: {}", error))
}

async fn github_fetch_gist(
    token: &str,
    gist_id: &str,
) -> Result<Option<Value>, String> {
    let url = format!("{}/gists/{}", GITHUB_API_BASE, gist_id);
    let response = github_request(token, reqwest::Method::GET, &url, None).await?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(None);
    }

    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 GitHub 云同步响应失败: {}", error))?;

    if !status.is_success() {
        return Err(format!("GitHub 云同步失败({}): {}", status, text));
    }

    serde_json::from_str(&text).map(Some).map_err(|error| {
        format!(
            "解析 GitHub 云同步响应失败({}): {}",
            status, error
        )
    })
}

fn gist_file_content(gist: &Value, filename: &str) -> Option<String> {
    gist.get("files")?
        .get(filename)?
        .get("content")?
        .as_str()
        .map(|value| value.to_string())
}

async fn github_find_gist_id(
    token: &str,
    username: &str,
    cached_id: Option<String>,
) -> Result<Option<String>, String> {
    let filename = github_gist_file_name(username);

    if let Some(gist_id) = cached_id {
        if let Some(gist) = github_fetch_gist(token, &gist_id).await? {
            if gist_file_content(&gist, &filename).is_some() {
                return Ok(Some(gist_id));
            }
        }
    }

    let url = format!("{}/gists?per_page=100", GITHUB_API_BASE);
    let response = github_request(token, reqwest::Method::GET, &url, None).await?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 GitHub Gist 列表失败: {}", error))?;

    if !status.is_success() {
        return Err(format!("读取 GitHub Gist 列表失败({}): {}", status, text));
    }

    let gists: Vec<Value> =
        serde_json::from_str(&text).map_err(|error| format!("解析 GitHub Gist 列表失败: {}", error))?;

    Ok(gists.into_iter().find_map(|gist| {
        let has_file = gist
            .get("files")
            .and_then(|files| files.get(&filename))
            .is_some();

        if has_file {
            gist.get("id")
                .and_then(|value| value.as_str())
                .map(|value| value.to_string())
        } else {
            None
        }
    }))
}

async fn github_read_payload(
    token: &str,
    username: &str,
    cached_id: Option<String>,
) -> Result<(Option<SyncPayload>, Option<String>), String> {
    let Some(gist_id) = github_find_gist_id(token, username, cached_id).await? else {
        return Ok((None, None));
    };

    let Some(gist) = github_fetch_gist(token, &gist_id).await? else {
        return Ok((None, None));
    };

    let filename = github_gist_file_name(username);
    let Some(content) = gist_file_content(&gist, &filename) else {
        return Ok((None, None));
    };

    let payload = parse_sync_payload(&content, "github-gist")?;
    Ok((Some(payload), Some(gist_id)))
}

async fn github_create_gist(
    token: &str,
    username: &str,
    content: &str,
) -> Result<String, String> {
    let filename = github_gist_file_name(username);
    let url = format!("{}/gists", GITHUB_API_BASE);
    let body = json!({
        "description": format!("Abandon sync for {}", username),
        "public": false,
        "files": {
            filename: {
                "content": content
            }
        }
    });

    let response = github_request(token, reqwest::Method::POST, &url, Some(body)).await?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 GitHub Gist 创建响应失败: {}", error))?;

    if !status.is_success() {
        return Err(format!("创建 GitHub Gist 失败({}): {}", status, text));
    }

    let json: Value =
        serde_json::from_str(&text).map_err(|error| format!("解析 GitHub Gist 创建响应失败: {}", error))?;

    json.get("id")
        .and_then(|value| value.as_str())
        .map(|value| value.to_string())
        .ok_or_else(|| "创建 GitHub Gist 失败: 响应中缺少 gist id".to_string())
}

async fn github_update_gist(
    token: &str,
    gist_id: &str,
    username: &str,
    content: &str,
) -> Result<(), String> {
    let filename = github_gist_file_name(username);
    let url = format!("{}/gists/{}", GITHUB_API_BASE, gist_id);
    let body = json!({
        "description": format!("Abandon sync for {}", username),
        "files": {
            filename: {
                "content": content
            }
        }
    });

    let response = github_request(token, reqwest::Method::PATCH, &url, Some(body)).await?;
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("读取 GitHub Gist 更新响应失败: {}", error))?;

    if !status.is_success() {
        return Err(format!("更新 GitHub Gist 失败({}): {}", status, text));
    }

    Ok(())
}

async fn github_upsert_payload(
    token: &str,
    username: &str,
    cached_id: Option<String>,
    payload: &SyncPayload,
) -> Result<String, String> {
    let content = serde_json::to_string_pretty(payload)
        .map_err(|error| format!("生成 GitHub 同步内容失败: {}", error))?;

    if let Some(gist_id) = github_find_gist_id(token, username, cached_id).await? {
        github_update_gist(token, &gist_id, username, &content).await?;
        return Ok(gist_id);
    }

    github_create_gist(token, username, &content).await
}

fn load_wordbook_snapshot(conn: &Connection, user_id: i64) -> Result<Vec<SyncWordbookEntry>, String> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT word, translation, notes, phonetic, collocations, memory_trick, familiarity, created_at
             FROM wordbook
             WHERE user_id = ?1
             ORDER BY created_at DESC, word ASC",
        )
        .map_err(|error| format!("读取生词本失败: {}", error))?;

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
        .map_err(|error| format!("读取生词本失败: {}", error))?
        .filter_map(|row| row.ok())
        .collect::<Vec<_>>();

    Ok(entries)
}

fn load_user_config_snapshot(
    conn: &Connection,
    user_id: i64,
) -> Result<Vec<SyncUserConfigEntry>, String> {
    let mut stmt = conn
        .prepare_cached(
            "SELECT key, value
             FROM user_config
             WHERE user_id = ?1
             ORDER BY key ASC",
        )
        .map_err(|error| format!("读取用户配置失败: {}", error))?;

    let entries = stmt
        .query_map(params![user_id], |row| {
            Ok(SyncUserConfigEntry {
                key: row.get(0)?,
                value: row.get(1)?,
            })
        })
        .map_err(|error| format!("读取用户配置失败: {}", error))?
        .filter_map(|row| row.ok())
        .collect::<Vec<_>>();

    Ok(entries)
}

fn lookup_password_fields(
    conn: &Connection,
    user_id: i64,
) -> Result<(Option<String>, Option<String>), String> {
    conn.query_row(
        "SELECT password_hash, password_sha256 FROM users WHERE id = ?1",
        params![user_id],
        |row| {
            Ok((
                row.get::<_, Option<String>>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        },
    )
    .optional()
    .map_err(|error| format!("读取账号凭据失败: {}", error))?
    .ok_or_else(|| "当前账号不存在，无法同步".to_string())
}

fn build_sync_payload(conn: &Connection, user_id: i64, username: &str) -> Result<SyncPayload, String> {
    let (password_hash, password_sha256) = lookup_password_fields(conn, user_id)?;

    Ok(SyncPayload {
        schema_version: default_schema_version(),
        username: username.to_string(),
        exported_at: Utc::now().to_rfc3339(),
        password_hash,
        password_sha256,
        wordbook: load_wordbook_snapshot(conn, user_id)?,
        user_config: load_user_config_snapshot(conn, user_id)?,
    })
}

fn apply_sync_payload_to_user(
    conn: &Connection,
    user_id: i64,
    payload: &SyncPayload,
) -> Result<(), String> {
    conn.execute("DELETE FROM wordbook WHERE user_id = ?1", params![user_id])
        .map_err(|error| format!("清理旧同步生词本失败: {}", error))?;

    conn.execute("DELETE FROM user_config WHERE user_id = ?1", params![user_id])
        .map_err(|error| format!("清理旧同步配置失败: {}", error))?;

    for entry in &payload.wordbook {
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
        .map_err(|error| format!("写入同步生词本失败: {}", error))?;
    }

    for entry in &payload.user_config {
        conn.execute(
            "INSERT INTO user_config (user_id, key, value, updated_at)
             VALUES (?1, ?2, ?3, datetime('now'))
             ON CONFLICT(user_id, key)
             DO UPDATE SET value = excluded.value, updated_at = datetime('now')",
            params![user_id, entry.key.trim(), entry.value],
        )
        .map_err(|error| format!("写入同步配置失败: {}", error))?;
    }

    if payload.password_hash.as_ref().is_some_and(|value| !value.trim().is_empty())
        || payload
            .password_sha256
            .as_ref()
            .is_some_and(|value| !value.trim().is_empty())
    {
        conn.execute(
            "UPDATE users
             SET
               password_hash = COALESCE(?1, password_hash),
               password_sha256 = COALESCE(?2, password_sha256)
             WHERE id = ?3",
            params![
                payload.password_hash.as_deref(),
                payload.password_sha256.as_deref(),
                user_id
            ],
        )
        .map_err(|error| format!("更新账号凭据失败: {}", error))?;
    }

    Ok(())
}

fn read_payload_from_shared_directory(
    base_dir: PathBuf,
    username: &str,
) -> Result<Option<SyncPayload>, String> {
    let target_path = sync_file_path(base_dir, username);
    if !target_path.exists() {
        return Ok(None);
    }

    let raw = fs::read_to_string(&target_path)
        .map_err(|error| format!("读取共享同步文件失败: {}", error))?;

    parse_sync_payload(&raw, "shared-dir").map(Some)
}

fn write_payload_to_shared_directory(
    base_dir: PathBuf,
    username: &str,
    payload: &SyncPayload,
) -> Result<bool, String> {
    let target_path = sync_file_path(base_dir, username);

    if let Some(parent) = target_path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建共享同步目录失败: {}", error))?;
    }

    let raw = serde_json::to_string_pretty(payload)
        .map_err(|error| format!("生成共享同步文件失败: {}", error))?;

    let temp_path = target_path.with_extension("json.tmp");
    fs::write(&temp_path, raw).map_err(|error| format!("写入共享同步文件失败: {}", error))?;
    if target_path.exists() {
        let _ = fs::remove_file(&target_path);
    }
    fs::rename(&temp_path, &target_path)
        .map_err(|error| format!("更新共享同步文件失败: {}", error))?;

    Ok(true)
}

fn read_payload_from_backend(
    conn: &Connection,
    backend: &SyncBackend,
    username: &str,
) -> Result<Option<SyncPayload>, String> {
    match backend {
        SyncBackend::SharedDirectory(base_dir) => {
            read_payload_from_shared_directory(base_dir.clone(), username)
        }
        SyncBackend::GitHubGist(token) => {
            let cached_id = cached_gist_id(conn, username)?;
            let (payload, gist_id) = tauri::async_runtime::block_on(github_read_payload(
                token,
                username,
                cached_id.clone(),
            ))?;

            if gist_id.as_deref() != cached_id.as_deref() {
                update_cached_gist_id(conn, username, gist_id.as_deref())?;
            }

            Ok(payload)
        }
    }
}

fn write_payload_to_backend(
    conn: &Connection,
    backend: &SyncBackend,
    username: &str,
    payload: &SyncPayload,
) -> Result<bool, String> {
    match backend {
        SyncBackend::SharedDirectory(base_dir) => {
            write_payload_to_shared_directory(base_dir.clone(), username, payload)
        }
        SyncBackend::GitHubGist(token) => {
            let cached_id = cached_gist_id(conn, username)?;
            let gist_id = tauri::async_runtime::block_on(github_upsert_payload(
                token,
                username,
                cached_id.clone(),
                payload,
            ))?;

            if Some(gist_id.as_str()) != cached_id.as_deref() {
                update_cached_gist_id(conn, username, Some(&gist_id))?;
            }

            Ok(true)
        }
    }
}

pub fn resolve_sync_file_path(
    conn: &Connection,
    username: &str,
) -> Result<Option<PathBuf>, String> {
    let Some(base_dir) = sync_dir(conn)? else {
        return Ok(None);
    };

    Ok(Some(sync_file_path(base_dir, username)))
}

pub fn resolve_current_user_sync_file(conn: &Connection) -> Result<Option<PathBuf>, String> {
    let Some(user_id) = config::get_current_user_id(conn)
        .map_err(|error| format!("读取当前账号失败: {}", error))?
    else {
        return Ok(None);
    };

    let Some(username) = lookup_username(conn, user_id)? else {
        return Ok(None);
    };

    resolve_sync_file_path(conn, &username)
}

pub fn lookup_username(conn: &Connection, user_id: i64) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT username FROM users WHERE id = ?1",
        params![user_id],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(|error| format!("读取账号信息失败: {}", error))
}

pub fn load_remote_snapshot(
    conn: &Connection,
    username: &str,
) -> Result<Option<SyncPayload>, String> {
    let backends = configured_backends(conn)?;
    if backends.is_empty() {
        return Ok(None);
    }

    let mut payloads = Vec::new();
    let mut errors = Vec::new();

    for backend in &backends {
        match read_payload_from_backend(conn, backend, username) {
            Ok(Some(payload)) => payloads.push(payload),
            Ok(None) => {}
            Err(error) => errors.push(format!("{}: {}", backend.label(), error)),
        }
    }

    if let Some(payload) = select_latest_payload(payloads) {
        return Ok(Some(payload));
    }

    if !errors.is_empty() {
        return Err(errors.join("\n"));
    }

    Ok(None)
}

pub fn remote_account_exists(conn: &Connection, username: &str) -> Result<bool, String> {
    Ok(load_remote_snapshot(conn, username)?.is_some())
}

pub fn apply_remote_snapshot(
    conn: &Connection,
    user_id: i64,
    payload: &SyncPayload,
) -> Result<(), String> {
    apply_sync_payload_to_user(conn, user_id, payload)
}

pub fn push_user_snapshot(conn: &Connection, user_id: i64, username: &str) -> Result<bool, String> {
    let backends = configured_backends(conn)?;
    if backends.is_empty() {
        return Ok(false);
    }

    let payload = build_sync_payload(conn, user_id, username)?;
    let mut success = false;
    let mut errors = Vec::new();

    for backend in &backends {
        match write_payload_to_backend(conn, backend, username, &payload) {
            Ok(true) => success = true,
            Ok(false) => {}
            Err(error) => errors.push(format!("{}: {}", backend.label(), error)),
        }
    }

    if success {
        return Ok(true);
    }

    if !errors.is_empty() {
        return Err(errors.join("\n"));
    }

    Ok(false)
}

pub fn pull_user_snapshot(conn: &Connection, user_id: i64, username: &str) -> Result<bool, String> {
    let Some(payload) = load_remote_snapshot(conn, username)? else {
        return Ok(false);
    };

    apply_sync_payload_to_user(conn, user_id, &payload)?;
    Ok(true)
}

pub fn push_current_user_snapshot(conn: &Connection) -> Result<bool, String> {
    let Some(user_id) = config::get_current_user_id(conn)
        .map_err(|error| format!("读取当前账号失败: {}", error))?
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
