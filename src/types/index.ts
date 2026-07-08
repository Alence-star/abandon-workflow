export interface TranslationResult {
  original: string;
  translation: string;
  source_lang: string;
}

export interface ExampleSentence {
  english: string;
  chinese: string;
}

export interface WordInfo {
  word: string;
  phonetic: string;
  translation: string;
  collocations: string[];
  memory_trick: string;
  example_sentences: ExampleSentence[];
}

export interface SentenceAnalysis {
  translation: string;
  grammar: GrammarInfo;
}

export interface GrammarInfo {
  sentence_structure: string;
  tense: string;
  clauses: ClauseInfo[];
}

export interface ClauseInfo {
  clause_type: string;
  content: string;
}

export interface WordbookEntry {
  id: number;
  word: string;
  translation: string;
  notes: string | null;
  phonetic?: string;
  collocations?: string;
  memory_trick?: string;
  familiarity: number;
  created_at: string;
}

export interface DateGroup {
  label: string;
  count: number;
  words: WordbookEntry[];
}

export interface UserSession {
  id: number;
  username: string;
}

export interface RuntimePaths {
  data_dir: string;
  database_path: string;
  sync_dir: string | null;
  sync_file_path: string | null;
}

export type ViewMode =
  | "translate"
  | "word"
  | "sentence"
  | "wordbook-detail"
  | "learning"
  | "settings"
  | "voicefollowup"
  | "idle";

export type ThemeMode = "light" | "dark";
