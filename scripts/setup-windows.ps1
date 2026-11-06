<#
.SYNOPSIS
  One-shot Windows build prerequisites installer for LumenLive.

.DESCRIPTION
  Verifies the MSVC C++ toolchain (required for linking) is available. ONNX
  Runtime ships as prebuilt binaries (the `ort` crate's `download-binaries`
  feature), so no C++/CMake build or libclang is needed.

  Safe to re-run - each step checks for existing installs and exits early.
#>

$ErrorActionPreference = 'Stop'

function Write-Step   { param($m) Write-Host "==> $m" -ForegroundColor Cyan }
function Write-Ok     { param($m) Write-Host "    $m" -ForegroundColor Green }
function Write-Warn2  { param($m) Write-Host "!!  $m" -ForegroundColor Yellow }

function Test-Command {
    param([string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

Write-Step 'Preflight: checking winget'
if (-not (Test-Command winget)) {
    Write-Warn2 "winget not found. Install 'App Installer' from the Microsoft Store:"
    Write-Warn2 '  https://apps.microsoft.com/detail/9nblggh4nns1'
    exit 1
}
Write-Ok 'winget available'

Write-Step 'MSVC toolchain (required for linking)'
if (Test-Command cl) {
    Write-Ok 'cl.exe on PATH - MSVC linker available'
} else {
    $pfx86 = [Environment]::GetEnvironmentVariable('ProgramFiles(x86)')
    $vswhere = if ($pfx86) { Join-Path $pfx86 'Microsoft Visual Studio\Installer\vswhere.exe' } else { $null }
    $vsFound = $false
    if ($vswhere -and (Test-Path $vswhere)) {
        $vsInstall = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
        if ($vsInstall) { $vsFound = $true; Write-Ok "Found VS install with C++ tools at $vsInstall" }
    }
    if (-not $vsFound) {
        Write-Warn2 'No MSVC C++ build tools detected.'
        Write-Warn2 'Install Visual Studio 2022 with the "Desktop development with C++" workload:'
        Write-Warn2 '  https://visualstudio.microsoft.com/downloads/'
        Write-Warn2 'Or install just the Build Tools:'
        Write-Warn2 '  winget install --id Microsoft.VisualStudio.2022.BuildTools -e --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"'
    }
}

Write-Host ''
Write-Host 'Setup complete.' -ForegroundColor Green
