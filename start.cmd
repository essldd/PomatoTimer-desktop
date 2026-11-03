@echo off
setlocal
cd /d "%~dp0"

REM Some hosts (for example DeepSeek Harness terminals) export
REM ELECTRON_RUN_AS_NODE=1, which would make Electron behave like plain Node
REM and never open a window.
set ELECTRON_RUN_AS_NODE=

REM 1) Normal checkout: Electron installed by `npm install`
if exist "node_modules\electron\dist\electron.exe" goto fromNode

REM 2) Offline bundle: a plain Electron runtime in runtime\electron.
REM    The project folder is passed as the app path, so the single root
REM    package.json (main: app/main.js) is all Electron needs.
if exist "runtime\electron\Pomodoro.exe" goto fromBundled

goto missing

:fromNode
start "" "node_modules\electron\dist\electron.exe" . %*
exit /b 0

:fromBundled
start "" "runtime\electron\Pomodoro.exe" "%~dp0." %*
exit /b 0

:missing
echo [pomato] Electron runtime not found.
echo [pomato] Run:  npm install    then:  npm start
echo [pomato] (The first install downloads Electron, about 100 MB.)
pause
exit /b 1
