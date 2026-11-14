param([switch]$Open)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$lockKey = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($root.ToLowerInvariant())))
$startupMutex = [Threading.Mutex]::new($false, "Local\NaumiHarness-$lockKey")
$ownsMutex = $false
try {
try { $ownsMutex = $startupMutex.WaitOne(120000) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
if (!$ownsMutex) { throw 'Another local Harness start operation is still active.' }
$config = Get-Content -Raw (Join-Path $root 'config/local.json') | ConvertFrom-Json
$entry = Join-Path $root 'node_modules/@deepseek-ai/dsh/lib/bin.js'
$pidFile = Join-Path $root 'runtime/server.pid'
$url = "http://$($config.host):$($config.port)"
function Get-LaunchUrl {
    foreach ($name in @('server.out.log','server.err.log')) {
        $log = Join-Path $root "logs/$name"
        if (Test-Path $log) {
            $content = Get-Content -Raw $log
            if (!$content) { continue }
            $urls = [regex]::Matches($content, 'http://127\.0\.0\.1:\d+/?\?token=[A-Za-z0-9_~.%-]+')
            if ($urls.Count) { return $urls[$urls.Count - 1].Value }
        }
    }
    return $url
}
if (Test-Path $pidFile) {
    $serverId = [int](Get-Content $pidFile)
    $existing = Get-CimInstance Win32_Process -Filter "ProcessId=$serverId"
    if ($existing -and $existing.CommandLine.Contains($entry)) {
        Write-Output "ALREADY_RUNNING PID=$serverId URL=$url"
        if ($Open -or $config.openBrowser) { Start-Process (Get-LaunchUrl) }
        exit 0
    }
}
if (Get-NetTCPConnection -State Listen -LocalPort $config.port -ErrorAction SilentlyContinue) {
    throw "Port $($config.port) is occupied by another process."
}
if (!(Test-Path $entry)) { throw 'Install dependencies with npm ci first.' }
New-Item -ItemType Directory -Force (Join-Path $root 'logs'),(Join-Path $root 'runtime') | Out-Null
$env:DSH_HOME = $config.home
$env:DSH_TELEMETRY_MODE = $config.telemetryMode
$node = (Get-Command node.exe).Source
$server = Start-Process -FilePath $node -ArgumentList @(('"' + $entry + '"'),'web','--host',$config.host,'--port',$config.port,'--no-open') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'logs/server.out.log') -RedirectStandardError (Join-Path $root 'logs/server.err.log') -PassThru
$server.Id | Set-Content $pidFile
for ($i=0; $i -lt 90; $i++) {
    if ($server.HasExited) { throw "Server exited $($server.ExitCode). See logs/server.err.log." }
    try {
        $response = Invoke-WebRequest (Get-LaunchUrl) -TimeoutSec 2 -SessionVariable bootSession
        if ($response.StatusCode -eq 200 -and $response.Content -match 'DeepSeek|deepseek|<div id="root"') {
            Write-Output "RUNNING PID=$($server.Id) URL=$url HTTP=200"
            $launchUrl = Get-LaunchUrl
            "[InternetShortcut]`r`nURL=$launchUrl" | Set-Content -Encoding utf8 (Join-Path $root 'runtime/Open DeepSeek Harness.url')
            if ($Open -or $config.openBrowser) { Start-Process $launchUrl }
            exit 0
        }
    } catch { $lastFailure = $_.Exception.Message }
    Start-Sleep -Seconds 1
}
throw "Startup timeout: $lastFailure. See logs. PID=$($server.Id)"
} finally {
    if ($ownsMutex) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
