import React, { useCallback, useEffect, useState } from "react";
import { useAppStore } from "../../stores/appStore";
import { getWordsByDate, playBritishPronunciation } from "../../services/api";
import type { DateGroup, WordbookEntry } from "../../types";

const FAMILIARITY_COLORS = ["#ef4444", "#f97316", "#eab308", "#9ca3af"];

export const LearningHistory: React.FC = () => {
  const [groups, setGroups] = useState<DateGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedLabels, setExpandedLabels] = useState<Set<string>>(new Set());
  const setViewMode = useAppStore((store) => store.setViewMode);
  const setSelectedWordbookEntry = useAppStore(
    (store) => store.setSelectedWordbookEntry
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getWordsByDate();
      setGroups(result);

      const autoExpanded = new Set<string>();
      result.forEach((group) => {
        if (group.label === "今天" || group.label === "昨天") {
          autoExpanded.add(group.label);
        }
      });
      setExpandedLabels(autoExpanded);
    } catch (error) {
      console.error("[Abandon] Failed to load learning history:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpand = (label: string) => {
    setExpandedLabels((previous) => {
      const next = new Set(previous);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  };

  const openDetail = (entry: WordbookEntry) => {
    setSelectedWordbookEntry(entry);
    setViewMode("wordbook-detail");
  };

  return (
    <div className="lh">
      <div className="lh-header">
        <h3 className="lh-title">已学单词</h3>
      </div>

      {isLoading && <div className="lh-loading">加载中...</div>}

      {!isLoading && groups.length === 0 && (
        <div className="lh-empty">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            strokeWidth="1.5"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="lh-empty-title">还没有学习记录</p>
          <p className="lh-empty-hint">翻译后收藏单词，这里会自动累计。</p>
        </div>
      )}

      {!isLoading &&
        groups.map((group) => (
          <div key={group.label} className="lh-group">
            <button
              className="lh-group-header"
              onClick={() => toggleExpand(group.label)}
            >
              <span className="lh-group-label">{group.label}</span>
              <span className="lh-group-count">学习了 {group.count} 个单词</span>
              <span
                className={`lh-group-arrow ${
                  expandedLabels.has(group.label) ? "expanded" : ""
                }`}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </span>
            </button>

            {expandedLabels.has(group.label) && (
              <div className="lh-group-words">
                {group.words.map((entry) => (
                  <div
                    key={entry.id}
                    className="lh-card"
                    onClick={() => openDetail(entry)}
                  >
                    <span
                      className="lh-dot"
                      style={{ background: FAMILIARITY_COLORS[entry.familiarity] }}
                    />
                    <div className="lh-card-body">
                      <div className="lh-card-top">
                        <span className="lh-card-word">{entry.word}</span>
                        {entry.phonetic && (
                          <span className="lh-card-phonetic">{entry.phonetic}</span>
                        )}
                        <button
                          className="lh-card-speak"
                          onClick={(event) => {
                            event.stopPropagation();
                            void playBritishPronunciation(entry.word);
                          }}
                          title="朗读"
                        >
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polygon points="5 3 19 12 5 21 5 3" />
                          </svg>
                        </button>
                      </div>
                      <div className="lh-card-trans">{entry.translation}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
};
