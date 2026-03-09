# WabiSabi CLI Installer for Windows
# Usage: iwr https://wabisabi.dev/install.ps1 -useb | iex

$ErrorActionPreference = "Stop"

$Version = if ($env:WABISABI_VERSION) { $env:WABISABI_VERSION } else { "latest" }
$InstallDir = if ($env:WABISABI_INSTALL_DIR) { $env:WABISABI_INSTALL_DIR } else { "$env:USERPROFILE\.wabisabi" }
$Repo = "Arkessiah/wabisabi"

function Write-Info($msg) { Write-Host "[wabisabi] $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "[wabisabi] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[wabisabi] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[wabisabi] $msg" -ForegroundColor Red }

function Test-Command($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

function Ensure-Bun {
    if (Test-Command "bun") {
        $v = & bun --version 2>$null
        Write-Ok "Bun found: $v"
        return
    }

    Write-Info "Bun not found. Installing Bun..."
    irm https://bun.sh/install.ps1 | iex

    # Refresh PATH
    $env:BUN_INSTALL = "$env:USERPROFILE\.bun"
    $env:PATH = "$env:BUN_INSTALL\bin;$env:PATH"

    if (Test-Command "bun") {
        $v = & bun --version 2>$null
        Write-Ok "Bun installed: $v"
    } else {
        Write-Err "Failed to install Bun. Install manually: https://bun.sh"
        exit 1
    }
}

function Install-WabiSabi {
    Write-Info "Installing WabiSabi CLI..."

    $CliDir = "$InstallDir\cli"
    if (Test-Path $CliDir) {
        Write-Warn "Removing previous installation..."
        Remove-Item -Recurse -Force $CliDir
    }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

    if (-not (Test-Command "git")) {
        Write-Err "git is required. Install it from https://git-scm.com/download/win"
        exit 1
    }

    $TempDir = Join-Path ([System.IO.Path]::GetTempPath()) "wabisabi-install-$(Get-Random)"
    New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

    try {
        Write-Info "Cloning repository..."
        & git clone --depth 1 "https://github.com/$Repo.git" "$TempDir\wabisabi" 2>$null

        $TermDir = "$TempDir\wabisabi\packages\terminal"
        Push-Location $TermDir

        Write-Info "Installing dependencies..."
        & bun install 2>$null

        Write-Info "Building..."
        & bun build src/index.ts --outfile dist/index.js --target bun

        Pop-Location

        # Copy to install dir
        New-Item -ItemType Directory -Force -Path $CliDir | Out-Null
        Copy-Item -Recurse "$TermDir\dist" "$CliDir\dist"
        Copy-Item "$TermDir\package.json" "$CliDir\"

        Push-Location $CliDir
        & bun install --production 2>$null
        Pop-Location
    } finally {
        Remove-Item -Recurse -Force $TempDir -ErrorAction SilentlyContinue
    }
}

function Create-Launcher {
    $BatPath = "$InstallDir\wabisabi.cmd"
    $PsPath = "$InstallDir\wabisabi.ps1"

    # CMD launcher
    @"
@echo off
setlocal
set "WABISABI_HOME=%USERPROFILE%\.wabisabi"
where bun >nul 2>&1 && (
    bun run "%WABISABI_HOME%\cli\dist\index.js" %*
    exit /b %ERRORLEVEL%
)
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    "%USERPROFILE%\.bun\bin\bun.exe" run "%WABISABI_HOME%\cli\dist\index.js" %*
    exit /b %ERRORLEVEL%
)
echo Error: Bun runtime not found. Install it: irm https://bun.sh/install.ps1 ^| iex >&2
exit /b 1
"@ | Out-File -Encoding ASCII $BatPath

    # PowerShell launcher
    @'
$WabiHome = if ($env:WABISABI_INSTALL_DIR) { $env:WABISABI_INSTALL_DIR } else { "$env:USERPROFILE\.wabisabi" }
$BunCmd = if (Get-Command bun -ErrorAction SilentlyContinue) { "bun" }
          elseif (Test-Path "$env:USERPROFILE\.bun\bin\bun.exe") { "$env:USERPROFILE\.bun\bin\bun.exe" }
          else { Write-Error "Bun not found. Install: irm https://bun.sh/install.ps1 | iex"; exit 1 }
& $BunCmd run "$WabiHome\cli\dist\index.js" @args
'@ | Out-File -Encoding UTF8 $PsPath
}

function Setup-Path {
    $UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($UserPath -split ";" | Where-Object { $_ -eq $InstallDir }) {
        return
    }

    $NewPath = "$InstallDir;$UserPath"
    [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
    $env:PATH = "$InstallDir;$env:PATH"

    Write-Warn "Added $InstallDir to your PATH"
    Write-Warn "Restart your terminal for changes to take effect"
}

# Main
Write-Host ""
Write-Host "  WabiSabi - AI Coding Agent Installer" -ForegroundColor Cyan
Write-Host ""

Write-Info "Platform: Windows ($env:PROCESSOR_ARCHITECTURE)"

Ensure-Bun
Install-WabiSabi
Create-Launcher
Setup-Path

Write-Host ""
Write-Ok "WabiSabi CLI installed successfully!"
Write-Host ""
Write-Info "Run 'wabisabi' to get started"
Write-Info "Run 'wabisabi --help' for usage"
Write-Info "Config: ~\.wabisabi\config.jsonc"
Write-Host ""
