import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Global error handler
window.onerror = function(msg, source, line, col, error) {
  document.body.innerHTML =
    '<div style="padding:20px;font-size:13px;color:var(--color-error,#ef4444)">' +
    '<h3 style="margin:0 0 8px;font-size:15px">⚠️ 加载错误</h3>' +
    '<p>' + String(msg) + '</p>' +
    (error?.stack ? '<pre style="margin-top:8px;font-size:11px;background:#f5f5f5;padding:10px;border-radius:6px;overflow:auto">' + error.stack + '</pre>' : '') +
    '</div>';
  return true;
};

try {
  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
} catch (e) {
  document.body.innerHTML = '<div style="padding:20px;color:red;font-size:13px"><h3>Mount Error</h3><pre>' + String(e) + '</pre></div>';
}
