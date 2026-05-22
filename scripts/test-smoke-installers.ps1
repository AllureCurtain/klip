param(
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot 'smoke-installers.ps1'

if (-not $Version) {
  $packageJson = Get-Content -Raw (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
  $Version = [string]$packageJson.version
}

$raw = & $scriptPath -Version $Version -SkipGitHub -OutputJson
$report = $raw | ConvertFrom-Json

if ($report.version -ne $Version) {
  throw "Expected version $Version, got $($report.version)"
}

if ($report.localInstallers.Count -ne 2) {
  throw "Expected 2 local installers, got $($report.localInstallers.Count)"
}

foreach ($installer in $report.localInstallers) {
  if (-not $installer.exists) {
    throw "Expected installer to exist: $($installer.path)"
  }
  if ($installer.size -le 0) {
    throw "Expected installer size > 0: $($installer.path)"
  }
  if ($installer.sha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw "Expected 64-character SHA256 for $($installer.path)"
  }
}

if ($report.manualChecks.Count -lt 6) {
  throw "Expected at least 6 manual smoke checks, got $($report.manualChecks.Count)"
}

Write-Host "smoke installer preflight contract OK for $Version"
