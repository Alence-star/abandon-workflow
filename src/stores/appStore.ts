import { create } from "zustand";
import type {
  TranslationResult,
  WordInfo,
  SentenceAnalysis,
  WordbookEntry,
} from "../types";

export type ViewMode =
  | "translate"
  | "word"
  | "sentence"
  | "wordbook-detail"
  | "learning"
  | "settings"
  | "voicefollowup"
  | "idle";

interface AppStore {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  selectedText: string;
  setSelectedText: (text: string) => void;

  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  error: string | null;
  setError: (error: string | null) => void;

  translation: TranslationResult | null;
  setTranslation: (result: TranslationResult | null) => void;

  wordInfo: WordInfo | null;
  setWordInfo: (info: WordInfo | null) => void;

  sentenceAnalysis: SentenceAnalysis | null;
  setSentenceAnalysis: (analysis: SentenceAnalysis | null) => void;

  isWindowVisible: boolean;
  setWindowVisible: (visible: boolean) => void;

  selectedWordbookEntry: WordbookEntry | null;
  setSelectedWordbookEntry: (entry: WordbookEntry | null) => void;

  reset: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  viewMode: "idle",
  setViewMode: (mode) => set({ viewMode: mode }),

  selectedText: "",
  setSelectedText: (text) => set({ selectedText: text }),

  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),

  error: null,
  setError: (error) => set({ error }),

  translation: null,
  setTranslation: (result) => set({ translation: result }),

  wordInfo: null,
  setWordInfo: (info) => set({ wordInfo: info }),

  sentenceAnalysis: null,
  setSentenceAnalysis: (analysis) => set({ sentenceAnalysis: analysis }),

  isWindowVisible: false,
  setWindowVisible: (visible) => set({ isWindowVisible: visible }),

  selectedWordbookEntry: null,
  setSelectedWordbookEntry: (entry) => set({ selectedWordbookEntry: entry }),

  reset: () =>
    set({
      viewMode: "idle",
      selectedText: "",
      isLoading: false,
      error: null,
      translation: null,
      wordInfo: null,
      sentenceAnalysis: null,
    }),
}));
