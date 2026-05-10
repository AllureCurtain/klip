param(
  [switch]$SkipBundle
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

Step 'Checking version metadata'
$packageJson = Read-JsonFile 'package.json'
$tauriConfig = Read-JsonFile 'src-tauri/tauri.conf.json'
$cargoToml = Get-Content -Raw 'src-tauri/Cargo.toml'

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
