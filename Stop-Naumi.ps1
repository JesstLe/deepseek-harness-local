$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'runtime/server.pid'
if (!(Test-Path $pidFile)) { Write-Output 'NOT_RUNNING'; exit 0 }
$serverId = [int](Get-Content $pidFile)
$server = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
$entry = Join-Path $PSScriptRoot 'node_modules/@deepseek-ai/dsh/lib/bin.js'
if (!$server) { Remove-Item -LiteralPath $pidFile; Write-Output 'NOT_RUNNING'; exit 0 }
if (!$server.CommandLine.Contains($entry)) { throw 'PID identity mismatch; no process stopped.' }
$children = @(Get-CimInstance Win32_Process | Where-Object ParentProcessId -EQ $serverId)
foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
Stop-Process -Id $serverId
Remove-Item -LiteralPath $pidFile
Write-Output "STOPPED PID=$serverId"
