import React, { useState } from "react";
import { useAppStore } from "../../stores/appStore";
import {
  playBritishPronunciation,
  removeWord,
  updateWordFamiliarity,
} from "../../services/api";
import type { WordbookEntry } from "../../types";

const FAMILIARITY_LABELS = ["完全不会", "见过", "基本认识", "已掌握"];
const FAMILIARITY_COLORS = ["#ef4444", "#f97316", "#eab308", "#9ca3af"];

export const WordDetailView: React.FC = () => {
  const entry = useAppStore((store) => store.selectedWordbookEntry);
  const setViewMode = useAppStore((store) => store.setViewMode);
  const [familiarity, setFamiliarity] = useState(entry?.familiarity ?? 0);

  if (!entry) {
    return (
      <div className="wd">
        <div className="wd-back">
          <button className="wd-back-btn" onClick={() => setViewMode("learning")}>
            返回
          </button>
        </div>
        <div className="wd-empty">还没有选中单词。</div>
      </div>
    );
  }

  const collocations = entry.collocations
    ? entry.collocations.split("\n").filter(Boolean)
    : [];

  const handleDelete = async () => {
    try {
      await removeWord(entry.word);
      setViewMode("learning");
    } catch (error) {
      console.error("Failed to delete word:", error);
    }
  };

  const handleSetFamiliarity = async (level: number) => {
    setFamiliarity(level);
    try {
      await updateWordFamiliarity(entry.word, level);
      (entry as WordbookEntry).familiarity = level;
    } catch (error) {
      console.error("Failed to update familiarity:", error);
    }
  };

  return (
    <div className="wd">
      <div className="wd-back">
        <button className="wd-back-btn" onClick={() => setViewMode("learning")}>
          返回
        </button>
        <button className="wd-del-btn" onClick={handleDelete} title="删除单词">
          删除
        </button>
      </div>

      <div className="wd-hero">
        <h1 className="wd-word">{entry.word}</h1>
        {entry.phonetic && <div className="wd-phonetic">{entry.phonetic}</div>}
        <div className="wd-hero-actions">
          <button
            className="wd-round-btn"
            onClick={() => playBritishPronunciation(entry.word)}
            title="英式发音"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
        </div>
      </div>

      <div className="wd-card">
        <div className="wd-card-label">中文释义</div>
        <div className="wd-card-body">{entry.translation}</div>
      </div>

      {!!collocations.length && (
        <div className="wd-card">
          <div className="wd-card-label">常见搭配</div>
          <div className="wd-tags">
            {collocations.map((item, index) => (
              <span key={`${item}-${index}`} className="wd-tag">
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      {!!entry.memory_trick && (
        <div className="wd-card wd-card-note">
          <div className="wd-card-label">记忆提示</div>
          <div className="wd-card-body wd-card-note-body">{entry.memory_trick}</div>
        </div>
      )}

      <div className="wd-card">
        <div className="wd-card-label">学习状态</div>
        <div className="wd-status-row">
          {[0, 1, 2, 3].map((level) => (
            <button
              key={level}
              className={`wd-status-btn${familiarity === level ? " active" : ""}`}
              onClick={() => handleSetFamiliarity(level)}
            >
              <span
                className="wd-status-dot"
                style={{ background: FAMILIARITY_COLORS[level] }}
              />
              <span>{FAMILIARITY_LABELS[level]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="wd-actions">
        <button className="wd-action-btn wd-action-save">已收藏</button>
        <button className="wd-action-btn wd-action-del" onClick={handleDelete}>
          删除
        </button>
      </div>
    </div>
  );
};
