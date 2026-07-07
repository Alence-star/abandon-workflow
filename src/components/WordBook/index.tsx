import React, { useEffect, useState, useCallback } from "react";
import { useWordbookStore } from "../../stores/wordbookStore";
import { useAppStore } from "../../stores/appStore";
import {
  listWords,
  searchWords,
  removeWord,
  updateWordFamiliarity,
  playBritishPronunciation,
} from "../../services/api";
import type { WordbookEntry } from "../../types";

const FAMILIARITY_COLORS = ["#ef4444", "#f97316", "#eab308", "#9ca3af"];
const isMac = navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "Cmd" : "Ctrl";

export const WordBook: React.FC = () => {
  const { words, searchQuery, setWords, setSearchQuery, removeEntry, updateEntryFamiliarity } = useWordbookStore();
  const setViewMode = useAppStore((s) => s.setViewMode);
  const setSelectedWordbookEntry = useAppStore((s) => s.setSelectedWordbookEntry);
  const [isLoading, setIsLoading] = useState(false);

  const loadWords = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = searchQuery ? await searchWords(searchQuery) : await listWords();
      setWords(result);
    } catch (err) {
      console.error("Failed to load wordbook:", err);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, setWords]);

  useEffect(() => { loadWords(); }, [loadWords]);

  const handleRemove = async (e: React.MouseEvent, entry: WordbookEntry) => {
    e.stopPropagation();
    try { await removeWord(entry.word); removeEntry(entry.word); } catch {}
  };

  const cycleFamiliarity = async (e: React.MouseEvent, entry: WordbookEntry) => {
    e.stopPropagation();
    const next = (entry.familiarity + 1) % 4;
    try {
      await updateWordFamiliarity(entry.word, next);
      updateEntryFamiliarity(entry.word, next);
    } catch {}
  };

  const openDetail = (entry: WordbookEntry) => {
    setSelectedWordbookEntry(entry);
    setViewMode("wordbook-detail");
  };

  return (
    <div className="wb">
      {/* Raycast-style search */}
      <div className="wb-search">
        <svg className="wb-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          className="wb-search-input"
          placeholder="搜索单词或中文释义..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* Card list */}
      <div className="wb-list">
        {isLoading && <div className="wb-loading">加载中...</div>}

        {!isLoading && words.length === 0 && (
          <div className="wb-empty">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="1.5">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
            </svg>
            <p className="wb-empty-title">生词本为空</p>
            <p className="wb-empty-hint">{modKey}+Shift+T 查词后可直接收藏</p>
          </div>
        )}

        {!isLoading && words.map((entry) => (
          <div key={entry.id} className="wb-card" onClick={() => openDetail(entry)}>
            {/* Familiarity dot */}
            <div className="wb-dot-wrap" onClick={(e) => cycleFamiliarity(e, entry)} title={["完全不会", "见过", "基本认识", "已掌握"][entry.familiarity]}>
              <span className="wb-dot" style={{ background: FAMILIARITY_COLORS[entry.familiarity] }} />
            </div>

            {/* Content */}
            <div className="wb-card-body">
              <div className="wb-card-top">
                <span className="wb-card-word">{entry.word}</span>
                {entry.phonetic && <span className="wb-card-phonetic">{entry.phonetic}</span>}
                <button className="wb-card-speak" onClick={(e) => { e.stopPropagation(); playBritishPronunciation(entry.word); }} title="朗读">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              </div>
              <div className="wb-card-trans">{entry.translation}</div>
              <div className="wb-card-date">{new Date(entry.created_at + "Z").toLocaleDateString("zh-CN")}</div>
            </div>

            {/* Hover delete */}
            <button className="wb-card-del" onClick={(e) => handleRemove(e, entry)} title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="wb-footer">
        {words.length > 0 && <span className="wb-count">共 {words.length} 个单词</span>}
      </div>
    </div>
  );
};
