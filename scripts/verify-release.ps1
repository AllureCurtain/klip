[CmdletBinding()]
param(
  [switch]$SkipBundle,
  [switch]$ReadinessOnly,
  [switch]$OutputJson
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Read-JsonFile($Path) {
  Get-Content -Raw $Path | ConvertFrom-Json
}

function Test-HasValue($Value) {
  return -not [string]::IsNullOrWhiteSpace([string]$Value)
}

function Get-EnvValue($Name) {
  return [Environment]::GetEnvironmentVariable($Name, 'Process')
}

function Get-ReleaseReadiness($TauriConfig) {
  $windowsBundle = $TauriConfig.bundle.windows
  $sources = New-Object System.Collections.Generic.List[string]

  $configThumbprint = $null
  $configTimestampUrl = $null
  if ($windowsBundle) {
    $configThumbprint = [string]$windowsBundle.certificateThumbprint
    $configTimestampUrl = [string]$windowsBundle.timestampUrl
  }

  $envThumbprint = Get-EnvValue 'KLIP_WINDOWS_CERTIFICATE_THUMBPRINT'
  $envCertificatePath = Get-EnvValue 'KLIP_WINDOWS_CERTIFICATE_PATH'
  $envCertificatePassword = Get-EnvValue 'KLIP_WINDOWS_CERTIFICATE_PASSWORD'
  $envTimestampUrl = Get-EnvValue 'KLIP_WINDOWS_TIMESTAMP_URL'
  $envUpdateFeedUrl = Get-EnvValue 'KLIP_UPDATE_FEED_URL'

  if (Test-HasValue $configThumbprint) {
    $sources.Add('tauri.conf.json:bundle.windows.certificateThumbprint')
  }
  if (Test-HasValue $envThumbprint) {
    $sources.Add('env:KLIP_WINDOWS_CERTIFICATE_THUMBPRINT')
  }
  if (Test-HasValue $envCertificatePath) {
    $sources.Add('env:KLIP_WINDOWS_CERTIFICATE_PATH')
  }

  $timestampConfigured = (Test-HasValue $configTimestampUrl) -or (Test-HasValue $envTimestampUrl)
  $signingConfigured = $sources.Count -gt 0
  $updateConfigured = Test-HasValue $envUpdateFeedUrl

  [pscustomobject]@{
    signing = [pscustomobject]@{
      configured = $signingConfigured
      blocking = $false
      sources = @($sources)
      timestampConfigured = $timestampConfigured
      passwordConfigured = Test-HasValue $envCertificatePassword
      note = if ($signingConfigured) {
        'Windows signing inputs are configured. This script does not validate certificate availability.'
      } else {
        'Windows signing inputs are not configured. Installers may show SmartScreen or unknown publisher warnings.'
      }
    }
    updates = [pscustomobject]@{
      configured = $updateConfigured
      blocking = $false
      feedUrl = if ($updateConfigured) { [string]$envUpdateFeedUrl } else { '' }
      note = if ($updateConfigured) {
        'Update feed URL is configured. This script does not validate hosted feed availability.'
      } else {
        'Update feed URL is not configured. Publish updates through GitHub Release/manual installer distribution.'
      }
    }
  }
}

function Write-ReadinessSummary($Report) {
  if ($Report.signing.configured) {
    Write-Host "Windows code signing readiness configured via: $($Report.signing.sources -join ', ')"
  } else {
    Write-Host $Report.signing.note
  }

  if ($Report.signing.timestampConfigured) {
    Write-Host 'Windows signing timestamp readiness configured.'
  } else {
    Write-Host 'Windows signing timestamp URL is not configured.'
  }

  if ($Report.updates.configured) {
    Write-Host "Update feed readiness configured: $($Report.updates.feedUrl)"
  } else {
    Write-Host $Report.updates.note
  }
}

if (-not ($ReadinessOnly -and $OutputJson)) {
  Step 'Checking version metadata'
}
$packageJson = Read-JsonFile 'package.json'
$tauriConfig = Read-JsonFile 'src-tauri/tauri.conf.json'
$cargoToml = Get-Content -Raw 'src-tauri/Cargo.toml'
$readinessReport = Get-ReleaseReadiness $tauriConfig

if ($ReadinessOnly) {
  if ($OutputJson) {
    $readinessReport | ConvertTo-Json -Depth 6
  } else {
    Write-ReadinessSummary $readinessReport
  }
  exit 0
}

$packageVersion = [string]$packageJson.version
$tauriVersion = [string]$tauriConfig.version
$cargoVersionMatch = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"(?<version>[^"]+)"')
if (-not $cargoVersionMatch.Success) {
  throw 'Could not find package version in src-tauri/Cargo.toml'
}
$cargoVersion = $cargoVersionMatch.Groups['version'].Value

if ($packageVersion -ne $tauriVersion -or $packageVersion -ne $cargoVersion) {
  throw "Version mismatch: package.json=$packageVersion tauri.conf.json=$tauriVersion Cargo.toml=$cargoVersion"
}

if (-not (Select-String -Path 'CHANGELOG.md' -Pattern ([regex]::Escape($packageVersion)) -Quiet)) {
  throw "CHANGELOG.md does not mention version $packageVersion"
}

Write-Host "Version metadata OK: $packageVersion"

Step 'Checking distribution readiness'
Write-ReadinessSummary $readinessReport

Step 'Running frontend lint, tests, and build'
pnpm lint
pnpm test -- --run
pnpm build

Step 'Running Rust fmt, clippy, and tests'
Push-Location 'src-tauri'
try {
  cargo fmt -- --check
  cargo clippy -- -D warnings
  cargo test
}
finally {
  Pop-Location
}

if (-not $SkipBundle) {
  Step 'Building Tauri installers'
  pnpm tauri:build

  $msi = Get-ChildItem 'src-tauri/target/release/bundle/msi' -Filter '*.msi' -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  $nsis = Get-ChildItem 'src-tauri/target/release/bundle/nsis' -Filter '*.exe' -ErrorAction Stop | Sort-Object LastWriteTime -Descending | Select-Object -First 1

  if (-not $msi) { throw 'MSI bundle was not produced' }
  if (-not $nsis) { throw 'NSIS installer was not produced' }

  Write-Host "MSI:  $($msi.FullName) ($($msi.Length) bytes)"
  Write-Host "NSIS: $($nsis.FullName) ($($nsis.Length) bytes)"
} else {
  Write-Host 'Skipping installer bundle build.'
}

Step 'Release verification complete'
