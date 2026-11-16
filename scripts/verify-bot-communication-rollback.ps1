$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$e=Join-Path $root 'evidence/bot-communication'
$copy=Join-Path $e 'rollback-copy'
New-Item -ItemType Directory -Path $copy -Force | Out-Null
$manifest=Get-Content -Raw -LiteralPath (Join-Path $e 'hashes.json') | ConvertFrom-Json
foreach($item in $manifest){Copy-Item -LiteralPath (Join-Path $root "plugins/naumi-enterprise/$($item.path)") -Destination (Join-Path $copy $item.path)}
$env:NAUMI_NODE_EXE=(Get-Command node.exe).Source.Replace('\','/')
$bash=Join-Path (Split-Path -Parent (Split-Path -Parent (Get-Command git.exe).Source)) 'bin/bash.exe'
& $bash (Join-Path $e 'ROLLBACK.sh') $copy
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
Push-Location $root
try{& node scripts/verify-bot-communication.mjs rollback;exit $LASTEXITCODE}finally{Pop-Location}
