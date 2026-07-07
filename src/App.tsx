import React, { useEffect } from "react";
import { FloatingWindow } from "./components/FloatingWindow";
import { useTheme } from "./hooks/useTheme";
import {
  analyzeSentence,
  consumePendingTranslation,
  getWordInfo,
  translateText,
} from "./services/api";
import { runtimeLabel, isTauriRuntime } from "./services/runtime";
import { useAppStore } from "./stores/appStore";
import "./styles/globals.css";

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
      return;
    }

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
    document.documentElement.dataset.runtime = runtimeLabel;
    document.body.dataset.runtime = runtimeLabel;
  }, []);

  useEffect(() => {
    if (!isTauriRuntime) {
      const presetText = new URLSearchParams(window.location.search).get("text");
      if (presetText?.trim()) {
        void handleTranslateText(presetText.trim());
      }
      return;
    }

    const timer = window.setInterval(async () => {
      try {
        const text = await consumePendingTranslation();
        if (!text?.trim()) {
          return;
        }

        const store = useAppStore.getState();

        if (text === "!wordbook") {
          store.reset();
          store.setViewMode("wordbook");
          return;
        }

        if (text === "!learning") {
          store.reset();
          store.setViewMode("learning");
          return;
        }

        if (text === "!settings") {
          store.reset();
          store.setViewMode("settings");
          return;
        }

        if (text === "!toggle") {
          return;
        }

        if (text.startsWith("!error:")) {
          const errorMessage = text.replace("!error:", "").trim();
          store.reset();
          store.setViewMode("translate");
          store.setError(errorMessage);
          return;
        }

        await handleTranslateText(text.trim());
      } catch {
        // Ignore transient polling errors.
      }
    }, 500);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className={`app-root ${runtimeLabel}-runtime`}>
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
