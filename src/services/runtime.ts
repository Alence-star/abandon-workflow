export const isTauriRuntime =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export const runtimeLabel = isTauriRuntime ? "tauri" : "browser";

export async function tauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function confirmInfo(
  message: string,
  title = "Abandon"
): Promise<boolean> {
  if (!isTauriRuntime) {
    return window.confirm(message);
  }

  const { ask } = await import("@tauri-apps/plugin-dialog");
  return ask(message, {
    title,
    kind: "info",
  });
}

export async function checkForUpdates(): Promise<any | null> {
  if (!isTauriRuntime) {
    return null;
  }

  const { check } = await import("@tauri-apps/plugin-updater");
  return check();
}

export async function relaunchApp(): Promise<void> {
  if (!isTauriRuntime) {
    return;
  }

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
