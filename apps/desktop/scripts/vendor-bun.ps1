# Real Bun CLI file into bin\bun.exe (never a directory named bun).
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DestDir = Join-Path $Root "bin"
$Dest = Join-Path $DestDir "bun.exe"
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

if ($env:DEVSHELL_BUN_PATH -and (Test-Path -LiteralPath $env:DEVSHELL_BUN_PATH -PathType Leaf)) {
  $Src = $env:DEVSHELL_BUN_PATH
} else {
  $Cmd = Get-Command bun -ErrorAction SilentlyContinue
  if (-not $Cmd) {
    Write-Error "No bun on PATH and DEVSHELL_BUN_PATH unset."
  }
  $Src = $Cmd.Source
}

if (Test-Path -LiteralPath $Src -PathType Container) {
  Write-Error "Refusing directory named bun: $Src"
}

Copy-Item -LiteralPath $Src -Destination $Dest -Force
Write-Host "Vendored bun → $Dest"
& $Dest --version
