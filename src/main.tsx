import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { isTauriRuntime, runtimeLabel } from "./services/runtime";

window.onerror = function (msg, _source, _line, _col, error) {
  document.body.innerHTML =
    '<div style="padding:20px;font-size:13px;color:var(--color-error,#ef4444)">' +
    '<h3 style="margin:0 0 8px;font-size:15px">加载错误</h3>' +
    `<p>${String(msg)}</p>` +
    (error?.stack
      ? `<pre style="margin-top:8px;font-size:11px;background:#f5f5f5;padding:10px;border-radius:6px;overflow:auto">${error.stack}</pre>`
      : "") +
    "</div>";
  return true;
};

async function registerServiceWorker() {
  if (
    isTauriRuntime ||
    !("serviceWorker" in navigator) ||
    !window.isSecureContext
  ) {
    return;
  }

  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch (error) {
    console.warn("[Abandon] service worker registration failed:", error);
  }
}

document.documentElement.dataset.runtime = runtimeLabel;
document.body.dataset.runtime = runtimeLabel;

void registerServiceWorker();

try {
  const root = document.getElementById("root");
  if (root) {
    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
} catch (error) {
  document.body.innerHTML =
    '<div style="padding:20px;color:red;font-size:13px"><h3>Mount Error</h3><pre>' +
    String(error) +
    "</pre></div>";
}
