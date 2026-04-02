@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

title SurfaceIQ Worker Stop

echo Stopping SurfaceIQ worker...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$repo = [Regex]::Escape((Resolve-Path '.').Path); ^
  $targets = Get-CimInstance Win32_Process ^| Where-Object { ^
    $_.CommandLine -and ^
    $_.CommandLine -match $repo -and ^
    ($_.CommandLine -match 'npm run dev:worker' -or $_.CommandLine -match '@surfaceiq/worker' -or $_.CommandLine -match 'tsx watch src/index.ts') ^
  }; ^
  if (-not $targets) { Write-Host 'No running SurfaceIQ worker process found.'; exit 0 }; ^
  $targets ^| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Write-Host ('Stopped PID ' + $_.ProcessId) };"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo stop-worker finished with exit code %EXIT_CODE%.
) else (
  echo stop-worker finished.
)

echo.
pause
exit /b %EXIT_CODE%
