param(
  [int]$Port = 3000,
  [int]$MaxWaitSeconds = 25,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$LogDir = Join-Path $ProjectRoot "logs"
$Script = Join-Path $ProjectRoot "scripts\site-service.cjs"
$NodePath = (Get-Command node).Source
$NpmPath = (Get-Command npm.cmd).Source
$Url = "http://localhost:$Port/"
$HealthUrl = "http://127.0.0.1:$Port/"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Test-SiteReady {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Get-LatestSourceWriteTime {
  $candidatePaths = @(
    "src",
    "public",
    "scripts",
    "package.json",
    "package-lock.json",
    "next.config.ts",
    "tsconfig.json"
  )

  $latest = [DateTime]::MinValue
  foreach ($relativePath in $candidatePaths) {
    $path = Join-Path $ProjectRoot $relativePath
    if (-not (Test-Path -LiteralPath $path)) {
      continue
    }

    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer) {
      $files = Get-ChildItem -LiteralPath $path -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object {
          $_.FullName -notmatch "\\node_modules\\" -and
          $_.FullName -notmatch "\\.next\\" -and
          $_.FullName -notmatch "\\logs\\"
        }

      foreach ($file in $files) {
        if ($file.LastWriteTimeUtc -gt $latest) {
          $latest = $file.LastWriteTimeUtc
        }
      }
    } elseif ($item.LastWriteTimeUtc -gt $latest) {
      $latest = $item.LastWriteTimeUtc
    }
  }

  return $latest
}

function Test-BuildFresh {
  $buildIdPath = Join-Path $ProjectRoot ".next\BUILD_ID"
  if (-not (Test-Path -LiteralPath $buildIdPath)) {
    return $false
  }

  $buildTime = (Get-Item -LiteralPath $buildIdPath).LastWriteTimeUtc
  $sourceTime = Get-LatestSourceWriteTime
  return $buildTime -ge $sourceTime
}

function Test-RunningServerFresh {
  if (-not (Test-SiteReady)) {
    return $false
  }

  $buildIdPath = Join-Path $ProjectRoot ".next\BUILD_ID"
  $serviceLogPath = Join-Path $LogDir "site-service.log"
  if (
    -not (Test-Path -LiteralPath $buildIdPath) -or
    -not (Test-Path -LiteralPath $serviceLogPath)
  ) {
    return $false
  }

  $buildTime = (Get-Item -LiteralPath $buildIdPath).LastWriteTimeUtc
  $serviceStartTime = (Get-Item -LiteralPath $serviceLogPath).LastWriteTimeUtc
  return $serviceStartTime -ge $buildTime
}

function Get-SiteProcessIdOnPort {
  param([int]$PortToFind = $Port)

  try {
    $connection = Get-NetTCPConnection -LocalPort $PortToFind -State Listen -ErrorAction Stop |
      Select-Object -First 1
    if ($connection) {
      return [int]$connection.OwningProcess
    }
  } catch {
    $netstatLine = netstat -ano |
      Select-String -Pattern "127\.0\.0\.1:$PortToFind\s+.*LISTENING\s+(\d+)" |
      Select-Object -First 1

    if ($netstatLine -and $netstatLine.Matches.Count -gt 0) {
      return [int]$netstatLine.Matches[0].Groups[1].Value
    }
  }

  return $null
}

function Stop-SiteOnPort {
  param([int]$PortToStop)

  $processId = Get-SiteProcessIdOnPort -PortToFind $PortToStop
  if (-not $processId) {
    return
  }

  "[$(Get-Date -Format o)] stopping stale site process $processId on port $PortToStop" |
    Add-Content -LiteralPath (Join-Path $LogDir "open-site.log")
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue

  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (-not (Test-SiteReady)) {
      break
    }
    Start-Sleep -Milliseconds 300
  }
}

try {
  Set-Location $ProjectRoot
  "[$(Get-Date -Format o)] open-site begin" | Add-Content -LiteralPath (Join-Path $LogDir "open-site.log")

  if (-not (Test-BuildFresh)) {
    if (Test-SiteReady) {
      Stop-SiteOnPort -PortToStop $Port
    }
    & $NpmPath run build *>> (Join-Path $LogDir "open-site-build.log")
  }

  if ((Test-SiteReady) -and -not (Test-RunningServerFresh)) {
    Stop-SiteOnPort -PortToStop $Port
  }

  if (-not (Test-SiteReady)) {
    $arguments = "`"$Script`" run"
    "[$(Get-Date -Format o)] starting site service for $Url" |
      Set-Content -LiteralPath (Join-Path $LogDir "site-service.log")
    Start-Process -FilePath $NodePath `
      -ArgumentList $arguments `
      -WorkingDirectory $ProjectRoot `
      -WindowStyle Hidden

    $deadline = (Get-Date).AddSeconds($MaxWaitSeconds)
    while ((Get-Date) -lt $deadline) {
      if (Test-SiteReady) {
        break
      }
      Start-Sleep -Seconds 1
    }
  }

  if (Test-SiteReady) {
    if (-not $NoOpen) {
      try {
        Start-Process $Url
      } catch {
        "[$(Get-Date -Format o)] browser open failed: $($_.Exception.Message)" |
          Add-Content -LiteralPath (Join-Path $LogDir "browser-open-warning.log")
        Write-Host "The site is ready at $Url. Browser auto-open failed, please open it manually."
      }
    }
    exit 0
  }

  "[$(Get-Date -Format o)] site did not become ready within $MaxWaitSeconds seconds" |
    Add-Content -LiteralPath (Join-Path $LogDir "open-site-error.log")
  Write-Host "The site did not start within $MaxWaitSeconds seconds. Check logs\open-site-error.log."
  exit 1
} catch {
  "[$(Get-Date -Format o)] $($_.Exception.Message)" |
    Add-Content -LiteralPath (Join-Path $LogDir "open-site-error.log")
  Write-Host $_.Exception.Message
  exit 1
}
