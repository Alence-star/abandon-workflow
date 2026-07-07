import React, { useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { check } from "@tauri-apps/plugin-updater";
import {
  getConfig,
  setConfig,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  syncNow,
} from "../../services/api";
import { useThemeStore } from "../../stores/themeStore";
import type { UserSession } from "../../types";

const isMac = navigator.platform.toUpperCase().includes("MAC");
const modKey = isMac ? "Cmd" : "Ctrl";

export const Settings: React.FC = () => {
  const theme = useThemeStore((store) => store.theme);
  const toggleTheme = useThemeStore((store) => store.toggleTheme);

  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiModel, setApiModel] = useState("");
  const [syncDir, setSyncDir] = useState("");
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
      const [key, baseUrl, model, sharedSyncDir, user] = await Promise.all([
        getConfig("api_key"),
        getConfig("api_base_url"),
        getConfig("api_model"),
        getConfig("sync_dir"),
        getCurrentUser(),
      ]);

      setApiKey(key || "");
      setApiBaseUrl(baseUrl || "https://api.deepseek.com");
      setApiModel(model || "deepseek-chat");
      setSyncDir(sharedSyncDir || "");
      setCurrentUser(user);
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
      setSyncStatus(syncDir.trim() ? "共享同步目录已保存。" : "");
      setTimeout(() => setSaved(false), 2000);
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
          ? `注册成功，已登录 ${user.username}`
          : `登录成功，当前账号：${user.username}`
      );
      if (syncDir.trim()) {
        setSyncStatus("已按当前账号自动同步共享目录数据。");
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
        setTimeout(() => setUpdateStatus(""), 3000);
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
      setTimeout(() => setUpdateStatus(""), 5000);
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
                  已登录。当前账号下的生词本和学习记录可同步到共享目录。
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
            不登录也可以使用翻译功能；登录后，生词本和学习记录会绑定到当前账号。
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
              className="form-input"
              placeholder={
                isMac
                  ? "~/Dropbox/AbandonSync"
                  : "C:\\Users\\你的用户名\\Dropbox\\AbandonSync"
              }
              value={syncDir}
              onChange={(event) => {
                setSyncDir(event.target.value);
                setSaved(false);
              }}
            />
            <span className="form-hint">
              Windows 和 Mac 填同一个云盘目录。登录时导入，生词本变更时自动回写。
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
            这套同步不依赖额外服务器，适合先用 OneDrive、Dropbox、iCloud Drive 之类共享目录打通双端。
          </p>
          {syncStatus && <p className="settings-status">{syncStatus}</p>}
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
              className="form-input"
              placeholder="https://api.deepseek.com"
              value={apiBaseUrl}
              onChange={(event) => {
                setApiBaseUrl(event.target.value);
                setSaved(false);
              }}
            />
            <span className="form-hint">
              默认 DeepSeek，也可以切到兼容 OpenAI 的接口地址。
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

          {!loading && !apiKey && (
            <p className="config-warning">请先保存可用的 API Key。</p>
          )}

          <p className="settings-note">
            单词查询会优先返回词典式释义、常见搭配、记忆提示和例句。
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
            <div className="settings-item-label">选中文本直接翻译</div>
            <div className="settings-item-desc">
              触发后会唤起主窗口，并直接翻译当前选中的英文。
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
          <p>Abandon v1.0.0</p>
          <p>轻量级英语学习桌面助手</p>
          <p>基于 Tauri + React + TypeScript</p>
          <button className="update-check-btn" onClick={handleCheckUpdate}>
            检查更新
          </button>
          {updateStatus && <p className="update-status">{updateStatus}</p>}
          <p className="settings-note" style={{ marginTop: 10 }}>
            账号默认保存在本机数据库；配置共享同步目录后，登录账号即可在双端同步生词本和学习记录。
          </p>
        </div>
      </div>
    </div>
  );
};
