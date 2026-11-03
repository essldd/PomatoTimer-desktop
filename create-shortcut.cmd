@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\create-shortcut.ps1" %*
echo.
echo Desktop shortcut created (tomato icon). Press any key to close.
pause >nul
