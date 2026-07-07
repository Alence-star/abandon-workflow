# Abandon

Abandon 是一个基于 `Tauri v2 + React + TypeScript + Rust` 的英语学习助手，支持桌面端选中文本直译、生词本、账号隔离学习记录，以及共享目录同步。

- 下载页：`https://alence-star.github.io/abandon-workflow/`
- 手机 PWA：`https://alence-star.github.io/abandon-workflow/pwa/`
- Apple 打包说明：见 [docs/apple-distribution.md](docs/apple-distribution.md)

## 当前功能

- `Ctrl/Cmd + Shift + T`
  选中文本后直接唤起软件并翻译。
- `Ctrl/Cmd + Shift + Y`
  显示 / 隐藏主窗口。
- 单词查询
  返回词典式中文释义、常见搭配、记忆提示和例句。
- 句子翻译
  返回中文翻译和语法分析。
- 朗读
  单词、句子与跟读朗读互斥，新的朗读会立即中断旧朗读。
- 生词本 / 学习记录
  支持收藏、搜索、熟悉度标记与按账号隔离。
- 共享目录同步
  登录后可将生词本和学习记录写入共享目录中的账号独立 JSON 文件。
- 手机 PWA
  可安装到手机桌面，全屏运行；API 配置保存在当前手机浏览器内。

## 已移除功能

- 截图翻译
- 右键服务 / Quick Action
- ABC 翻译板块

## 本地开发

```bash
npm install
npm run tauri dev
```

## 构建

前端构建：

```bash
npm run build
```

macOS 本机打包：

```bash
bash scripts/build-and-sign.sh
```

iOS Ad-Hoc 构建脚本：

```bash
bash scripts/build-ios-adhoc.sh
```

## 数据与同步目录

- mac 默认数据库文件：
  `~/Library/Application Support/com.abandon.english/abandon.db`
- Windows 默认数据库文件：
  `%APPDATA%\\com.abandon.english\\abandon.db`
- 共享同步目录：
  由设置页的 `sync_dir` 决定，建议填写 OneDrive、Dropbox 或 iCloud Drive 下同一个目录。
- 同步文件命名：
  每个账号对应一个 JSON，例如 `alice.json`、`bob.json`。

## 使用说明

1. 打开软件，在设置页登录或注册账号。
2. 配置 API Key、API 地址和模型名称。
3. 如需双端同步，在设置页填写共享同步目录。
4. 在任意应用中选中文本后按 `Ctrl/Cmd + Shift + T`。
5. 软件会自动弹出并显示翻译结果。
6. 手机端可直接打开 PWA 链接，添加到主屏幕后以独立窗口运行。
