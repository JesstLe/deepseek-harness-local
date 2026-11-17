param([string]$RuntimeRoot='E:\Workspace\naumi-desktop')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$e=Join-Path $root 'evidence/bot-communication'
$target=(Resolve-Path -LiteralPath (Join-Path $RuntimeRoot '.dsh/profiles/web/node_modules/@naumi/dsh-enterprise')).Path
$manifest=Get-Content -Raw -LiteralPath (Join-Path $e 'hashes.json') | ConvertFrom-Json
foreach($item in $manifest){
  $p=Join-Path $target $item.path
  if((Get-FileHash -LiteralPath (Join-Path $root "plugins/naumi-enterprise/$($item.path)")).Hash.ToLowerInvariant() -ne $item.modifiedSHA256){throw 'SOURCE_CHANGED'}
  if($item.originalSHA256){if(!(Test-Path -LiteralPath $p) -or (Get-FileHash -LiteralPath $p).Hash.ToLowerInvariant() -ne $item.originalSHA256){throw "RUNTIME_CHANGED $($item.path)"}}
  elseif(Test-Path -LiteralPath $p){throw "NEW_FILE_ALREADY_EXISTS $($item.path)"}
}
& node (Join-Path $PSScriptRoot 'check-bot-runtime.mjs') $RuntimeRoot '2'
if($LASTEXITCODE -ne 0){throw 'RUNNING_TASKS_OR_UNVERIFIED_RUNTIME'}
& (Join-Path $RuntimeRoot 'Stop-DeepSeek.ps1')
foreach($item in $manifest){Copy-Item -LiteralPath (Join-Path $root "plugins/naumi-enterprise/$($item.path)") -Destination (Join-Path $target $item.path)}
& (Join-Path $RuntimeRoot 'Start-DeepSeek.ps1')
foreach($item in $manifest){if((Get-FileHash -LiteralPath (Join-Path $target $item.path)).Hash.ToLowerInvariant() -ne $item.modifiedSHA256){throw 'DEPLOY_HASH_MISMATCH'}}
Write-Output 'DEPLOY bot_modules=6 hashes=PASS other_source_files=UNCHANGED'
