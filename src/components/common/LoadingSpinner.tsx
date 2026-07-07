import React from "react";

export const LoadingSpinner: React.FC<{ size?: number }> = ({ size = 24 }) => {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="2"
        style={{ animation: "spin 1s linear infinite" }}
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          strokeDasharray="31.4 31.4"
          strokeLinecap="round"
        />
      </svg>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};
