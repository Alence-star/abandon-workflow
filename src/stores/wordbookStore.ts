import { create } from "zustand";
import type { WordbookEntry } from "../types";

interface WordbookStore {
  words: WordbookEntry[];
  searchQuery: string;
  isLoading: boolean;

  setWords: (words: WordbookEntry[]) => void;
  setSearchQuery: (query: string) => void;
  setIsLoading: (loading: boolean) => void;
  addEntry: (entry: WordbookEntry) => void;
  removeEntry: (word: string) => void;
  updateEntryFamiliarity: (word: string, familiarity: number) => void;
}

export const useWordbookStore = create<WordbookStore>((set) => ({
  words: [],
  searchQuery: "",
  isLoading: false,

  setWords: (words) => set({ words }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsLoading: (loading) => set({ isLoading: loading }),
  addEntry: (entry) =>
    set((state) => ({ words: [entry, ...state.words] })),
  removeEntry: (word) =>
    set((state) => ({
      words: state.words.filter((w) => w.word !== word),
    })),
  updateEntryFamiliarity: (word, familiarity) =>
    set((state) => ({
      words: state.words.map((w) =>
        w.word === word ? { ...w, familiarity } : w
      ),
    })),
}));
