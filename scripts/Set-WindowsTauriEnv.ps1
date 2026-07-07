param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  throw "Set-WindowsTauriEnv.ps1 is only supported on Windows."
}

$buildToolsRoot = Join-Path $env:USERPROFILE "BuildTools"
$msvcRoot = Join-Path $buildToolsRoot "VC\\Tools\\MSVC"
$sdkRoot = "C:\Program Files (x86)\Windows Kits\10"

if (-not (Test-Path $msvcRoot)) {
  throw "MSVC tools not found at $msvcRoot. Install Visual Studio Build Tools first."
}

if (-not (Test-Path $sdkRoot)) {
  throw "Windows SDK not found at $sdkRoot."
}

$msvcDir = Get-ChildItem $msvcRoot -Directory |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1

if (-not $msvcDir) {
  throw "No MSVC toolset found under $msvcRoot."
}

$sdkLibDir = Get-ChildItem (Join-Path $sdkRoot "Lib") -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1

if (-not $sdkLibDir) {
  throw "No Windows SDK library version found under $sdkRoot\\Lib."
}

$sdkBinDir = Get-ChildItem (Join-Path $sdkRoot "bin") -Directory |
  Where-Object { $_.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]$_.Name } -Descending |
  Select-Object -First 1

if (-not $sdkBinDir) {
  throw "No Windows SDK bin version found under $sdkRoot\\bin."
}

$msvcVersion = $msvcDir.Name
$sdkVersion = $sdkLibDir.Name
$msvcPath = $msvcDir.FullName
$sdkLibPath = $sdkLibDir.FullName
$sdkBinPath = $sdkBinDir.FullName

$kernel32Lib = Join-Path $sdkLibPath "um\\x64\\kernel32.lib"
$dbghelpLib = Join-Path $sdkLibPath "um\\x64\\DbgHelp.Lib"
$linkerPath = Join-Path $msvcPath "bin\\Hostx64\\x64\\link.exe"
$compilerBin = Join-Path $msvcPath "bin\\Hostx64\\x64"

foreach ($requiredPath in @($kernel32Lib, $dbghelpLib, $linkerPath)) {
  if (-not (Test-Path $requiredPath)) {
    throw "Required build artifact not found: $requiredPath"
  }
}

Add-Type -Namespace Native -Name Kernel32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet = System.Runtime.InteropServices.CharSet.Auto)]
public static extern uint GetShortPathName(
  string lpszLongPath,
  System.Text.StringBuilder lpszShortPath,
  uint cchBuffer
);
'@

function Get-ShortPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $buffer = New-Object System.Text.StringBuilder 512
  $result = [Native.Kernel32]::GetShortPathName($Path, $buffer, $buffer.Capacity)

  if ($result -eq 0) {
    return $Path
  }

  return $buffer.ToString()
}

$sdkRootShort = Get-ShortPath $sdkRoot
$sdkLibShort = Get-ShortPath $sdkLibPath
$sdkBinShort = Get-ShortPath $sdkBinPath

$env:Path = "$env:USERPROFILE\.cargo\bin;$compilerBin;$sdkBinShort\x64;$env:Path"
$env:VCINSTALLDIR = "$buildToolsRoot\VC\"
$env:VCToolsInstallDir = "$msvcPath\"
$env:WindowsSdkDir = "$sdkRootShort\"
$env:WindowsSDKVersion = "$sdkVersion\"
$env:UniversalCRTSdkDir = "$sdkRootShort\"
$env:UCRTVersion = $sdkVersion
$env:INCLUDE = "$msvcPath\include;$sdkRootShort\Include\$sdkVersion\ucrt;$sdkRootShort\Include\$sdkVersion\shared;$sdkRootShort\Include\$sdkVersion\um;$sdkRootShort\Include\$sdkVersion\winrt;$sdkRootShort\Include\$sdkVersion\cppwinrt"
$env:LIB = "$msvcPath\lib\x64;$sdkLibShort\ucrt\x64;$sdkLibShort\um\x64"
$env:LIBPATH = "$msvcPath\lib\x64;$sdkRootShort\UnionMetadata\$sdkVersion;$sdkRootShort\References\$sdkVersion"
$env:CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER = $linkerPath

Write-Host "Configured Windows Tauri toolchain:"
Write-Host "  MSVC: $msvcVersion"
Write-Host "  SDK:  $sdkVersion"
