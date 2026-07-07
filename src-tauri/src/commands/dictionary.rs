use crate::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct DictionaryEntry {
    pub word: String,
    pub phonetic: Option<String>,
    pub translation: String,
    pub collocations: Option<Vec<String>>,
    pub memory_trick: Option<String>,
}

fn parse_collocations(raw: Option<String>) -> Option<Vec<String>> {
    raw.map(|value| {
        value
            .split(['\n', ';'])
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>()
    })
    .filter(|items| !items.is_empty())
}

#[tauri::command]
pub async fn lookup_word(word: String, state: State<'_, AppState>) -> Result<Option<DictionaryEntry>, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .conn()
        .prepare_cached("SELECT word, phonetic, translation, collocations, memory_trick FROM words WHERE word = ?1")
        .map_err(|e| e.to_string())?;

    let result = stmt
        .query_row([&word], |row| {
            Ok(DictionaryEntry {
                word: row.get(0)?,
                phonetic: row.get(1)?,
                translation: row.get(2)?,
                collocations: parse_collocations(row.get::<_, Option<String>>(3)?),
                memory_trick: row.get(4)?,
            })
        })
        .ok();

    Ok(result)
}
