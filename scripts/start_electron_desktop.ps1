$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

Write-Host "[start] ensure runtime dirs"
$dirs = @(
  "runtime\browser_runtime",
  "runtime\chrome_profile",
  "runtime\cookies",
  "runtime\pids",
  "runtime\logs",
  "runtime\recordings",
  "runtime\workflows",
  "runtime\claude-session",
  "runtime\claude-config"
)
foreach ($dir in $dirs) {
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
}

Write-Host "[start] runtime health"
npm --prefix runtime run dev

Write-Host "[start] launching renderer + electron"
npm --prefix electron run desktop
