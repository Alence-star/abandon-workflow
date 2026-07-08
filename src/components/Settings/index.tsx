import React, { useEffect, useState } from "react";
import {
  getConfig,
  getCurrentUser,
  getRuntimePaths,
  loginUser,
  logoutUser,
  registerUser,
  setConfig,
  syncNow,
} from "../../services/api";
import {
  checkForUpdates,
  confirmInfo,
  isTauriRuntime,
  relaunchApp,
} from "../../services/runtime";
import { useThemeStore } from "../../stores/themeStore";
import type { RuntimePaths, UserSession } from "../../types";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "Cmd" : "Ctrl";

export const Settings: React.FC = () => {
  const theme = useThemeStore((store) => store.theme);
  const toggleTheme = useThemeStore((store) => store.toggleTheme);

  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiModel, setApiModel] = useState("");
  const [syncDir, setSyncDir] = useState("");
  const [githubSyncToken, setGithubSyncToken] = useState("");
  const [runtimePaths, setRuntimePaths] = useState<RuntimePaths | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updateStatus, setUpdateStatus] = useState("");
  const [syncStatus, setSyncStatus] = useState("");

  const [currentUser, setCurrentUser] = useState<UserSession | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authStatus, setAuthStatus] = useState("");

  useEffect(() => {
    void loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const [key, baseUrl, model, sharedSyncDir, githubToken, user, paths] =
        await Promise.all([
          getConfig("api_key"),
          getConfig("api_base_url"),
          getConfig("api_model"),
          getConfig("sync_dir"),
          getConfig("github_sync_token"),
          getCurrentUser(),
          getRuntimePaths(),
        ]);

      setApiKey(key || "");
      setApiBaseUrl(baseUrl || "https://api.deepseek.com");
      setApiModel(model || "deepseek-chat");
      setSyncDir(sharedSyncDir || "");
      setGithubSyncToken(githubToken || "");
      setCurrentUser(user);
      setRuntimePaths(paths);
    } finally {
      setLoading(false);
    }
  }

  function hasSyncBackendConfigured() {
    return Boolean(githubSyncToken.trim()) || (isTauriRuntime && Boolean(syncDir.trim()));
  }

  async function runPostAuthSync(successMessage?: string) {
    if (!hasSyncBackendConfigured()) {
      if (successMessage) {
        setSyncStatus(successMessage);
      }
      return;
    }

    setSyncStatus("正在同步当前账号数据...");
    try {
      const result = await syncNow();
      setSyncStatus(result);
    } catch (error) {
      setSyncStatus(`账号已登录，但同步失败：${String(error)}`);
    }
  }

  async function handleSave() {
    setSyncStatus("");
    try {
      await setConfig("api_key", apiKey.trim());
      await setConfig("api_base_url", apiBaseUrl.trim() || "https://api.deepseek.com");
      await setConfig("api_model", apiModel.trim() || "deepseek-chat");
      await setConfig("sync_dir", syncDir.trim());
      await setConfig("github_sync_token", githubSyncToken.trim());

      setSaved(true);
      if (currentUser) {
        await runPostAuthSync("同步配置已保存。");
      } else if (githubSyncToken.trim()) {
        setSyncStatus("GitHub 云同步令牌已保存，登录后可立即同步。");
      } else if (syncDir.trim()) {
        setSyncStatus("共享同步目录已保存，登录后可立即同步。");
      } else {
        setSyncStatus("尚未配置同步后端。");
      }

      await loadSettings();
      window.setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      setSyncStatus(`配置已保存到本地，但同步校验失败：${String(error)}`);
      await loadSettings();
    }
  }

  async function handleAuthSubmit() {
    if (!username.trim() || !password.trim()) {
      setAuthStatus("请输入用户名和密码。");
      return;
    }

    if (authMode === "register" && password !== confirmPassword) {
      setAuthStatus("两次输入的密码不一致。");
      return;
    }

    setAuthLoading(true);
    setAuthStatus("");
    try {
      const user =
        authMode === "register"
          ? await registerUser(username, password)
          : await loginUser(username, password);

      setCurrentUser(user);
      setPassword("");
      setConfirmPassword("");
      setAuthStatus(
        authMode === "register"
          ? `注册成功，当前账号：${user.username}`
          : `登录成功，当前账号：${user.username}`
      );

      await runPostAuthSync("当前账号已登录，本地数据已切换。");
      await loadSettings();
    } catch (error) {
      setAuthStatus(String(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleLogout() {
    setAuthLoading(true);
    try {
      await logoutUser();
      setCurrentUser(null);
      setAuthStatus("已退出登录。");
      setSyncStatus("");
      await loadSettings();
    } catch (error) {
      setAuthStatus(String(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleManualSync() {
    setSyncStatus("正在同步...");
    try {
      const result = await syncNow();
      setSyncStatus(result);
      await loadSettings();
    } catch (error) {
      setSyncStatus(String(error));
    }
  }

  async function handleCheckUpdate() {
    if (!isTauriRuntime) {
      window.open(
        "https://alence-star.github.io/abandon-workflow/",
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    setUpdateStatus("检查中...");
    try {
      const update = await checkForUpdates();
      if (!update) {
        setUpdateStatus("已经是最新版本。");
        window.setTimeout(() => setUpdateStatus(""), 3000);
        return;
      }

      const yes = await confirmInfo("发现新版本，是否立即更新？", "Abandon 更新");
      if (!yes) {
        setUpdateStatus("");
        return;
      }

      setUpdateStatus("下载更新中...");
      await update.downloadAndInstall();
      await relaunchApp();
    } catch (error) {
      setUpdateStatus(`检查失败：${String(error)}`);
      window.setTimeout(() => setUpdateStatus(""), 5000);
    }
  }

  return (
    <div className="settings">
      <div className="settings-group">
        <div className="settings-group-title">账号</div>
        <div className="settings-form">
          {currentUser ? (
            <div className="settings-user-card">
              <div>
                <div className="settings-item-label">{currentUser.username}</div>
                <div className="settings-item-desc">
                  当前账号的生词本、已学单词和用户配置会优先按账号隔离。
                </div>
              </div>
              <button
                className="settings-secondary-btn"
                onClick={handleLogout}
                disabled={authLoading}
              >
                退出登录
              </button>
            </div>
          ) : (
            <>
              <div className="settings-auth-tabs">
                <button
                  className={`settings-auth-tab ${authMode === "login" ? "active" : ""}`}
                  onClick={() => {
                    setAuthMode("login");
                    setAuthStatus("");
                  }}
                >
                  登录
                </button>
                <button
                  className={`settings-auth-tab ${authMode === "register" ? "active" : ""}`}
                  onClick={() => {
                    setAuthMode("register");
                    setAuthStatus("");
                  }}
                >
                  注册
                </button>
              </div>

              <div className="form-field">
                <label className="form-label">用户名</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="至少 3 个字符"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </div>

              <div className="form-field">
                <label className="form-label">密码</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="至少 6 个字符"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>

              {authMode === "register" && (
                <div className="form-field">
                  <label className="form-label">确认密码</label>
                  <input
                    type="password"
                    className="form-input"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                </div>
              )}

              <button
                className="save-config-btn"
                onClick={handleAuthSubmit}
                disabled={authLoading}
              >
                {authLoading
                  ? "处理中..."
                  : authMode === "register"
                    ? "注册并登录"
                    : "登录"}
              </button>
            </>
          )}

          <p className="settings-note">
            仅使用桌面端时，配置共享目录即可同步；如果要让手机 PWA 和桌面端共用同一个账号数据，请同时配置 GitHub 云同步令牌。
          </p>
          {authStatus && <p className="settings-status">{authStatus}</p>}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">同步</div>
        <div className="settings-form">
          <div className="form-field">
            <label className="form-label">共享同步目录</label>
            <input
              type="text"
              className="form-input mono"
              placeholder={
                isMac
                  ? "~/Library/Mobile Documents/com~apple~CloudDocs/AbandonSync"
                  : "C:\\Users\\你的用户名\\Dropbox\\AbandonSync"
              }
              value={syncDir}
              disabled={!isTauriRuntime}
              onChange={(event) => {
                setSyncDir(event.target.value);
                setSaved(false);
              }}
            />
            <span className="form-hint">
              {isTauriRuntime
                ? "桌面端可使用 iCloud Drive、OneDrive、Dropbox 等共享目录。"
                : "浏览器 PWA 无法直接访问本地共享目录；若要跨端同步，请使用下方 GitHub 云同步。"}
            </span>
          </div>

          <div className="form-field">
            <label className="form-label">GitHub 云同步令牌</label>
            <input
              type="password"
              className="form-input mono"
              placeholder="ghp_xxx / github_pat_xxx"
              value={githubSyncToken}
              onChange={(event) => {
                setGithubSyncToken(event.target.value);
                setSaved(false);
              }}
            />
            <span className="form-hint">
              同一令牌配置到桌面端和手机 PWA 后，可通过 GitHub Gist 自动同步同账号的已学单词和学习记录。
            </span>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`save-config-btn ${saved ? "saved" : ""}`}
              onClick={handleSave}
              style={{ flex: 1 }}
            >
              {saved ? "已保存" : "保存同步与 API 配置"}
            </button>
            <button
              className="settings-secondary-btn"
              onClick={handleManualSync}
              disabled={!currentUser}
            >
              立即同步
            </button>
          </div>

          <p className="settings-note">
            桌面端会优先读取热键触发时选中的文本；账号同步文件会按账号拆分，GitHub 云同步则使用当前 GitHub 令牌下的私密 Gist。
          </p>
          {syncStatus && <p className="settings-status">{syncStatus}</p>}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">数据位置</div>
        <div className="settings-form">
          <div className="form-field">
            <label className="form-label">本地数据目录</label>
            <input
              type="text"
              className="form-input mono"
              readOnly
              value={runtimePaths?.data_dir || ""}
            />
          </div>

          <div className="form-field">
            <label className="form-label">本地数据文件</label>
            <input
              type="text"
              className="form-input mono"
              readOnly
              value={runtimePaths?.database_path || ""}
            />
          </div>

          <div className="form-field">
            <label className="form-label">当前共享目录</label>
            <input
              type="text"
              className="form-input mono"
              readOnly
              value={runtimePaths?.sync_dir || "未配置"}
            />
          </div>

          <div className="form-field">
            <label className="form-label">当前账号同步文件</label>
            <input
              type="text"
              className="form-input mono"
              readOnly
              value={runtimePaths?.sync_file_path || "未登录或未配置"}
            />
          </div>

          <p className="settings-note">
            {isTauriRuntime
              ? "mac 默认数据库路径通常位于 ~/Library/Application Support/com.abandon.english/abandon.db。"
              : "PWA 数据保存在当前浏览器本地存储中；切换浏览器或清空站点数据会丢失本地缓存。"}
          </p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">API 配置</div>
        <div className="settings-form">
          <div className="form-field">
            <label className="form-label">API Key</label>
            <input
              type="password"
              className="form-input mono"
              placeholder="sk-..."
              value={apiKey}
              onChange={(event) => {
                setApiKey(event.target.value);
                setSaved(false);
              }}
            />
          </div>

          <div className="form-field">
            <label className="form-label">API 地址</label>
            <input
              type="text"
              className="form-input mono"
              placeholder="https://api.deepseek.com"
              value={apiBaseUrl}
              onChange={(event) => {
                setApiBaseUrl(event.target.value);
                setSaved(false);
              }}
            />
            <span className="form-hint">
              默认使用 DeepSeek，也可以改成兼容 OpenAI 的网关。PWA 模式下，这个接口需要允许浏览器跨域访问。
            </span>
          </div>

          <div className="form-field">
            <label className="form-label">模型名称</label>
            <input
              type="text"
              className="form-input mono"
              placeholder="deepseek-chat"
              value={apiModel}
              onChange={(event) => {
                setApiModel(event.target.value);
                setSaved(false);
              }}
            />
          </div>

          {!loading && !apiKey && <p className="config-warning">请先保存可用的 API Key。</p>}

          <p className="settings-note">
            单词查询会尽量返回完整中文释义、常见搭配、记忆提示和例句；句子模式会同时给出翻译和语法拆解。
          </p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">外观</div>
        <div className="settings-item">
          <div className="settings-item-info">
            <div className="settings-item-label">主题模式</div>
            <div className="settings-item-desc">
              {theme === "dark" ? "深色模式" : "浅色模式"}
            </div>
          </div>
          <button className="toggle-btn" onClick={toggleTheme}>
            <div className={`toggle-track ${theme === "dark" ? "active" : ""}`}>
              <div className="toggle-thumb" />
            </div>
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">快捷键</div>
        <div className="settings-shortcut-item">
          <div className="settings-item-info">
            <div className="settings-item-label">选中文本后直接翻译</div>
            <div className="settings-item-desc">
              {isTauriRuntime
                ? "唤起主窗口并直接翻译当前外部应用里选中的英文。"
                : "手机 PWA 不支持系统级全局热键；桌面安装版仍然使用这个快捷键。"}
            </div>
          </div>
          <kbd className="shortcut-key">{modKey}+Shift+T</kbd>
        </div>
        <div className="settings-shortcut-item">
          <div className="settings-item-info">
            <div className="settings-item-label">显示 / 隐藏窗口</div>
          </div>
          <kbd className="shortcut-key">{modKey}+Shift+Y</kbd>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">关于</div>
        <div className="settings-about" style={{ padding: "0 16px 16px" }}>
          <p>Abandon v1.0.1</p>
          <p>轻量级英语学习桌面与移动端助手</p>
          <p>桌面端基于 Tauri，PWA 端复用同一套 React 界面</p>
          <button className="update-check-btn" onClick={handleCheckUpdate}>
            {isTauriRuntime ? "检查更新" : "打开下载页"}
          </button>
          {updateStatus && <p className="update-status">{updateStatus}</p>}
          <p className="settings-note" style={{ marginTop: 10 }}>
            当前版本支持桌面端共享目录同步，也支持通过 GitHub Gist 把同一账号的已学单词和学习记录同步到手机 PWA。
          </p>
        </div>
      </div>
    </div>
  );
};
