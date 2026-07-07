import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { FloatingWindow } from "./components/FloatingWindow";
import { useTheme } from "./hooks/useTheme";
import { analyzeSentence, getWordInfo, translateText } from "./services/api";
import { useAppStore } from "./stores/appStore";
import "./styles/globals.css";

const appWindow = getCurrentWebviewWindow();
void appWindow;

export async function handleTranslateText(text: string) {
  const store = useAppStore.getState();
  const trimmed = text.trim();

  store.reset();
  store.setViewMode("translate");
  store.setIsLoading(true);
  store.setError(null);

  if (!trimmed) {
    store.setIsLoading(false);
    return;
  }

  store.setSelectedText(trimmed);
  const words = trimmed.split(/\s+/).filter(Boolean);

  try {
    if (words.length <= 2) {
      store.setViewMode("word");

      const info = await getWordInfo(trimmed);
      store.setWordInfo(info);
      store.setTranslation({
        original: trimmed,
        translation: info.translation,
        source_lang: "en",
      });
    } else {
      store.setViewMode("sentence");

      let analysis = null;
      let translation = null;

      try {
        analysis = await analyzeSentence(trimmed);
      } catch (error) {
        console.warn("[Abandon] analyzeSentence failed:", error);
      }

      try {
        translation = await translateText(trimmed);
      } catch (error) {
        console.warn("[Abandon] translateText failed:", error);
      }

      if (!analysis && translation) {
        analysis = {
          translation: translation.translation,
          grammar: {
            sentence_structure: "未提供",
            tense: "未提供",
            clauses: [],
          },
        };
      }

      if (!translation && analysis?.translation) {
        translation = {
          original: trimmed,
          translation: analysis.translation,
          source_lang: "en",
        };
      }

      store.setSentenceAnalysis(analysis);
      store.setTranslation(translation);
    }
  } catch (error) {
    const message = String(error);
    store.setError(message);

    if (words.length <= 2) {
      try {
        const fallback = await translateText(trimmed);
        store.setViewMode("word");
        store.setWordInfo({
          word: trimmed,
          phonetic: "",
          translation: fallback.translation,
          collocations: [],
          memory_trick: "",
          example_sentences: [],
        });
        store.setTranslation(fallback);
      } catch {
        store.setTranslation(null);
      }
    }
  } finally {
    store.setIsLoading(false);
  }
}

const App: React.FC = () => {
  useTheme();

  useEffect(() => {
    const timer = setInterval(async () => {
      try {
        const text = await invoke<string | null>("consume_pending_translation");
        if (!text?.trim()) {
          return;
        }

        if (text === "!wordbook") {
          useAppStore.getState().reset();
          useAppStore.getState().setViewMode("wordbook");
          return;
        }

        if (text === "!learning") {
          useAppStore.getState().reset();
          useAppStore.getState().setViewMode("learning");
          return;
        }

        if (text === "!settings") {
          useAppStore.getState().reset();
          useAppStore.getState().setViewMode("settings");
          return;
        }

        if (text === "!toggle") {
          return;
        }

        if (text.startsWith("!error:")) {
          const errorMessage = text.replace("!error:", "").trim();
          useAppStore.getState().reset();
          useAppStore.getState().setViewMode("translate");
          useAppStore.getState().setError(errorMessage);
          return;
        }

        handleTranslateText(text.trim());
      } catch {
        // Ignore transient polling errors.
      }
    }, 500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app-root">
      <div className="title-bar" data-tauri-drag-region>
        <div className="title-bar-drag" data-tauri-drag-region>
          <span className="title-bar-text">Abandon</span>
        </div>
      </div>
      <FloatingWindow />
    </div>
  );
};

export default App;
