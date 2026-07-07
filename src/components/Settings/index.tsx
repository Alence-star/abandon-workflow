import React, { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
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

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [key, baseUrl, model, sharedSyncDir, user, paths] = await Promise.all([
        getConfig("api_key"),
        getConfig("api_base_url"),
        getConfig("api_model"),
        getConfig("sync_dir"),
        getCurrentUser(),
        getRuntimePaths(),
      ]);

      setApiKey(key || "");
      setApiBaseUrl(baseUrl || "https://api.deepseek.com");
      setApiModel(model || "deepseek-chat");
      setSyncDir(sharedSyncDir || "");
      setCurrentUser(user);
      setRuntimePaths(paths);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      await Promise.all([
        setConfig("api_key", apiKey.trim()),
        setConfig("api_base_url", apiBaseUrl.trim() || "https://api.deepseek.com"),
        setConfig("api_model", apiModel.trim() || "deepseek-chat"),
        setConfig("sync_dir", syncDir.trim()),
      ]);

      setSaved(true);
      setSyncStatus(syncDir.trim() ? "共享同步目录已保存。" : "已清空共享同步目录。");
      await loadSettings();
      window.setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      alert(`保存失败：${String(error)}`);
    }
  };

  const handleAuthSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setAuthStatus("请输入用户名和密码。");
      return;
    }

    if (authMode === "register" && password !== confirmPassword) {
      setAuthStatus("两次输入的密码不一致。");
      return;
    }

    setAuthLoading(true);
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

      if (syncDir.trim()) {
        setSyncStatus("已按当前账号刷新共享同步文件。");
      }

      await loadSettings();
    } catch (error) {
      setAuthStatus(String(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    setAuthLoading(true);
    try {
      await logoutUser();
      setCurrentUser(null);
      setAuthStatus("已退出登录。");
      await loadSettings();
    } catch (error) {
      setAuthStatus(String(error));
    } finally {
      setAuthLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncStatus("同步中...");
    try {
      const result = await syncNow();
      setSyncStatus(result);
      await loadSettings();
    } catch (error) {
      setSyncStatus(String(error));
    }
  };

  const handleCheckUpdate = async () => {
    setUpdateStatus("检查中...");
    try {
      const update = await check();
      if (!update) {
        setUpdateStatus("已经是最新版本。");
        window.setTimeout(() => setUpdateStatus(""), 3000);
        return;
      }

      const yes = await ask("发现新版本，是否立即更新？", {
        title: "Abandon 更新",
        kind: "info",
      });

      if (yes) {
        setUpdateStatus("下载更新中...");
        await update.downloadAndInstall();
        await relaunch();
      } else {
        setUpdateStatus("");
      }
    } catch (error) {
      setUpdateStatus(`检查失败：${String(error)}`);
      window.setTimeout(() => setUpdateStatus(""), 5000);
    }
  };

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
                  已登录。当前账号的生词本和学习记录会优先写入账号隔离的数据区。
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
                {authLoading ? "处理中..." : authMode === "register" ? "注册并登录" : "登录"}
              </button>
            </>
          )}

          <p className="settings-note">
            不登录也可以使用翻译；登录后，生词本和学习记录会绑定到当前账号。
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
              onChange={(event) => {
                setSyncDir(event.target.value);
                setSaved(false);
              }}
            />
            <span className="form-hint">
              Windows 和 Mac 填同一个 OneDrive、Dropbox 或 iCloud Drive 目录即可同步。
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
            同步文件会按账号拆分，例如 `alice.json`、`bob.json`，避免多个账号互相覆盖。
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
            <label className="form-label">本地数据库文件</label>
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
              value={runtimePaths?.sync_dir || "未设置"}
            />
          </div>

          <div className="form-field">
            <label className="form-label">当前账号同步文件</label>
            <input
              type="text"
              className="form-input mono"
              readOnly
              value={runtimePaths?.sync_file_path || "未登录或未设置同步目录"}
            />
          </div>

          <p className="settings-note">
            mac 默认数据库路径通常在
            `~/Library/Application Support/com.abandon.english/abandon.db`。
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
              默认是 DeepSeek，也可以改成兼容 OpenAI 的 API 网关。
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
            单词查询会尽量返回词典式中文释义、常见搭配、记忆提示和例句。
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
              唤起主窗口并直接翻译当前外部应用里选中的英文。
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
          <p>轻量级英语学习桌面助手</p>
          <p>基于 Tauri + React + TypeScript</p>
          <button className="update-check-btn" onClick={handleCheckUpdate}>
            检查更新
          </button>
          {updateStatus && <p className="update-status">{updateStatus}</p>}
          <p className="settings-note" style={{ marginTop: 10 }}>
            账号默认只保存在本机数据库；配置共享同步目录后，同一账号可在双端同步生词本和学习记录。
          </p>
        </div>
      </div>
    </div>
  );
};
