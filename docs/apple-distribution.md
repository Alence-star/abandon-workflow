# Apple Packaging

这个项目现在分成两条 Apple 打包路径：

1. `macOS internal`
   用于内部测试，默认走 `ad-hoc` 签名，不做公证。
   适合团队内分发，不适合公开下载分发。

2. `iOS ad-hoc`
   用于给已登记设备安装测试包。
   这条链路仍然需要 Apple 的团队、证书和描述文件，不能做成“真正免签可安装”的 iPhone 安装包。

## macOS 内测包

本地 Mac 执行：

```bash
bash scripts/build-and-sign.sh
```

如果没有配置 `APPLE_CERTIFICATE` 和 `APPLE_SIGNING_IDENTITY`，脚本会自动退回到：

```bash
APPLE_SIGNING_IDENTITY=-
```

也就是 `ad-hoc` 内测签名模式。

GitHub Actions 执行：

- 工作流：`.github/workflows/build-macos-internal.yml`
- 触发方式：`workflow_dispatch`
- 产物：`macOS x64` 和 `macOS Apple Silicon` 两套 `DMG`

## iOS 内测包

本地 Mac 执行：

```bash
bash scripts/build-ios-adhoc.sh
```

GitHub Actions 执行：

- 工作流：`.github/workflows/build-ios.yml`
- 当前模式：`ad-hoc`
- 产物：`.ipa`

### iOS 签名两种方式

方式一：自动签名

- `APPLE_TEAM_ID`
- `APPLE_API_ISSUER`
- `APPLE_API_KEY`
- `APPLE_API_KEY_P8`

方式二：手动 ad-hoc 签名

- `APPLE_TEAM_ID`
- `APPLE_SIGNING_IDENTITY`
- `IOS_CERTIFICATE`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_MOBILE_PROVISION`

如果这两组都没配齐，工作流会直接报错并停止，因为这类 `IPA` 无法合法地在真机上免签安装。

## 推荐用法

- 团队内部先跑 `build-macos-internal.yml`，直接拿 `DMG` 测试桌面版。
- iPhone 内测走 `build-ios.yml`，先把测试设备加入 Apple 开发者后台，再导出 `ad-hoc` 包。
- 如果后面要给外部用户稳定分发，再补 `Developer ID + notarization` 和 `TestFlight / App Store`。
