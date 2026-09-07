[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$package = Get-Content -Raw (Join-Path $repoRoot 'package.json') | ConvertFrom-Json
$version = [string]$package.version
$releaseRoot = Join-Path $repoRoot 'src-tauri/target/release'
$executable = Join-Path $releaseRoot 'klip.exe'
if (-not (Test-Path -LiteralPath $executable)) {
  throw 'Build the Windows application and installers before creating the ZIP.'
}
if ([System.Diagnostics.FileVersionInfo]::GetVersionInfo($executable).ProductVersion -ne $version) {
  throw 'The executable version does not match package.json.'
}

$bundleRoot = Join-Path $releaseRoot 'bundle'
$installers = @(
  (Join-Path $bundleRoot "nsis/Klip_${version}_x64-setup.exe"),
  (Join-Path $bundleRoot "msi/Klip_${version}_x64_en-US.msi")
)
foreach ($installer in $installers) {
  if (-not (Test-Path -LiteralPath $installer)) {
    throw "Missing installer: $installer"
  }
}

$zipRoot = Join-Path $bundleRoot 'zip'
$packageRoot = Join-Path $zipRoot "Klip_${version}_windows-x64"
if (Test-Path -LiteralPath $packageRoot) {
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
Copy-Item -LiteralPath $executable -Destination $packageRoot
Copy-Item -Path (Join-Path $repoRoot 'src-tauri/resources/vcredist/*') -Destination $packageRoot
foreach ($resource in @('ocr', 'onnxruntime/windows-x86_64')) {
  $destination = Join-Path $packageRoot "resources/$resource"
  New-Item -ItemType Directory -Force -Path $destination | Out-Null
  Copy-Item -Path (Join-Path $releaseRoot "resources/$resource/*") -Destination $destination
}
Copy-Item -LiteralPath (Join-Path $repoRoot 'docs/WINDOWS_ZIP.md') -Destination (Join-Path $packageRoot 'README.md')
Copy-Item -LiteralPath (Join-Path $repoRoot 'LICENSE') -Destination $packageRoot

$requiredFiles = @(
  'klip.exe',
  'msvcp140.dll',
  'msvcp140_1.dll',
  'vcruntime140.dll',
  'vcruntime140_1.dll',
  'resources/ocr/pp-ocrv5_mobile_det.onnx',
  'resources/ocr/pp-ocrv5_mobile_rec.onnx',
  'resources/ocr/ppocrv5_dict.txt',
  'resources/onnxruntime/windows-x86_64/onnxruntime.dll'
)
foreach ($requiredFile in $requiredFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $packageRoot $requiredFile))) {
    throw "Incomplete ZIP contents: $requiredFile is missing."
  }
}

$zipPath = Join-Path $zipRoot "Klip_${version}_windows-x64.zip"
Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -Force
$artifacts = @($installers) + @($zipPath)
$checksumLines = foreach ($artifact in $artifacts) {
  $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
  "$hash  $([System.IO.Path]::GetFileName($artifact))"
}
$checksumPath = Join-Path $bundleRoot 'SHA256SUMS.txt'
[System.IO.File]::WriteAllLines($checksumPath, [string[]]$checksumLines, [System.Text.UTF8Encoding]::new($false))
Write-Host "ZIP: $zipPath"
Write-Host "Checksums: $checksumPath"
