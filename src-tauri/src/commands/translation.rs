use crate::{commands::config, AppState};
use reqwest::Client;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct TranslationResult {
    pub original: String,
    pub translation: String,
    pub source_lang: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SentenceAnalysis {
    pub translation: String,
    pub grammar: GrammarInfo,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GrammarInfo {
    pub sentence_structure: String,
    pub tense: String,
    pub clauses: Vec<ClauseInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ClauseInfo {
    pub clause_type: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExampleSentence {
    pub english: String,
    pub chinese: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WordInfo {
    pub word: String,
    #[serde(default)]
    pub phonetic: String,
    #[serde(default)]
    pub translation: String,
    #[serde(default)]
    pub collocations: Vec<String>,
    #[serde(default)]
    pub memory_trick: String,
    #[serde(default)]
    pub example_sentences: Vec<ExampleSentence>,
}

struct ApiConfig {
    key: String,
    base_url: String,
    model: String,
}

fn get_api_config(state: &State<'_, AppState>) -> Result<ApiConfig, String> {
    let db = state.db.lock().map_err(|e| format!("数据库加锁失败: {}", e))?;
    let conn = db.conn();

    let key = config::get_effective_config_value(conn, "api_key")
        .map_err(|e| format!("读取 API Key 失败: {}", e))?
        .filter(|value| !value.trim().is_empty())
        .or(
            config::get_effective_config_value(conn, "openai_api_key")
                .map_err(|e| format!("读取备用 API Key 失败: {}", e))?
                .filter(|value| !value.trim().is_empty()),
        )
        .ok_or_else(|| "API Key 未设置，请先到设置页保存。".to_string())?;

    let base_url = config::get_effective_config_value(conn, "api_base_url")
        .map_err(|e| format!("读取 API 地址失败: {}", e))?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "https://api.deepseek.com".to_string());

    let model = config::get_effective_config_value(conn, "api_model")
        .map_err(|e| format!("读取模型配置失败: {}", e))?
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "deepseek-chat".to_string());

    Ok(ApiConfig {
        key,
        base_url,
        model,
    })
}

fn extract_api_content(json: &serde_json::Value) -> Option<String> {
    json.get("choices")?
        .as_array()?
        .first()?
        .get("message")?
        .get("content")?
        .as_str()
        .map(|value| value.to_string())
}

async fn call_api(
    state: &State<'_, AppState>,
    system_prompt: &str,
    user_message: &str,
    response_format: Option<&str>,
) -> Result<String, String> {
    let config = get_api_config(state)?;
    let client = Client::new();
    let url = format!("{}/v1/chat/completions", config.base_url.trim_end_matches('/'));

    let mut body = serde_json::json!({
        "model": config.model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        "temperature": 0.2,
        "max_tokens": 1200
    });

    if let Some(format_type) = response_format {
        body["response_format"] = serde_json::json!({ "type": format_type });
    }

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("API 请求失败: {}", e))?;

    let status = response.status();
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("解析接口响应失败 (status {}): {}", status, e))?;

    if let Some(error) = json.get("error") {
        let message = error
            .get("message")
            .and_then(|value| value.as_str())
            .unwrap_or("未知错误");
        return Err(format!("API 错误: {}", message));
    }

    extract_api_content(&json)
        .map(|content| content.trim().to_string())
        .filter(|content| !content.is_empty())
        .ok_or_else(|| format!("接口返回格式异常 (status {}): {}", status, json))
}

fn load_cached_word_info(conn: &Connection, word: &str) -> Result<Option<WordInfo>, String> {
    conn.query_row(
        "SELECT word, phonetic, translation, collocations, memory_trick, example_sentences
         FROM words
         WHERE word = ?1 COLLATE NOCASE",
        params![word],
        |row| {
            let collocations = row
                .get::<_, Option<String>>(3)?
                .unwrap_or_default()
                .split('\n')
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect::<Vec<_>>();
            let example_sentences = row
                .get::<_, Option<String>>(5)?
                .and_then(|raw| serde_json::from_str::<Vec<ExampleSentence>>(&raw).ok())
                .unwrap_or_default();

            Ok(WordInfo {
                word: row.get(0)?,
                phonetic: row.get::<_, Option<String>>(1)?.unwrap_or_default(),
                translation: row.get(2)?,
                collocations,
                memory_trick: row.get::<_, Option<String>>(4)?.unwrap_or_default(),
                example_sentences,
            })
        },
    )
    .optional()
    .map_err(|e| format!("读取本地词典缓存失败: {}", e))
}

fn save_cached_word_info(conn: &Connection, info: &WordInfo) -> Result<(), String> {
    let collocations = if info.collocations.is_empty() {
        None
    } else {
        Some(info.collocations.join("\n"))
    };
    let phonetic = (!info.phonetic.trim().is_empty()).then(|| info.phonetic.trim().to_string());
    let memory_trick =
        (!info.memory_trick.trim().is_empty()).then(|| info.memory_trick.trim().to_string());
    let example_sentences = if info.example_sentences.is_empty() {
        None
    } else {
        Some(
            serde_json::to_string(&info.example_sentences)
                .map_err(|e| format!("序列化例句失败: {}", e))?,
        )
    };

    conn.execute(
        "INSERT OR REPLACE INTO words (word, phonetic, translation, collocations, memory_trick, example_sentences, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'))",
        params![
            info.word.trim(),
            phonetic,
            info.translation.trim(),
            collocations,
            memory_trick,
            example_sentences
        ],
    )
    .map_err(|e| format!("保存词典缓存失败: {}", e))?;

    Ok(())
}

fn normalize_word_info(mut info: WordInfo, fallback_word: &str) -> WordInfo {
    if info.word.trim().is_empty() {
        info.word = fallback_word.trim().to_string();
    } else {
        info.word = info.word.trim().to_string();
    }

    info.phonetic = info.phonetic.trim().to_string();
    info.translation = info.translation.trim().to_string();
    info.collocations = info
        .collocations
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .take(8)
        .collect();
    info.memory_trick = info.memory_trick.trim().to_string();
    info.example_sentences = info
        .example_sentences
        .into_iter()
        .map(|item| ExampleSentence {
            english: item.english.trim().to_string(),
            chinese: item.chinese.trim().to_string(),
        })
        .filter(|item| !item.english.is_empty() && !item.chinese.is_empty())
        .take(3)
        .collect();
    info
}

#[tauri::command]
pub async fn translate_text(
    text: String,
    state: State<'_, AppState>,
) -> Result<TranslationResult, String> {
    let system_prompt = "You are a precise English-to-Chinese translator. Translate the user's text into natural Chinese. Return only the final Chinese translation without explanations.";

    let translation = call_api(&state, system_prompt, &text, None).await?;

    Ok(TranslationResult {
        original: text,
        translation,
        source_lang: "en".into(),
    })
}

#[tauri::command]
pub async fn analyze_sentence(
    text: String,
    state: State<'_, AppState>,
) -> Result<SentenceAnalysis, String> {
    let system_prompt = "Analyze the English sentence and return strict JSON with this shape: {\"translation\":\"natural Chinese translation\",\"grammar\":{\"sentence_structure\":\"brief Chinese description\",\"tense\":\"Chinese tense description\",\"clauses\":[{\"clause_type\":\"Chinese clause label\",\"content\":\"original clause text\"}]}}.";

    let result = call_api(&state, system_prompt, &text, Some("json_object")).await?;

    match serde_json::from_str::<SentenceAnalysis>(&result) {
        Ok(analysis) => Ok(analysis),
        Err(_) => Ok(SentenceAnalysis {
            translation: result,
            grammar: GrammarInfo {
                sentence_structure: "未能解析句型".into(),
                tense: "未识别".into(),
                clauses: vec![],
            },
        }),
    }
}

#[tauri::command]
pub async fn get_word_info(
    word: String,
    state: State<'_, AppState>,
) -> Result<WordInfo, String> {
    let lookup = word.trim().to_string();
    if lookup.is_empty() {
        return Err("请输入要查询的英文单词或短语。".into());
    }

    {
        let db = state.db.lock().map_err(|e| e.to_string())?;
        if let Some(cached) = load_cached_word_info(db.conn(), &lookup)? {
            return Ok(cached);
        }
    }

    let system_prompt = "You are an English-Chinese dictionary editor. Given one English word or a very short phrase, return strict JSON with exactly these fields: {\"word\":\"original word or phrase\",\"phonetic\":\"UK IPA such as /.../, or empty string if unavailable\",\"translation\":\"Chinese dictionary-style summary. Group common meanings by part of speech using multiple lines, for example: n. 1. 含义一 2. 含义二\\nv. 1. 含义一 2. 含义二. Keep it concise but complete, covering the most common meanings.\",\"collocations\":[\"common phrase — 中文意思\",\"common phrase — 中文意思\"],\"memory_trick\":\"Chinese mnemonic, word root, prefix/suffix, or usage tip. Leave empty if not useful.\",\"example_sentences\":[{\"english\":\"Short natural example sentence.\",\"chinese\":\"对应的自然中文。\"}]}. Return 2 to 3 common example sentences when useful. Use Chinese in translation and memory_trick. Do not use markdown.";

    let result = call_api(&state, system_prompt, &lookup, Some("json_object")).await?;
    let mut info = serde_json::from_str::<WordInfo>(&result).unwrap_or(WordInfo {
        word: lookup.clone(),
        phonetic: String::new(),
        translation: result,
        collocations: vec![],
        memory_trick: String::new(),
        example_sentences: vec![],
    });

    info = normalize_word_info(info, &lookup);

    if info.translation.is_empty() {
        let fallback_prompt = "You are a concise bilingual dictionary. Return only the complete Chinese meanings for the given English word or short phrase. Group by part of speech when needed.";
        info.translation = call_api(&state, fallback_prompt, &lookup, None).await?;
    }

    let db = state.db.lock().map_err(|e| e.to_string())?;
    save_cached_word_info(db.conn(), &info)?;

    Ok(info)
}
