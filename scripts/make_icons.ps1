#Requires -Version 5.1
<#
.SYNOPSIS
  Generates procedural Dustline PWA icons (no external dependencies).
.DESCRIPTION
  Draws the canvas-style Dustline mark (gold ring + signal diamond on a
  dark field) with System.Drawing and writes 192px, 512px and a padded
  512px maskable icon into assets/. Re-run after any brand change:
      powershell -ExecutionPolicy Bypass -File scripts/make_icons.ps1
#>
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$outDir = Join-Path $root 'assets'

function New-DustlineIcon {
  param([int]$Size, [bool]$Maskable)
  $bmp = New-Object -TypeName System.Drawing.Bitmap -ArgumentList $Size, $Size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  try {
    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 11, 9))
    $g.FillRectangle($bg, 0, 0, $Size, $Size)
    $bg.Dispose()
    [float]$cx = $Size / 2.0
    [float]$cy = $Size / 2.0
    [float]$pad = 0
    if ($Maskable) { $pad = $Size * 0.20 } else { $pad = $Size * 0.10 }
    [float]$r = ($Size / 2.0) - $pad
    $gold = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 224, 178, 92), [Math]::Max(4.0, $Size * 0.018))
    [float]$ax = $cx - $r
    [float]$ay = $cy - $r
    [float]$ad = $r * 2.0
    $arc = New-Object -TypeName System.Drawing.RectangleF -ArgumentList $ax, $ay, $ad, $ad
    $g.DrawArc($gold, $arc, 12, 302)
    $gold.Dispose()
    $dash = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(160, 99, 220, 192), [Math]::Max(3.0, $Size * 0.012))
    $dash.DashPattern = [float[]](0.16, 0.10)
    [float]$r2 = $r * 0.76
    [float]$ax2 = $cx - $r2
    [float]$ay2 = $cy - $r2
    [float]$ad2 = $r2 * 2.0
    $arc2 = New-Object -TypeName System.Drawing.RectangleF -ArgumentList $ax2, $ay2, $ad2, $ad2
    $g.DrawArc($dash, $arc2, -45, 270)
    $dash.Dispose()
    [float]$dd = $r * 0.52
    [float]$dx = $dd * 0.42
    [float]$top = $cy - $dd
    [float]$bot = $cy + $dd
    [float]$midL = $cx - $dx
    [float]$midR = $cx + $dx
    $pts = @(
      (New-Object -TypeName System.Drawing.PointF -ArgumentList $cx, $top),
      (New-Object -TypeName System.Drawing.PointF -ArgumentList $midR, $cy),
      (New-Object -TypeName System.Drawing.PointF -ArgumentList $cx, $bot),
      (New-Object -TypeName System.Drawing.PointF -ArgumentList $midL, $cy)
    )
    $fill = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 224, 178, 92))
    $g.FillPolygon($fill, $pts)
    $fill.Dispose()
    $dot = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 11, 11, 9))
    [float]$dr = $r * 0.07
    [float]$dox = $cx - $dr
    [float]$doy = $cy - $dr
    [float]$dd2 = $dr * 2.0
    $g.FillEllipse($dot, $dox, $doy, $dd2, $dd2)
    $dot.Dispose()
  } finally {
    $g.Dispose()
  }
  return $bmp
}

$targets = @(
  @{ Size = 192; Maskable = $false; Name = 'icon-192.png' },
  @{ Size = 512; Maskable = $false; Name = 'icon-512.png' },
  @{ Size = 512; Maskable = $true; Name = 'icon-maskable-512.png' }
)
foreach ($t in $targets) {
  $icon = New-DustlineIcon -Size $t.Size -Maskable $t.Maskable
  try {
    $path = Join-Path $outDir $t.Name
    $icon.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "wrote $path"
  } finally {
    $icon.Dispose()
  }
}
