# Abandon

Apple packaging notes: see [docs/apple-distribution.md](docs/apple-distribution.md) for internal macOS packages and signed iOS ad-hoc builds.

Abandon 是一个基于 `Tauri v2 + React + TypeScript + Rust` 的桌面英语学习助手。

## 当前功能

- `Ctrl/Cmd + Shift + T`：唤起软件并直接翻译当前选中的英文
- `Ctrl/Cmd + Shift + Y`：显示 / 隐藏主窗口
- 单词查询：返回词典式释义、常见搭配、记忆提示、例句
- 句子翻译：返回中文翻译和语法分析
- 朗读：单词、句子、TED 跟读统一走可抢占朗读，新朗读会立即打断旧朗读
- 生词本：收藏、搜索、熟悉度标记、学习记录
- 账号：本地注册 / 登录，账号隔离生词本和学习记录
- 共享目录同步：登录后可把生词本和学习记录同步到同一个云盘目录
- 设置：API 配置、主题切换、检查更新

## 已移除

- 截图翻译
- 右键服务 / Quick Action
- ABC 翻译板块

## 启动开发环境

```bash
npm install
npm run tauri dev
```

## Windows 构建产物

- `src-tauri/target/debug/abandon.exe`
- `src-tauri/target/debug/bundle/nsis/Abandon_1.0.0_x64-setup.exe`

## macOS 打包

本机 Mac 打包：

```bash
bash scripts/build-and-sign.sh
```

GitHub Actions 打包：

- 工作流：`.github/workflows/build-macos.yml`
- 支持 `workflow_dispatch` 和 `v*` tag
- 会生成 `macOS x64` 与 `macOS Apple Silicon` 两套 `.dmg`

## iOS 打包

GitHub Actions 打包：

- 工作流：`.github/workflows/build-ios.yml`
- 支持 `workflow_dispatch` 和 `v*` tag
- 会在 `macOS runner` 上初始化 `iOS` 工程并导出 `.ipa`
- 需要提前配置 Apple 相关签名和描述文件 secrets

## 共享目录同步说明

这套同步不依赖额外服务器。

1. 在 Windows 和 Mac 上都登录同一个 Abandon 账号。
2. 在设置页填写同一个共享同步目录。
3. 这个目录建议放在 OneDrive、Dropbox、iCloud Drive 等可双端同步的云盘中。
4. 登录时会自动导入该账号的生词本和学习记录。
5. 生词本新增、删除、熟悉度更新后会自动回写同步文件。
6. 也可以在设置页点击“立即同步”手动触发。

## 使用说明

1. 打开软件，在设置页注册或登录账号。
2. 配置可用的 API Key、接口地址和模型名称。
3. 如需双端同步，在设置页填写共享同步目录。
4. 在任意软件中选中文本，按 `Ctrl/Cmd + Shift + T`。
5. Abandon 会弹出窗口并直接显示翻译结果。
6. 单词页可直接加入生词本，后续在“生词本”和“学习记录”里复习。
