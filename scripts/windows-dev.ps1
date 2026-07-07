param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\Set-WindowsTauriEnv.ps1"

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  & npm.cmd run tauri -- dev
}
finally {
  Pop-Location
}
