import React from "react";
import { playBritishPronunciation } from "../../services/api";

interface Props {
  word: string;
  size?: number;
}

export const PronunciationButton: React.FC<Props> = ({ word, size = 20 }) => {
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await playBritishPronunciation(word);
    } catch (err) {
      console.error("Pronunciation failed:", err);
    }
  };

  return (
    <button
      onClick={handleClick}
      title="英式发音"
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-primary)",
        opacity: 0.8,
        transition: "opacity 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.8")}
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
    </button>
  );
};
