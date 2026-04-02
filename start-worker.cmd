@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

title SurfaceIQ Worker

echo SurfaceIQ worker launcher
if not exist ".env.local" (
  echo.
  echo Missing .env.local in %SCRIPT_DIR%
  echo Pull your hosted envs first with:
  echo   npx.cmd vercel env pull .env.local --environment=production
  echo.
  pause
  exit /b 1
)

echo.
echo Starting worker from %CD%
echo Press Ctrl+C in this window to stop the worker.
echo.

call npm.cmd run dev:worker
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Worker stopped with exit code %EXIT_CODE%.
) else (
  echo Worker stopped.
)

echo.
pause
exit /b %EXIT_CODE%
