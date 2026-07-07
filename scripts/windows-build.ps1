param(
  [switch]$Debug
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. "$PSScriptRoot\Set-WindowsTauriEnv.ps1"

$tauriArgs = @("run", "tauri", "--", "build")
if ($Debug) {
  $tauriArgs += "--debug"
}

Push-Location (Resolve-Path (Join-Path $PSScriptRoot ".."))
try {
  & npm.cmd @tauriArgs
}
finally {
  Pop-Location
}
