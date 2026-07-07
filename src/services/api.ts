import type {
  DateGroup,
  RuntimePaths,
  SentenceAnalysis,
  TranslationResult,
  UserSession,
  WordInfo,
  WordbookEntry,
} from "../types";
import * as browserApi from "./browserApi";
import { isTauriRuntime, tauriInvoke } from "./runtime";

export interface AddWordParams {
  word: string;
  translation: string;
  phonetic?: string | null;
  collocations?: string | null;
  memory_trick?: string | null;
  notes?: string | null;
}

export async function translateText(text: string): Promise<TranslationResult> {
  if (!isTauriRuntime) {
    return browserApi.translateText(text);
  }

  return tauriInvoke<TranslationResult>("translate_text", { text });
}

export async function getWordInfo(word: string): Promise<WordInfo> {
  if (!isTauriRuntime) {
    return browserApi.getWordInfo(word);
  }

  return tauriInvoke<WordInfo>("get_word_info", { word });
}

export async function analyzeSentence(text: string): Promise<SentenceAnalysis> {
  if (!isTauriRuntime) {
    return browserApi.analyzeSentence(text);
  }

  return tauriInvoke<SentenceAnalysis>("analyze_sentence", { text });
}

export async function addWord(params: AddWordParams): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.addWord(params);
  }

  return tauriInvoke<void>("add_word", { request: params });
}

export async function removeWord(word: string): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.removeWord(word);
  }

  return tauriInvoke<void>("remove_word", { word });
}

export async function updateWordFamiliarity(
  word: string,
  familiarity: number
): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.updateWordFamiliarity(word, familiarity);
  }

  return tauriInvoke<void>("update_word_familiarity", { word, familiarity });
}

export async function listWords(): Promise<WordbookEntry[]> {
  if (!isTauriRuntime) {
    return browserApi.listWords();
  }

  return tauriInvoke<WordbookEntry[]>("list_words");
}

export async function searchWords(query: string): Promise<WordbookEntry[]> {
  if (!isTauriRuntime) {
    return browserApi.searchWords(query);
  }

  return tauriInvoke<WordbookEntry[]>("search_words", { query });
}

export async function isWordSaved(word: string): Promise<boolean> {
  if (!isTauriRuntime) {
    return browserApi.isWordSaved(word);
  }

  return tauriInvoke<boolean>("is_word_saved", { word });
}

export async function getWordsByDate(): Promise<DateGroup[]> {
  if (!isTauriRuntime) {
    return browserApi.getWordsByDate();
  }

  return tauriInvoke<DateGroup[]>("get_words_by_date");
}

export async function getTodayWordCount(): Promise<number> {
  if (!isTauriRuntime) {
    return browserApi.getTodayWordCount();
  }

  return tauriInvoke<number>("get_today_word_count");
}

export async function speakText(
  text: string,
  expressive = false
): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.speakText(text, expressive);
  }

  return tauriInvoke<void>("speak_text", { text, expressive });
}

export async function stopSpeech(): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.stopSpeech();
  }

  return tauriInvoke<void>("stop_speech");
}

export async function playBritishPronunciation(word: string): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.playBritishPronunciation(word);
  }

  return tauriInvoke<void>("play_british_pronunciation", { word });
}

export async function getSelectedText(): Promise<string> {
  if (!isTauriRuntime) {
    return browserApi.getSelectedText();
  }

  return tauriInvoke<string>("get_selected_text");
}

export async function getConfig(key: string): Promise<string | null> {
  if (!isTauriRuntime) {
    return browserApi.getConfig(key);
  }

  return tauriInvoke<string | null>("get_config", { key });
}

export async function setConfig(key: string, value: string): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.setConfig(key, value);
  }

  return tauriInvoke<void>("set_config", { key, value });
}

export async function getRuntimePaths(): Promise<RuntimePaths> {
  if (!isTauriRuntime) {
    return browserApi.getRuntimePaths();
  }

  return tauriInvoke<RuntimePaths>("get_runtime_paths");
}

export async function registerUser(
  username: string,
  password: string
): Promise<UserSession> {
  if (!isTauriRuntime) {
    return browserApi.registerUser(username, password);
  }

  return tauriInvoke<UserSession>("register_user", { username, password });
}

export async function loginUser(
  username: string,
  password: string
): Promise<UserSession> {
  if (!isTauriRuntime) {
    return browserApi.loginUser(username, password);
  }

  return tauriInvoke<UserSession>("login_user", { username, password });
}

export async function logoutUser(): Promise<void> {
  if (!isTauriRuntime) {
    return browserApi.logoutUser();
  }

  return tauriInvoke<void>("logout_user");
}

export async function getCurrentUser(): Promise<UserSession | null> {
  if (!isTauriRuntime) {
    return browserApi.getCurrentUser();
  }

  return tauriInvoke<UserSession | null>("get_current_user");
}

export async function syncNow(): Promise<string> {
  if (!isTauriRuntime) {
    return browserApi.syncNow();
  }

  return tauriInvoke<string>("sync_now");
}

export async function consumePendingTranslation(): Promise<string | null> {
  if (!isTauriRuntime) {
    return null;
  }

  return tauriInvoke<string | null>("consume_pending_translation");
}
