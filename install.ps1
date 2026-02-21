#
# WabiSabi Installer for Windows
#
# Installs wabisabi as a global command.
# Requirements: Bun runtime (https://bun.sh)
#
# Usage: powershell -ExecutionPolicy Bypass -File install.ps1
#

$ErrorActionPreference = "Stop"

function Write-Info($msg)  { Write-Host "  > $msg" -ForegroundColor Cyan }
function Write-Ok($msg)    { Write-Host "  + $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  ! $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "  x $msg" -ForegroundColor Red; exit 1 }

function Confirm-Action($msg, $default = "y") {
    $hint = if ($default -eq "y") { "Y/n" } else { "y/N" }
    $answer = Read-Host "  $msg [$hint]"
    if ([string]::IsNullOrWhiteSpace($answer)) { $answer = $default }
    return $answer -match "^[yYsS]"
}

Write-Host ""
Write-Host "  WabiSabi Installer" -ForegroundColor White -NoNewline
Write-Host ""
Write-Host "  AI Terminal IDE" -ForegroundColor DarkGray
Write-Host ""

# ── Check Bun ────────────────────────────────────────────────

$BunPath = $null

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $BunPath = (Get-Command bun).Source
} elseif (Test-Path "$env:USERPROFILE\.bun\bin\bun.exe") {
    $BunPath = "$env:USERPROFILE\.bun\bin\bun.exe"
}

if (-not $BunPath) {
    Write-Warn "Bun runtime not found."
    if (Confirm-Action "Install Bun now?") {
        irm bun.sh/install.ps1 | iex
        $BunPath = "$env:USERPROFILE\.bun\bin\bun.exe"
        if (-not (Test-Path $BunPath)) {
            Write-Fail "Bun installation failed. Install manually: https://bun.sh"
        }
        Write-Ok "Bun installed: $BunPath"
    } else {
        Write-Fail "Bun is required. Install it: irm bun.sh/install.ps1 | iex"
    }
} else {
    $bunVersion = & $BunPath --version 2>$null
    Write-Ok "Bun found: $BunPath ($bunVersion)"
}

# ── Build ────────────────────────────────────────────────────

$RepoDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TerminalDir = Join-Path $RepoDir "packages\terminal"

Write-Info "Building wabisabi..."

if (-not (Test-Path $TerminalDir)) {
    Write-Fail "Terminal package not found at $TerminalDir"
}

Push-Location $TerminalDir
try {
    & $BunPath install 2>$null
    & $BunPath build src/index.ts --outfile dist/index.js --target bun
    Write-Ok "Built successfully"
} finally {
    Pop-Location
}

# ── Create directories ───────────────────────────────────────

$WabisabiDir = Join-Path $env:USERPROFILE ".wabisabi"
$BinDir = Join-Path $WabisabiDir "bin"

New-Item -ItemType Directory -Force -Path $WabisabiDir | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

# ── Create launcher ──────────────────────────────────────────

$LauncherPath = Join-Path $BinDir "wabisabi.cmd"
$DistPath = Join-Path $TerminalDir "dist\index.js"

@"
@echo off
"$BunPath" "$DistPath" %*
"@ | Set-Content -Path $LauncherPath -Encoding ASCII

Write-Ok "Launcher: $LauncherPath"

# ── Add to PATH (user scope) ────────────────────────────────

$CurrentPath = [Environment]::GetEnvironmentVariable("PATH", "User")

if ($CurrentPath -split ";" | Where-Object { $_ -eq $BinDir }) {
    Write-Ok "$BinDir already in PATH"
} else {
    Write-Host ""
    Write-Info "wabisabi needs to be in your PATH to work as a command."
    Write-Info "This will add to your User PATH: $BinDir"
    Write-Host ""

    if (Confirm-Action "Add wabisabi to your PATH?") {
        $NewPath = "$BinDir;$CurrentPath"
        [Environment]::SetEnvironmentVariable("PATH", $NewPath, "User")
        $env:PATH = "$BinDir;$env:PATH"
        Write-Ok "Added to User PATH"
    } else {
        Write-Warn "Skipped. Add manually via System Settings > Environment Variables"
    }
}

# ── Verify ───────────────────────────────────────────────────

Write-Host ""
if (Get-Command wabisabi -ErrorAction SilentlyContinue) {
    Write-Ok "wabisabi command is ready"
} else {
    Write-Info "Open a new terminal to use the wabisabi command."
}

# ── Done ─────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Installation complete" -ForegroundColor Green
Write-Host ""
Write-Host "  Usage:" -ForegroundColor DarkGray
Write-Host "    wabisabi                  Start interactive mode" -ForegroundColor Cyan
Write-Host "    wabisabi config --wizard  Configure providers" -ForegroundColor Cyan
Write-Host "    wabisabi --help           Show all commands" -ForegroundColor Cyan
Write-Host ""
