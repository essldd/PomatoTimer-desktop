# Composites raw CDP captures onto a light background and exports docs/ images.
# Usage: powershell -File tools\make-readme-images.ps1 -Raw <folder with
#        panel.png / running.png / break.png / mini.png>
# Windows PowerShell 5.1 compatible.
param([string]$Raw = '')

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if ([string]::IsNullOrWhiteSpace($Raw)) { throw 'Pass -Raw <folder containing the raw captures>' }
$raw = $Raw
$docs = Join-Path $PSScriptRoot '..\docs'
if (-not (Test-Path $docs)) { [void](New-Item -ItemType Directory -Force $docs) }

function Compose([string]$source, [string]$target, [int]$pad, [string]$bg) {
  $img = [System.Drawing.Bitmap]::FromFile($source)
  try {
    $w = $img.Width + 2 * $pad
    $h = $img.Height + 2 * $pad
    $canvas = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($canvas)
    try {
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
      $g.Clear([System.Drawing.ColorTranslator]::FromHtml($bg))
      $g.DrawImage($img, $pad, $pad, $img.Width, $img.Height)
    } finally { $g.Dispose() }
    $canvas.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
  } finally { $img.Dispose() }
  Write-Output ("{0} ({1} bytes)" -f (Split-Path -Leaf $target), (Get-Item $target).Length)
}

Compose (Join-Path $raw 'panel.png')   (Join-Path $docs 'panel.png')   26 '#e9edf2'
Compose (Join-Path $raw 'running.png') (Join-Path $docs 'running.png') 26 '#e9edf2'
Compose (Join-Path $raw 'break.png')   (Join-Path $docs 'break.png')   26 '#e9edf2'
Compose (Join-Path $raw 'mini.png')    (Join-Path $docs 'mini.png')    18 '#e9edf2'

# 256 px application icon from the .ico for the README header.
$icoPath = Join-Path $PSScriptRoot '..\app\assets\tomato.ico'
$icon = New-Object System.Drawing.Icon($icoPath, 256, 256)
$bmp = $icon.ToBitmap()
$bmp.Save((Join-Path $docs 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$icon.Dispose()
Write-Output ("icon.png ({0} bytes)" -f (Get-Item (Join-Path $docs 'icon.png')).Length)
