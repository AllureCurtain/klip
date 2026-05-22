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

$planned = & $scriptPath -Version $Version -SkipGitHub -OutputJson -PlanInstall -PlanUninstall | ConvertFrom-Json

if (-not $planned.installPlan) {
  throw 'Expected installPlan when -PlanInstall is set'
}

if (-not $planned.uninstallPlan) {
  throw 'Expected uninstallPlan when -PlanUninstall is set'
}

if ($planned.installPlan.executes -ne $false) {
  throw 'Expected installPlan.executes to be false by default'
}

if ($planned.uninstallPlan.executes -ne $false) {
  throw 'Expected uninstallPlan.executes to be false by default'
}

if ($planned.installPlan.nsis.command -notmatch 'Klip_.*_x64-setup\.exe') {
  throw "Expected NSIS install command to reference installer, got: $($planned.installPlan.nsis.command)"
}

if ($planned.installPlan.msi.command -notmatch 'msiexec\.exe') {
  throw "Expected MSI install command to use msiexec.exe, got: $($planned.installPlan.msi.command)"
}

if ($planned.uninstallPlan.registryEntryCount -lt 0) {
  throw 'Expected uninstallPlan.registryEntryCount to be non-negative'
}

if ($planned.uninstallPlan.commands.Count -lt 2) {
  throw "Expected uninstallPlan.commands to contain multiple guidance items, got $($planned.uninstallPlan.commands.Count)"
}

if ($planned.installPlan.executes) {
  throw 'Expected installPlan.executes to remain false unless explicitly enabled'
}

if ($planned.uninstallPlan.executes) {
  throw 'Expected uninstallPlan.executes to remain false unless explicitly enabled'
}

$rawText = & $scriptPath -Version $Version -SkipGitHub 6>&1 | Out-String
if ($rawText -notmatch 'Manual smoke checks still required') {
  throw 'Expected human-readable smoke output to include manual smoke checks'
}

if ($rawText -notmatch 'pnpm release:smoke') {
  throw 'Expected release:smoke to remain documented in the release output path'
}

Write-Host "smoke installer preflight contract OK for $Version"
