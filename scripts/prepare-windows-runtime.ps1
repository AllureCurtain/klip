[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) {
  throw 'Visual Studio Installer is required to locate the redistributable C++ runtime.'
}

$installation = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($installation)) {
  throw 'Visual Studio C++ tools and their redistributable runtime were not found.'
}

$versions = Get-ChildItem -LiteralPath (Join-Path $installation 'VC/Redist/MSVC') -Directory |
  Where-Object { $_.Name -match '^\d+(\.\d+)+$' } |
  Sort-Object { [version]$_.Name } -Descending
$runtime = $null
foreach ($version in $versions) {
  $runtime = Get-ChildItem -Path (Join-Path $version.FullName 'x64/Microsoft.VC*.CRT') -Directory |
    Select-Object -First 1
  if ($runtime) { break }
}
if (-not $runtime) {
  throw 'The x64 redistributable C++ runtime directory was not found.'
}

$required = @('msvcp140.dll', 'msvcp140_1.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')
foreach ($name in $required) {
  if (-not (Test-Path -LiteralPath (Join-Path $runtime.FullName $name))) {
    throw "The redistributable runtime is missing $name"
  }
}

$destination = Join-Path $repoRoot 'src-tauri/resources/vcredist'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath $destination -Filter '*.dll' | Remove-Item -Force
Copy-Item -Path (Join-Path $runtime.FullName '*.dll') -Destination $destination
Write-Host "Prepared x64 C++ runtime from $($runtime.FullName)"
