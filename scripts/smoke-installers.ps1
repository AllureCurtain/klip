param(
  [string]$Version,
  [switch]$SkipGitHub,
  [switch]$OutputJson,
  [switch]$PlanInstall,
  [switch]$PlanUninstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($Message) {
  if (-not $OutputJson) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
  }
}

function Read-JsonFile($Path) {
  Get-Content -Raw $Path | ConvertFrom-Json
}

function Get-CargoVersion {
  $cargoToml = Get-Content -Raw 'src-tauri/Cargo.toml'
  $match = [regex]::Match($cargoToml, '(?m)^version\s*=\s*"(?<version>[^"]+)"')
  if (-not $match.Success) {
    throw 'Could not find package version in src-tauri/Cargo.toml'
  }
  $match.Groups['version'].Value
}

function Get-InstallerInfo($Kind, $Path) {
  $exists = Test-Path $Path
  $size = 0
  $sha256 = $null
  $fullPath = [System.IO.Path]::GetFullPath($Path)

  if ($exists) {
    $item = Get-Item $Path
    $size = $item.Length
    $sha256 = Get-Sha256Hash $Path
  }

  [pscustomobject]@{
    kind = $Kind
    path = $fullPath
    exists = $exists
    size = $size
    sha256 = $sha256
  }
}

function Get-Sha256Hash($Path) {
  if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
    return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash
  }

  $stream = [System.IO.File]::OpenRead([System.IO.Path]::GetFullPath($Path))
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      $bytes = $sha256.ComputeHash($stream)
      return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '').ToUpperInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

function Get-InstalledKlipEntries {
  $registryRoots = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )

  $entries = @()
  foreach ($root in $registryRoots) {
    $items = Get-ItemProperty $root -ErrorAction SilentlyContinue |
      Where-Object { $_.DisplayName -eq 'Klip' -or $_.DisplayName -like 'Klip *' }

    foreach ($item in $items) {
      $entries += [pscustomobject]@{
        displayName = [string]$item.DisplayName
        displayVersion = [string]$item.DisplayVersion
        installLocation = [string]$item.InstallLocation
        uninstallString = [string]$item.UninstallString
        registryPath = [string]$item.PSPath
      }
    }
  }

  $entries
}

function Get-GitHubReleaseInfo($TagName) {
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    return [pscustomobject]@{
      checked = $false
      reason = 'gh CLI not found on PATH'
      tagName = $TagName
      isDraft = $null
      isPrerelease = $null
      url = $null
      assets = @()
    }
  }

  $json = gh release view $TagName --json tagName,name,isDraft,isPrerelease,url,assets
  $release = $json | ConvertFrom-Json
  [pscustomobject]@{
    checked = $true
    reason = $null
    tagName = [string]$release.tagName
    isDraft = [bool]$release.isDraft
    isPrerelease = [bool]$release.isPrerelease
    url = [string]$release.url
    assets = @($release.assets | ForEach-Object {
      [pscustomobject]@{
        name = [string]$_.name
        size = [int64]$_.size
        state = [string]$_.state
        url = [string]$_.url
      }
    })
  }
}

$packageJson = Read-JsonFile 'package.json'
$tauriConfig = Read-JsonFile 'src-tauri/tauri.conf.json'
$cargoVersion = Get-CargoVersion

if (-not $Version) {
  $Version = [string]$packageJson.version
}

$versionSources = [pscustomobject]@{
  packageJson = [string]$packageJson.version
  tauriConfig = [string]$tauriConfig.version
  cargoToml = [string]$cargoVersion
}

$versionMismatch = @($versionSources.packageJson, $versionSources.tauriConfig, $versionSources.cargoToml) |
  Where-Object { $_ -ne $Version }

if ($versionMismatch.Count -gt 0) {
  throw "Version mismatch for $Version`: package.json=$($versionSources.packageJson) tauri.conf.json=$($versionSources.tauriConfig) Cargo.toml=$($versionSources.cargoToml)"
}

$localInstallers = @(
  Get-InstallerInfo 'msi' "src-tauri/target/release/bundle/msi/Klip_$($Version)_x64_en-US.msi"
  Get-InstallerInfo 'nsis' "src-tauri/target/release/bundle/nsis/Klip_$($Version)_x64-setup.exe"
)

$missingInstallers = @($localInstallers | Where-Object { -not $_.exists })
if ($missingInstallers.Count -gt 0) {
  $missingPaths = ($missingInstallers | ForEach-Object { $_.path }) -join ', '
  throw "Missing local installer artifacts: $missingPaths. Run pnpm release:verify first."
}

