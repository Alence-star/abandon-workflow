import { invoke } from "@tauri-apps/api/core";
import type {
  TranslationResult,
  WordInfo,
  SentenceAnalysis,
  WordbookEntry,
  DateGroup,
  UserSession,
  RuntimePaths,
} from "../types";

// ===== Translation =====

export async function translateText(text: string): Promise<TranslationResult> {
  return invoke<TranslationResult>("translate_text", { text });
}

export async function getWordInfo(word: string): Promise<WordInfo> {
  return invoke<WordInfo>("get_word_info", { word });
}

export async function analyzeSentence(text: string): Promise<SentenceAnalysis> {
  return invoke<SentenceAnalysis>("analyze_sentence", { text });
}

// ===== Wordbook =====

export interface AddWordParams {
  word: string;
  translation: string;
  phonetic?: string | null;
  collocations?: string | null;
  memory_trick?: string | null;
  notes?: string | null;
}

export async function addWord(params: AddWordParams): Promise<void> {
  return invoke<void>("add_word", { request: params });
}

export async function removeWord(word: string): Promise<void> {
  return invoke<void>("remove_word", { word });
}

export async function updateWordFamiliarity(
  word: string,
  familiarity: number
): Promise<void> {
  return invoke<void>("update_word_familiarity", { word, familiarity });
}

export async function listWords(): Promise<WordbookEntry[]> {
  return invoke<WordbookEntry[]>("list_words");
}

export async function searchWords(query: string): Promise<WordbookEntry[]> {
  return invoke<WordbookEntry[]>("search_words", { query });
}

export async function isWordSaved(word: string): Promise<boolean> {
  return invoke<boolean>("is_word_saved", { word });
}

export async function getWordsByDate(): Promise<DateGroup[]> {
  return invoke<DateGroup[]>("get_words_by_date");
}

export async function getTodayWordCount(): Promise<number> {
  return invoke<number>("get_today_word_count");
}

// ===== TTS =====

export async function speakText(
  text: string,
  expressive = false
): Promise<void> {
  return invoke<void>("speak_text", { text, expressive });
}

export async function stopSpeech(): Promise<void> {
  return invoke<void>("stop_speech");
}

export async function playBritishPronunciation(word: string): Promise<void> {
  return invoke<void>("play_british_pronunciation", { word });
}

// ===== Clipboard =====

export async function getSelectedText(): Promise<string> {
  return invoke<string>("get_selected_text");
}

// ===== Config =====

export async function getConfig(key: string): Promise<string | null> {
  return invoke<string | null>("get_config", { key });
}

export async function setConfig(key: string, value: string): Promise<void> {
  return invoke<void>("set_config", { key, value });
}

export async function getRuntimePaths(): Promise<RuntimePaths> {
  return invoke<RuntimePaths>("get_runtime_paths");
}

// ===== Auth =====

export async function registerUser(
  username: string,
  password: string
): Promise<UserSession> {
  return invoke<UserSession>("register_user", { username, password });
}

export async function loginUser(
  username: string,
  password: string
): Promise<UserSession> {
  return invoke<UserSession>("login_user", { username, password });
}

export async function logoutUser(): Promise<void> {
  return invoke<void>("logout_user");
}

export async function getCurrentUser(): Promise<UserSession | null> {
  return invoke<UserSession | null>("get_current_user");
}

export async function syncNow(): Promise<string> {
  return invoke<string>("sync_now");
}
