import React, { useState } from "react";
import { speakText } from "../../services/api";

const TED_SPEECHES = [
  {
    id: "ted1",
    title: "The Power of Vulnerability",
    speaker: "Brene Brown",
    text: "Connection is why we're here. It is what gives purpose and meaning to our lives. The ability to feel connected is neurobiologically wired into us.",
  },
  {
    id: "ted2",
    title: "Do Schools Kill Creativity?",
    speaker: "Sir Ken Robinson",
    text: "Creativity now is as important in education as literacy, and we should treat it with the same status. Children are not afraid to be wrong.",
  },
  {
    id: "ted3",
    title: "The Happy Secret to Better Work",
    speaker: "Shawn Achor",
    text: "Happiness is not the belief that we don't need to change. It is the realization that we can. Your brain at positive is 31 percent more productive.",
  },
  {
    id: "ted4",
    title: "Your Body Language Shapes Who You Are",
    speaker: "Amy Cuddy",
    text: "Our bodies change our minds, and our minds can change our behavior, and our behavior can change our outcomes. Don't fake it till you make it, fake it till you become it.",
  },
  {
    id: "ted5",
    title: "The Art of Asking",
    speaker: "Amanda Palmer",
    text: "Asking for help is an act of courage and vulnerability. When we connect with others through asking, we build trust and community.",
  },
  {
    id: "ted6",
    title: "Grit: The Power of Passion",
    speaker: "Angela Duckworth",
    text: "Grit is passion and perseverance for very long-term goals. Grit is having stamina. Grit is sticking with your future, day in, day out.",
  },
];

export const VoiceFollowUp: React.FC = () => {
  const [playingId, setPlayingId] = useState<string | null>(null);

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
          <h3 className="vf-section-title">TED 跟读</h3>
          <p className="vf-section-desc">
            保留 TED 跟读练习，ABC 板块已移除。
          </p>
        </div>

        <div className="vf-list">
          {TED_SPEECHES.map((speech) => (
            <div key={speech.id} className="vf-card">
              <div className="vf-card-header">
                <div className="vf-card-info">
                  <div className="vf-card-title">{speech.title}</div>
                  <div className="vf-card-speaker">{speech.speaker}</div>
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
