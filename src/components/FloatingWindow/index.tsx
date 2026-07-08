import React, { useEffect } from "react";
import { useAppStore } from "../../stores/appStore";
import { useThemeStore } from "../../stores/themeStore";
import { TranslateView } from "../TranslateView";
import { WordBook } from "../WordBook";
import { WordDetailView } from "../WordBook/WordDetailView";
import { LearningHistory } from "../LearningHistory";
import { Settings } from "../Settings";
import { VoiceFollowUp } from "../VoiceFollowUp";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "Cmd" : "Ctrl";

const IconTranslate = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </svg>
);

const IconBook = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
);

const IconHistory = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconVoice = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    <path d="M19.07 4.93a10 10 0 010 14.14" />
    <path d="M15.54 8.46a5 5 0 010 7.07" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const IconSettings = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);

export const FloatingWindow: React.FC = () => {
  const viewMode = useAppStore((store) => store.viewMode);
  const setViewMode = useAppStore((store) => store.setViewMode);
  const error = useAppStore((store) => store.error);
  const setError = useAppStore((store) => store.setError);
  const isLoading = useAppStore((store) => store.isLoading);
  const theme = useThemeStore((store) => store.theme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const validModes = [
    "translate",
    "word",
    "sentence",
    "wordbook",
    "wordbook-detail",
    "learning",
    "settings",
    "voicefollowup",
  ];
  const showIdle = !validModes.includes(viewMode);

  const navigate = (mode: string) => {
    setError(null);
    setViewMode(mode as any);
  };

  return (
    <div className="floating-window" data-theme={theme}>
      <div className="content-area">
        {error && !["translate", "word", "sentence"].includes(viewMode) && (
          <div className="error-banner">
            <span>{error}</span>
            <button className="error-dismiss" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        )}

        {isLoading && (
          <div className="loading-container">
            <div className="spinner" />
            <span className="loading-text">查询中...</span>
          </div>
        )}

        {["translate", "word", "sentence"].includes(viewMode) && <TranslateView />}
        {viewMode === "wordbook" && <WordBook />}
        {viewMode === "wordbook-detail" && <WordDetailView />}
        {viewMode === "learning" && <LearningHistory />}
        {viewMode === "settings" && <Settings />}
        {viewMode === "voicefollowup" && <VoiceFollowUp />}

        {showIdle && (
          <div className="idle-state">
            <div className="idle-icon">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="1.5"
                opacity="0.5"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <h3 className="idle-title">Abandon</h3>
            <p className="idle-hint">
              <kbd>{modKey}+Shift+T</kbd> 直接翻译选中文本
            </p>
            <p className="idle-hint">
              <kbd>{modKey}+Shift+Y</kbd> 显示 / 隐藏窗口
            </p>
          </div>
        )}
      </div>

      <div className="bottom-bar">
        <button
          className={`nav-btn ${["translate", "word", "sentence", "idle"].includes(viewMode) ? "active" : ""}`}
          onClick={() => navigate("translate")}
          title="翻译"
        >
          <IconTranslate />
          <span className="nav-btn-label">翻译</span>
        </button>
        <button
          className={`nav-btn ${viewMode === "wordbook" || viewMode === "wordbook-detail" ? "active" : ""}`}
          onClick={() => navigate("wordbook")}
          title="生词本"
        >
          <IconBook />
          <span className="nav-btn-label">词本</span>
        </button>
        <button
          className={`nav-btn ${viewMode === "learning" ? "active" : ""}`}
          onClick={() => navigate("learning")}
          title="已学单词"
        >
          <IconHistory />
          <span className="nav-btn-label">已学</span>
        </button>
        <button
          className={`nav-btn ${viewMode === "voicefollowup" ? "active" : ""}`}
          onClick={() => navigate("voicefollowup")}
          title="跟读"
        >
          <IconVoice />
          <span className="nav-btn-label">跟读</span>
        </button>
        <button
          className={`nav-btn ${viewMode === "settings" ? "active" : ""}`}
          onClick={() => navigate("settings")}
          title="设置"
        >
          <IconSettings />
          <span className="nav-btn-label">设置</span>
        </button>
      </div>
    </div>
  );
};
