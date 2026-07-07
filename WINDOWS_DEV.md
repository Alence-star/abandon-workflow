# Windows Development

Use the PowerShell helpers in `scripts/` instead of starting Tauri directly.

## Run dev mode

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-dev.ps1
```

## Build the desktop app

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-build.ps1
```

## Build a debug package

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-build.ps1 -Debug
```

These scripts:

- discover the installed MSVC toolchain under `%USERPROFILE%\BuildTools`
- discover the latest installed Windows 10/11 SDK
- configure the linker and SDK paths for Rust/Tauri
- run the project with `npm`, so a global `pnpm` install is not required
