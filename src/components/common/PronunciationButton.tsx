import React from "react";
import {
  playAmericanPronunciation,
  playBritishPronunciation,
} from "../../services/api";

interface Props {
  word: string;
  size?: number;
  accent?: "british" | "american";
  label?: string;
}

export const PronunciationButton: React.FC<Props> = ({
  word,
  size = 20,
  accent = "british",
  label,
}) => {
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (accent === "british") {
        await playBritishPronunciation(word);
      } else {
        await playAmericanPronunciation(word);
      }
    } catch (err) {
      console.error("Pronunciation failed:", err);
    }
  };

  const title = accent === "british" ? "英式发音" : "美式发音";

  return (
    <button
      className={`pronunciation-btn pronunciation-btn-${accent}`}
      onClick={handleClick}
      title={title}
      aria-label={title}
    >
      <svg
        width={size}
        height={size}
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
      {label && <span>{label}</span>}
    </button>
  );
};
