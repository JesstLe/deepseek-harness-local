param([switch]$Open)
& (Join-Path $PSScriptRoot 'Start-DeepSeek.ps1') -Open:$Open
exit $LASTEXITCODE
