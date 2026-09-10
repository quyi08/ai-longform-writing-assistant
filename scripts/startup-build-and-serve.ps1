$ErrorActionPreference = "Stop"
try {
  "[2026-08-12T08:21:03.4746821+08:00] startup begin" | Add-Content -LiteralPath "C:\Users\quyi\Documents\AI创作辅助平台\logs\startup.log"
  Set-Location "C:\Users\quyi\Documents\AI创作辅助平台"
  $env:PORT = "3000"
  if (-not (Test-Path ".next\BUILD_ID")) {
    & "C:\Program Files\nodejs\npm.cmd" run build *>> "C:\Users\quyi\Documents\AI创作辅助平台\logs\startup-build.log"
  }
  & "C:\Program Files\nodejs\node.exe" "C:\Users\quyi\Documents\AI创作辅助平台\scripts\site-service.cjs" run *>> "C:\Users\quyi\Documents\AI创作辅助平台\logs\site-service.log"
} catch {
  "[2026-08-12T08:21:03.5387248+08:00] $($_.Exception.Message)" | Add-Content -LiteralPath "C:\Users\quyi\Documents\AI创作辅助平台\logs\startup-error.log"
  throw
}
