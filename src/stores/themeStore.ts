import { create } from "zustand";

type ThemeMode = "light" | "dark";

interface ThemeStore {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light",
  toggleTheme: () =>
    set((state) => ({
      theme: state.theme === "light" ? "dark" : "light",
    })),
  setTheme: (theme) => set({ theme }),
}));
