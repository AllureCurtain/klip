param(
  [string]$WebView2Version,
  [string]$Destination,
  [switch]$AddToGitHubPath
)

$ErrorActionPreference = 'Stop'

function Get-WebView2Runtime {
  $roots = foreach ($basePath in @(
    ${env:ProgramFiles(x86)},
    $env:ProgramFiles,
    $env:LOCALAPPDATA
  )) {
    if (-not [string]::IsNullOrWhiteSpace($basePath)) {
      Join-Path $basePath 'Microsoft\EdgeWebView\Application'
    }
  }

  $runtimes = foreach ($root in $roots) {
    if (-not (Test-Path -LiteralPath $root)) {
      continue
    }

    Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      ForEach-Object {
        $executable = Join-Path $_.FullName 'msedgewebview2.exe'
        if (Test-Path -LiteralPath $executable) {
          $version = (Get-Item -LiteralPath $executable).VersionInfo.ProductVersion
          if ($version -match '^\d+\.\d+\.\d+\.\d+$') {
            [pscustomobject]@{
              Executable = $executable
              Version = $version
              ParsedVersion = [version]$version
            }
          }
        }
      }
  }

  $runtime = $runtimes | Sort-Object ParsedVersion -Descending | Select-Object -First 1
  if (-not $runtime) {
    throw 'Microsoft Edge WebView2 Runtime was not found in the standard install locations.'
  }

  return $runtime
}

if ([string]::IsNullOrWhiteSpace($WebView2Version)) {
  $runtime = Get-WebView2Runtime
  $WebView2Version = $runtime.Version
  Write-Host "WebView2 Runtime: $WebView2Version ($($runtime.Executable))"
} elseif ($WebView2Version -notmatch '^\d+\.\d+\.\d+\.\d+$') {
  throw "Invalid WebView2 version: $WebView2Version"
} else {
  Write-Host "WebView2 Runtime override: $WebView2Version"
}

if ([string]::IsNullOrWhiteSpace($Destination)) {
  $tempRoot = if (-not [string]::IsNullOrWhiteSpace($env:RUNNER_TEMP)) {
    $env:RUNNER_TEMP
  } else {
    [System.IO.Path]::GetTempPath()
  }
  $Destination = Join-Path $tempRoot "klip-edgedriver-$WebView2Version"
}

$archiveName = 'edgedriver_win64.zip'
$archiveUri = "https://msedgedriver.microsoft.com/$WebView2Version/$archiveName"
$archivePath = Join-Path $Destination $archiveName

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Write-Host "Downloading EdgeDriver $WebView2Version from $archiveUri"
Invoke-WebRequest -Uri $archiveUri -OutFile $archivePath
Expand-Archive -LiteralPath $archivePath -DestinationPath $Destination -Force

$driver = Get-ChildItem -LiteralPath $Destination -Filter 'msedgedriver.exe' -File -Recurse |
  Select-Object -First 1
if (-not $driver) {
  throw "The EdgeDriver archive did not contain msedgedriver.exe: $archivePath"
}

$driverOutput = (& $driver.FullName --version | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "EdgeDriver version check failed with exit code $LASTEXITCODE"
}
if ($driverOutput -notmatch "\b$([regex]::Escape($WebView2Version))\b") {
  throw "Downloaded EdgeDriver does not match WebView2 $WebView2Version`: $driverOutput"
}

$signature = Get-AuthenticodeSignature -LiteralPath $driver.FullName
if ($signature.Status -ne 'Valid' -or
    $signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') {
  throw "EdgeDriver does not have a valid Microsoft signature: $($signature.Status)"
}

Write-Host "EdgeDriver: $driverOutput ($($driver.FullName))"
Write-Host "EdgeDriver signer: $($signature.SignerCertificate.Subject)"

if ($AddToGitHubPath) {
  if ([string]::IsNullOrWhiteSpace($env:GITHUB_PATH)) {
    throw 'GITHUB_PATH is required when -AddToGitHubPath is used.'
  }
  $driver.Directory.FullName | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
  Write-Host "Added $($driver.Directory.FullName) to GITHUB_PATH"
}

$driver.FullName
