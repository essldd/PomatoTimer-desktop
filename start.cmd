@echo off
setlocal
cd /d "%~dp0"

REM Some hosts (for example DeepSeek Harness terminals) export
REM ELECTRON_RUN_AS_NODE=1, which would make Electron behave like plain Node
REM and never open a window.
set ELECTRON_RUN_AS_NODE=

REM 1) Normal checkout: Electron installed by `npm install`
if exist "node_modules\electron\dist\electron.exe" goto fromNode

REM 2) Offline bundle: a copied Electron runtime in runtime\electron
if exist "runtime\electron\Pomodoro.exe" goto fromBundled

goto missing

:fromNode
start "" "node_modules\electron\dist\electron.exe" . %*
exit /b 0

:fromBundled
if not exist "runtime\electron\resources\app\package.json" (
  if exist "runtime\electron\resources\app" rmdir "runtime\electron\resources\app" >nul 2>&1
  mklink /J "runtime\electron\resources\app" "%~dp0app" >nul 2>&1
)
if not exist "runtime\electron\resources\app\package.json" goto linkfail
start "" "runtime\electron\Pomodoro.exe" %*
exit /b 0

:missing
echo [pomato] Electron runtime not found.
echo [pomato] Run:  npm install    then:  npm start
echo [pomato] (The first install downloads Electron, about 100 MB.)
pause
exit /b 1

:linkfail
echo [pomato] Could not link runtime\electron\resources\app to app\
echo [pomato] Prefer the standard install:  npm install  ^&^&  npm start
pause
exit /b 1
