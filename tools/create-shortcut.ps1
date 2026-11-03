# Creates (or refreshes) the desktop shortcut with the tomato icon.
# Windows PowerShell 5.1 compatible.
param(
  [string]$Name = '番茄钟',
  [switch]$StartMini
)

$ErrorActionPreference = 'Stop'

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $root 'launch.vbs'
$icon = Join-Path $root 'app\assets\tomato.ico'
$start = Join-Path $root 'start.cmd'

if (-not (Test-Path $launcher)) { throw "missing launcher: $launcher" }
if (-not (Test-Path $start)) { throw "missing start.cmd: $start" }
if (-not (Test-Path $icon)) { throw "missing icon: $icon (run tools\make-icon.ps1)" }

$desktop = [Environment]::GetFolderPath('Desktop')
$link = Join-Path $desktop ($Name + '.lnk')

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($link)
$shortcut.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
$arguments = '"' + $launcher + '"'
if ($StartMini) { $arguments = $arguments + ' --mini' }
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $root
$shortcut.IconLocation = $icon + ',0'
$shortcut.Description = '番茄钟 - 专注与休息倒计时（置顶小浮窗）'
$shortcut.WindowStyle = 1
$shortcut.Save()

Write-Output ("shortcut: " + $link)
Write-Output ("target  : " + $shortcut.TargetPath + " " + $shortcut.Arguments)
Write-Output ("icon    : " + $shortcut.IconLocation)
