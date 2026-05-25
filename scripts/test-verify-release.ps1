param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$scriptPath = Join-Path $PSScriptRoot 'verify-release.ps1'

function Invoke-ReadinessReport {
  $raw = & $scriptPath -ReadinessOnly -OutputJson
  return $raw | ConvertFrom-Json
}

function With-Env($Values, [scriptblock]$Action) {
  $previous = @{}
  foreach ($key in $Values.Keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
    [Environment]::SetEnvironmentVariable($key, [string]$Values[$key], 'Process')
  }

  try {
    & $Action
  } finally {
    foreach ($key in $Values.Keys) {
      [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
  }
}

Set-Location $repoRoot

$envKeys = @(
  'KLIP_WINDOWS_CERTIFICATE_THUMBPRINT',
  'KLIP_WINDOWS_CERTIFICATE_PATH',
  'KLIP_WINDOWS_CERTIFICATE_PASSWORD',
  'KLIP_WINDOWS_TIMESTAMP_URL',
  'KLIP_UPDATE_FEED_URL'
)

$clearValues = @{}
foreach ($key in $envKeys) {
  $clearValues[$key] = ''
}

With-Env $clearValues {
  $jsonText = & $scriptPath -ReadinessOnly -OutputJson 6>&1 | Out-String
  if (-not $jsonText.TrimStart().StartsWith('{')) {
    throw "Expected -OutputJson to emit raw JSON without human-readable preamble, got: $jsonText"
  }

  $report = Invoke-ReadinessReport

  if ($report.signing.configured) {
    throw 'Expected signing.configured to be false without signing env or tauri config.'
  }
  if ($report.updates.configured) {
    throw 'Expected updates.configured to be false without KLIP_UPDATE_FEED_URL.'
  }
  if ($report.signing.blocking) {
    throw 'Expected signing.blocking to be false because readiness does not require real credentials.'
  }
  if ($report.updates.blocking) {
    throw 'Expected updates.blocking to be false because readiness does not require a hosted feed.'
  }
  if ($report.signing.sources.Count -ne 0) {
    throw "Expected no signing sources, got $($report.signing.sources -join ', ')"
  }
}

With-Env @{
  KLIP_WINDOWS_CERTIFICATE_THUMBPRINT = '00112233445566778899AABBCCDDEEFF00112233'
  KLIP_WINDOWS_TIMESTAMP_URL = 'https://timestamp.example.test'
  KLIP_UPDATE_FEED_URL = 'https://updates.example.test/klip.json'
} {
  $report = Invoke-ReadinessReport

  if (-not $report.signing.configured) {
    throw 'Expected signing.configured when thumbprint env is set.'
  }
  if (-not $report.signing.timestampConfigured) {
    throw 'Expected signing.timestampConfigured when timestamp env is set.'
  }
  if (-not $report.updates.configured) {
    throw 'Expected updates.configured when KLIP_UPDATE_FEED_URL is set.'
  }
  if ($report.updates.feedUrl -ne 'https://updates.example.test/klip.json') {
    throw "Unexpected update feed URL: $($report.updates.feedUrl)"
  }
  if ($report.signing.sources -notcontains 'env:KLIP_WINDOWS_CERTIFICATE_THUMBPRINT') {
    throw "Expected signing source to include thumbprint env, got $($report.signing.sources -join ', ')"
  }
}

With-Env @{
  KLIP_WINDOWS_CERTIFICATE_PATH = 'C:\release\klip-signing.pfx'
  KLIP_WINDOWS_CERTIFICATE_PASSWORD = 'secret'
} {
  $report = Invoke-ReadinessReport

  if (-not $report.signing.configured) {
    throw 'Expected signing.configured when certificate path env is set.'
  }
  if (-not $report.signing.passwordConfigured) {
    throw 'Expected signing.passwordConfigured when certificate password env is set.'
  }
  if ($report.signing.sources -notcontains 'env:KLIP_WINDOWS_CERTIFICATE_PATH') {
    throw "Expected signing source to include path env, got $($report.signing.sources -join ', ')"
  }
}

Write-Host 'verify-release readiness contract OK'
