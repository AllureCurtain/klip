param(
  [int]$Port = 4444,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Step($Message) {
  Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command($Name, $InstallHint) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "$Name was not found on PATH. $InstallHint"
  }
}

function Wait-ForPort($HostName, $PortNumber) {
  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline) {
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
      $connect = $client.BeginConnect($HostName, $PortNumber, $null, $null)
      if ($connect.AsyncWaitHandle.WaitOne(500)) {
        $client.EndConnect($connect)
        return
      }
    } catch {
      Start-Sleep -Milliseconds 250
    } finally {
      $client.Dispose()
    }
  }
  throw "Timed out waiting for $HostName`:$PortNumber"
}

Require-Command 'tauri-driver' 'Install it with: cargo install tauri-driver --locked'

if ($env:OS -eq 'Windows_NT') {
  Require-Command 'msedgedriver' 'Install Microsoft Edge WebDriver and add msedgedriver.exe to PATH.'
}

if (-not $SkipBuild) {
  Step 'Building frontend assets'
  pnpm build

  Step 'Building Tauri debug binary'
  Push-Location 'src-tauri'
  try {
    cargo build
  } finally {
    Pop-Location
  }
}

$binaryName = if ($env:OS -eq 'Windows_NT') { 'klip.exe' } else { 'klip' }
$appPath = Join-Path $repoRoot "src-tauri\target\debug\$binaryName"
if (-not (Test-Path $appPath)) {
  throw "Tauri debug binary not found at $appPath"
}

$runRoot = Join-Path $repoRoot ("e2e\.tmp\run-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $runRoot | Out-Null

$previousAppData = $env:APPDATA
$previousLocalAppData = $env:LOCALAPPDATA
$previousE2eShowWindow = $env:KLIP_E2E_SHOW_WINDOW
$previousDataDir = $env:KLIP_DATA_DIR
$previousLogDir = $env:KLIP_LOG_DIR

$env:SELENIUM_REMOTE_URL = "http://127.0.0.1:$Port"
$env:KLIP_E2E_APP = $appPath
$env:KLIP_E2E_SHOW_WINDOW = '1'
$env:KLIP_DATA_DIR = Join-Path $runRoot 'KlipData'
$env:KLIP_LOG_DIR = Join-Path $runRoot 'KlipLogs'
$env:APPDATA = Join-Path $runRoot 'AppData\Roaming'
$env:LOCALAPPDATA = Join-Path $runRoot 'AppData\Local'
New-Item -ItemType Directory -Force -Path $env:APPDATA, $env:LOCALAPPDATA, $env:KLIP_DATA_DIR, $env:KLIP_LOG_DIR | Out-Null

$driverOut = Join-Path $runRoot 'tauri-driver.out.log'
$driverErr = Join-Path $runRoot 'tauri-driver.err.log'

Step "Starting tauri-driver on port $Port"
$driverProcess = Start-Process `
  -FilePath 'tauri-driver' `
  -ArgumentList @('--port', "$Port") `
  -RedirectStandardOutput $driverOut `
  -RedirectStandardError $driverErr `
  -WindowStyle Hidden `
  -PassThru

try {
  Wait-ForPort '127.0.0.1' $Port

  $env:APPDATA = $previousAppData
  $env:LOCALAPPDATA = $previousLocalAppData
  $env:KLIP_E2E_SHOW_WINDOW = $previousE2eShowWindow
  $env:KLIP_DATA_DIR = $previousDataDir
  $env:KLIP_LOG_DIR = $previousLogDir

  Step 'Running Selenium E2E tests'
  pnpm exec mocha "e2e/**/*.e2e.js" --timeout 90000
} finally {
  $env:APPDATA = $previousAppData
  $env:LOCALAPPDATA = $previousLocalAppData
  $env:KLIP_E2E_SHOW_WINDOW = $previousE2eShowWindow
  $env:KLIP_DATA_DIR = $previousDataDir
  $env:KLIP_LOG_DIR = $previousLogDir

  if ($driverProcess -and -not $driverProcess.HasExited) {
    Stop-Process -Id $driverProcess.Id -Force
  }
}
