import React, { useEffect, useMemo, useState } from "react";
import { speakText } from "../../services/api";

interface WeeklySpeech {
  id: string;
  title: string;
  speaker: string;
  text: string;
  sourceUrl?: string;
  publishedAt?: string | null;
  source?: string;
}

interface WeeklySpeechPayload {
  generatedAt?: string;
  speeches?: WeeklySpeech[];
}

const REMOTE_MATERIAL_URL =
  "https://alence-star.github.io/abandon-workflow/pwa/data/weekly-speeches.json";

const FALLBACK_SPEECHES: WeeklySpeech[] = [
  {
    id: "fallback-connection",
    title: "The Power of Vulnerability",
    speaker: "Brene Brown",
    text: "Connection gives purpose and meaning to our lives. The ability to feel connected is part of what makes us human.",
  },
  {
    id: "fallback-creativity",
    title: "Do Schools Kill Creativity?",
    speaker: "Sir Ken Robinson",
    text: "Creativity is as important in education as literacy, and it deserves the same attention. Children are often willing to try before they know the answer.",
  },
  {
    id: "fallback-grit",
    title: "Grit: The Power of Passion and Perseverance",
    speaker: "Angela Duckworth",
    text: "Grit means sustaining interest and effort toward long-term goals. It is the habit of continuing even when progress feels slow.",
  },
];

function isSpeech(value: unknown): value is WeeklySpeech {
  if (!value || typeof value !== "object") return false;
  const speech = value as Partial<WeeklySpeech>;
  return Boolean(
    typeof speech.id === "string" &&
      typeof speech.title === "string" &&
      typeof speech.speaker === "string" &&
      typeof speech.text === "string" &&
      speech.text.trim()
  );
}

async function fetchWeeklyMaterial(): Promise<WeeklySpeechPayload> {
  const localUrl = new URL(
    "./data/weekly-speeches.json",
    window.location.href
  ).toString();

  for (const url of [REMOTE_MATERIAL_URL, localUrl]) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const payload = (await response.json()) as WeeklySpeechPayload;
      const speeches = payload.speeches?.filter(isSpeech) ?? [];
      if (speeches.length > 0) {
        return { ...payload, speeches };
      }
    } catch (error) {
      console.warn(`[Abandon] Weekly speech source unavailable: ${url}`, error);
    }
  }

  return { speeches: FALLBACK_SPEECHES };
}

export const VoiceFollowUp: React.FC = () => {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [material, setMaterial] = useState<WeeklySpeechPayload>({
    speeches: FALLBACK_SPEECHES,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void fetchWeeklyMaterial()
      .then((payload) => {
        if (active) setMaterial(payload);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const updateLabel = useMemo(() => {
    if (!material.generatedAt) return "离线练习素材";
    const generatedAt = new Date(material.generatedAt);
    if (Number.isNaN(generatedAt.getTime())) return "每周自动更新";
    return `${generatedAt.toLocaleDateString("zh-CN")} 更新`;
  }, [material.generatedAt]);

  const handlePlay = async (text: string, id: string) => {
    try {
      setPlayingId(id);
      await speakText(text, true);
    } catch (error) {
      console.error("Playback failed:", error);
    } finally {
      setPlayingId(null);
    }
  };

  return (
    <div className="voice-followup">
      <div className="vf-content">
        <div className="vf-section-header">
          <div>
            <h3 className="vf-section-title">TED 每周跟读</h3>
            <p className="vf-section-desc">
              每周从 TED Talks Daily 官方源获取新的英文演讲素材。
            </p>
          </div>
          <span className="vf-update-badge">{loading ? "更新中..." : updateLabel}</span>
        </div>

        <div className="vf-list">
          {(material.speeches ?? FALLBACK_SPEECHES).map((speech) => (
            <div key={speech.id} className="vf-card">
              <div className="vf-card-header">
                <div className="vf-card-info">
                  <div className="vf-card-title">{speech.title}</div>
                  <div className="vf-card-speaker">
                    {speech.speaker}
                    {speech.publishedAt && (
                      <span>
                        {" · "}
                        {new Date(speech.publishedAt).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  className={`vf-play-btn ${playingId === speech.id ? "playing" : ""}`}
                  onClick={() => handlePlay(speech.text, speech.id)}
                  disabled={!!playingId}
                  title="播放跟读"
                >
                  {playingId === speech.id ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="vf-card-text">{speech.text}</div>

              <div className="vf-card-actions">
                <button
                  className="vf-read-along"
                  onClick={() => handlePlay(speech.text, speech.id)}
                  disabled={!!playingId}
                >
                  <svg
                    width="12"
                    height="12"
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
                  </svg>
                  跟读此段
                </button>
                {speech.sourceUrl && (
                  <a
                    className="vf-source-link"
                    href={speech.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看原演讲 ↗
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
