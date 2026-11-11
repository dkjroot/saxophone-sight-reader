@echo off
setlocal
cd /d "%~dp0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" "launch.py" %*
) else (
  where py >nul 2>&1
  if not errorlevel 1 (
    py -3 "launch.py" %*
  ) else (
    python "launch.py" %*
  )
)
if errorlevel 1 (
  echo.
  echo Startup failed. Python 3.10 or newer is required. See README.md for setup.
  pause
  exit /b 1
)
