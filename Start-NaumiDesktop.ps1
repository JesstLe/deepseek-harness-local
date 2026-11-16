param([switch]$Development)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$env:NAUMI_ROOT = $root
$env:NAUMI_NODE = (Get-Command node.exe).Source
$env:ELECTRON_RUN_AS_NODE = $null
$executable = Join-Path $root 'runtime/naumi-desktop-release/win-unpacked/Naumi.exe'
if (!$Development -and (Test-Path -LiteralPath $executable)) {
    $process = Start-Process -FilePath $executable -WorkingDirectory $root -WindowStyle Hidden -PassThru
} else {
    $electron = Join-Path $root 'desktop/node_modules/electron/dist/electron.exe'
    if (!(Test-Path -LiteralPath $electron)) { throw 'Build the desktop runtime first: npm --prefix desktop ci; node desktop/node_modules/electron/install.js' }
    $process = Start-Process -FilePath $electron -ArgumentList @(('"' + (Join-Path $root 'desktop') + '"')) -WorkingDirectory $root -WindowStyle Hidden -PassThru
}
Write-Output "NAUMI_DESKTOP_STARTED PID=$($process.Id)"