$runningProcesses = @(Get-Process -Name 'klip' -ErrorAction SilentlyContinue | ForEach-Object {
  [pscustomobject]@{
    id = $_.Id
    processName = $_.ProcessName
    path = $_.Path
  }
})

$installedEntries = @(Get-InstalledKlipEntries)
$githubRelease = if ($SkipGitHub) {
  [pscustomobject]@{
    checked = $false
    reason = 'Skipped by -SkipGitHub'
    tagName = "v$Version"
    isDraft = $null
    isPrerelease = $null
    url = $null
    assets = @()
  }
} else {
  Get-GitHubReleaseInfo "v$Version"
}

if ($githubRelease.checked) {
  $assetNames = @($githubRelease.assets | ForEach-Object { $_.name })
  foreach ($expectedName in @("Klip_$($Version)_x64_en-US.msi", "Klip_$($Version)_x64-setup.exe")) {
    if ($assetNames -notcontains $expectedName) {
      throw "GitHub release v$Version is missing asset $expectedName"
    }
  }
}

$manualChecks = @(
  'Install NSIS on a clean Windows user profile or VM.'
  'Launch Klip and confirm it starts hidden in the tray.'
  'Open from tray and from Ctrl+Alt+K.'
  'Copy plain text, an image, one file, and multiple files/folders; confirm each appears.'
  'Select a history item and confirm it pastes into Notepad or another target app.'
  'Enable autostart, sign out/in or reboot, and confirm Klip launches.'
  'Disable autostart and confirm the OS autostart entry is removed.'
  'Uninstall and confirm the app process is gone and startup entry is removed.'
)

function Get-InstallPlans($Version, $LocalInstallers) {
  $nsisPath = ($LocalInstallers | Where-Object { $_.kind -eq 'nsis' } | Select-Object -First 1).path
  $msiPath = ($LocalInstallers | Where-Object { $_.kind -eq 'msi' } | Select-Object -First 1).path

  [pscustomobject]@{
    executes = $false
    nsis = [pscustomobject]@{
      command = "Start-Process -FilePath `"$nsisPath`" -Wait"
      installerPath = $nsisPath
    }
    msi = [pscustomobject]@{
      command = "Start-Process -FilePath `"msiexec.exe`" -ArgumentList @('/i', `"$msiPath`", '/qn', '/norestart') -Wait"
      installerPath = $msiPath
    }
  }
}

function Get-UninstallPlan($Version, $InstalledEntries) {
  [pscustomobject]@{
    executes = $false
    registryEntryCount = @($InstalledEntries).Count
    registryEntries = @($InstalledEntries)
    commands = @(
      'Uninstall from Apps & features or Programs and Features.'
      'If the installer writes an uninstall command, prefer that exact uninstall string.'
      'After uninstall, confirm the process is gone and the startup entry is removed.'
    )
  }
}

$report = [pscustomobject]@{
  version = $Version
  versionSources = $versionSources
  localInstallers = $localInstallers
  githubRelease = $githubRelease
  installedEntries = $installedEntries
  runningProcesses = $runningProcesses
  manualChecks = $manualChecks
}

if ($PlanInstall) {
  $report | Add-Member -NotePropertyName installPlan -NotePropertyValue (Get-InstallPlans $Version $localInstallers)
}

if ($PlanUninstall) {
  $report | Add-Member -NotePropertyName uninstallPlan -NotePropertyValue (Get-UninstallPlan $Version $installedEntries)
}

if ($OutputJson) {
  $report | ConvertTo-Json -Depth 6
  exit 0
}

Step "Installer preflight for Klip $Version"
Write-Host "Version metadata OK: $Version"
Write-Host "Release smoke command: pnpm release:smoke"

Step 'Local installer artifacts'
foreach ($installer in $localInstallers) {
  Write-Host "$($installer.kind.ToUpper()): $($installer.path)"
  Write-Host "  Size:   $($installer.size) bytes"
  Write-Host "  SHA256: $($installer.sha256)"
}

Step 'GitHub release assets'
if ($githubRelease.checked) {
  Write-Host "Release: $($githubRelease.url)"
  foreach ($asset in $githubRelease.assets) {
    Write-Host "  $($asset.name) ($($asset.size) bytes, $($asset.state))"
  }
} else {
  Write-Host "Skipped: $($githubRelease.reason)"
}

Step 'Current machine state'
Write-Host "Running klip.exe processes: $($runningProcesses.Count)"
Write-Host "Installed Klip registry entries: $($installedEntries.Count)"

Step 'Manual smoke checks still required'
foreach ($check in $manualChecks) {
  Write-Host "- [ ] $check"
}
