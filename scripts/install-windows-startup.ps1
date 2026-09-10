param(
  [string]$EntryName = "AI Creation Assistant Site",
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$NodePath = (Get-Command node).Source
$NpmPath = (Get-Command npm.cmd).Source
$Script = Join-Path $ProjectRoot "scripts\site-service.cjs"
$BuildScript = Join-Path $ProjectRoot "scripts\startup-build-and-serve.ps1"
$LogDir = Join-Path $ProjectRoot "logs"
$StartupFolder = [Environment]::GetFolderPath("Startup")
$StartupEntry = Join-Path $StartupFolder "$EntryName.vbs"

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

@"
`$ErrorActionPreference = "Stop"
try {
  "[$(Get-Date -Format o)] startup begin" | Add-Content -LiteralPath "$LogDir\startup.log"
  Set-Location "$ProjectRoot"
  `$env:PORT = "$Port"
  if (-not (Test-Path ".next\BUILD_ID")) {
    & "$NpmPath" run build *>> "$LogDir\startup-build.log"
  }
  & "$NodePath" "$Script" run *>> "$LogDir\site-service.log"
} catch {
  "[$(Get-Date -Format o)] `$(`$_.Exception.Message)" | Add-Content -LiteralPath "$LogDir\startup-error.log"
  throw
}
"@ | Set-Content -LiteralPath $BuildScript -Encoding UTF8

@"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$BuildScript""", 0, False
"@ | Set-Content -LiteralPath $StartupEntry -Encoding Unicode

Write-Host "Installed startup entry: $StartupEntry"
Write-Host "URL: http://localhost:$Port"
