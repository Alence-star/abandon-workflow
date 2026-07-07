import React, { useCallback, useEffect, useRef, useState } from "react";
import { handleTranslateText } from "../../App";
import { useAppStore } from "../../stores/appStore";
import { addWord, getSelectedText, speakText } from "../../services/api";
import { PronunciationButton } from "../common/PronunciationButton";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "Cmd" : "Ctrl";

export const TranslateView: React.FC = () => {
  const store = useAppStore();
  const [inputText, setInputText] = useState(store.selectedText || "");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const previousLoading = useRef(store.isLoading);

  const {
    isLoading,
    viewMode,
    wordInfo,
    translation,
    sentenceAnalysis,
    selectedText,
  } = store;

  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }, [inputText]);

  useEffect(() => {
    if (!isLoading && previousLoading.current && selectedText) {
      setInputText(selectedText);
    }
    previousLoading.current = isLoading;
  }, [isLoading, selectedText]);

  const doTranslate = useCallback((text: string) => {
    void handleTranslateText(text);
  }, []);

  const handleTranslateClick = () => {
    doTranslate(inputText);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      doTranslate(inputText);
    }
  };

  const handleReadSelection = async () => {
    try {
      const text = await getSelectedText();
      if (text.trim()) {
        setInputText(text.trim());
        doTranslate(text.trim());
      } else {
        store.setError("没有读取到可用文本。");
      }
    } catch (error) {
      store.setError(String(error));
    }
  };

  const handleOpenSettings = () => {
    store.setError(null);
    store.setViewMode("settings");
  };

  const handleSaveWord = async () => {
    const word = wordInfo?.word || selectedText || inputText;
    if (!word.trim()) {
      return;
    }

    try {
      await addWord({
        word,
        translation: translation?.translation || wordInfo?.translation || "",
        phonetic: wordInfo?.phonetic || null,
        collocations: wordInfo?.collocations?.join("\n") || null,
        memory_trick: wordInfo?.memory_trick || null,
      });
      store.setError("已添加到生词本。");
      setTimeout(() => store.setError(null), 1800);
    } catch (error) {
      store.setError(`添加失败：${String(error)}`);
    }
  };

  const showWordResult = !isLoading && viewMode === "word" && (wordInfo || translation);
  const showSentenceResult =
    !isLoading && viewMode === "sentence" && (sentenceAnalysis || translation);

  return (
    <div className="translate-view">
      {store.error && (
        <div className="tv-error-banner">
          <div className="tv-error-icon">!</div>
          <div className="tv-error-body">
            <div className="tv-error-text">{store.error}</div>
            <div className="tv-error-actions">
              {/(API|Key|key)/.test(store.error) && (
                <button className="tv-error-btn" onClick={handleOpenSettings}>
                  打开设置
                </button>
              )}
              <button className="tv-error-btn" onClick={() => store.setError(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="tv-loading">
          <div className="spinner" />
          <span className="loading-text">查询中...</span>
        </div>
      )}

      {showWordResult && (
        <div className="tv-result">
          <div className="word-detail">
            <div className="word-header">
              <div className="word-main">
                <h2 className="word-text">{wordInfo?.word || selectedText || "-"}</h2>
                <PronunciationButton word={wordInfo?.word || selectedText || ""} size={22} />
                <button
                  className="action-btn"
                  onClick={() => speakText(wordInfo?.word || selectedText || "", false)}
                  title="朗读单词"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              </div>
              {wordInfo?.phonetic && <div className="phonetic">{wordInfo.phonetic}</div>}
            </div>

            <div className="section">
              <div className="section-label">中文释义</div>
              <div className="translation-text">
                {wordInfo?.translation || translation?.translation || "暂无释义"}
              </div>
            </div>

            {!!wordInfo?.collocations?.length && (
              <div className="section">
                <div className="section-label">常见搭配</div>
                <div className="collocations-list">
                  {wordInfo.collocations.map((item, index) => (
                    <div key={`${item}-${index}`} className="collocation-item">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!!wordInfo?.memory_trick && (
              <div className="section">
                <div className="section-label">记忆提示</div>
                <div className="memory-trick-text">{wordInfo.memory_trick}</div>
              </div>
            )}

            {!!wordInfo?.example_sentences?.length && (
              <div className="section">
                <div className="section-label">例句</div>
                <div className="example-sentence-list">
                  {wordInfo.example_sentences.map((item, index) => (
                    <div key={`${item.english}-${index}`} className="example-sentence-card">
                      <div className="example-sentence-en">{item.english}</div>
                      <div className="example-sentence-zh">{item.chinese}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="word-actions">
              <button className="save-btn" onClick={handleSaveWord}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
                添加到生词本
              </button>
            </div>
          </div>
        </div>
      )}

      {showSentenceResult && (
        <div className="tv-result">
          <div className="sentence-detail">
            <div className="section">
              <div className="section-label">原文</div>
              <div className="original-text">{selectedText}</div>
              <div className="action-row">
                <PronunciationButton
                  word={(selectedText || "").split(/\s+/)[0] || "the"}
                />
                <button
                  className="action-btn"
                  onClick={() => speakText(selectedText || "", true)}
                  title="朗读句子"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span className="action-label">朗读句子</span>
                </button>
              </div>
            </div>

            <div className="section">
              <div className="section-label">中文翻译</div>
              <div className="translation-text">
                {sentenceAnalysis?.translation || translation?.translation || "暂无翻译"}
              </div>
            </div>

            {sentenceAnalysis?.grammar && (
              <div className="section grammar-section">
                <div className="section-label">语法分析</div>
                <div className="grammar-row">
                  <span className="grammar-label">结构：</span>
                  <span className="grammar-value">
                    {sentenceAnalysis.grammar.sentence_structure}
                  </span>
                </div>
                <div className="grammar-row">
                  <span className="grammar-label">时态：</span>
                  <span className="grammar-value">
                    {sentenceAnalysis.grammar.tense}
                  </span>
                </div>
                {!!sentenceAnalysis.grammar.clauses?.length && (
                  <div className="grammar-clauses">
                    <div className="grammar-label">从句拆分：</div>
                    {sentenceAnalysis.grammar.clauses.map((clause, index) => (
                      <div key={`${clause.content}-${index}`} className="clause-item">
                        <span className="clause-type">{clause.clause_type}</span>
                        <span className="clause-content">{clause.content}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div
              className="word-actions"
              style={{
                borderTop: "1px solid var(--color-border)",
                marginTop: 8,
                paddingTop: 8,
              }}
            >
              <button className="save-btn" onClick={handleSaveWord}>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                </svg>
                添加到生词本
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tv-input-section">
        <div className="section-label" style={{ padding: "0 16px", marginTop: 8 }}>
          输入英文并翻译
        </div>
        <textarea
          ref={inputRef}
          className="tv-textarea"
          placeholder="在这里输入英文，按 Enter 直接翻译..."
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={3}
        />
        <div className="tv-input-actions">
          <button
            className="tv-translate-btn"
            onClick={handleTranslateClick}
            disabled={!inputText.trim() || isLoading}
          >
            {isLoading ? "处理中..." : "翻译"}
          </button>
          <button className="tv-paste-btn" onClick={handleReadSelection}>
            读取剪贴板
          </button>
          <button
            className="tv-paste-btn"
            onClick={handleSaveWord}
            disabled={!inputText.trim()}
          >
            添加生词
          </button>
        </div>
        <p className="tv-hint">
          <kbd>{modKey}+Shift+T</kbd> 直接翻译选中文本
          <kbd>{modKey}+Shift+Y</kbd> 显示 / 隐藏窗口
        </p>
      </div>
    </div>
  );
};
