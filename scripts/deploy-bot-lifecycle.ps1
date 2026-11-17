param([string]$RuntimeRoot='E:\Workspace\deepseek-harness-local')
$ErrorActionPreference='Stop'
$sourceRoot=Split-Path -Parent $PSScriptRoot
$runtime=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$target=Join-Path $runtime '.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/bots.js'
$resolved=(Resolve-Path -LiteralPath $target).Path
if(!$resolved.StartsWith($runtime+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'TARGET_ESCAPE'}
$evidence=Join-Path $sourceRoot 'evidence/bot-lifecycle'
$manifest=Get-Content -Raw -LiteralPath (Join-Path $evidence 'hashes.json') | ConvertFrom-Json
$modified=Join-Path $sourceRoot 'plugins/naumi-enterprise/bots.js'
if((Get-FileHash -LiteralPath $modified).Hash.ToLowerInvariant() -ne $manifest.modifiedSHA256){throw 'SOURCE_HASH_MISMATCH'}
$current=(Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant()
if($current -ne $manifest.originalSHA256 -and $current -ne $manifest.modifiedSHA256){throw 'RUNTIME_HAS_OTHER_CHANGES'}
& node (Join-Path $PSScriptRoot 'check-bot-runtime.mjs') $runtime
if($LASTEXITCODE -ne 0){throw 'RUNTIME_NOT_IDLE_OR_UNVERIFIED'}
if($current -ne $manifest.modifiedSHA256){
  Copy-Item -LiteralPath $target -Destination (Join-Path $evidence 'original/runtime-bots.js')
  & (Join-Path $runtime 'Stop-DeepSeek.ps1')
  Copy-Item -LiteralPath $modified -Destination $target
  & (Join-Path $runtime 'Start-DeepSeek.ps1')
}
& node (Join-Path $PSScriptRoot 'check-bot-runtime.mjs') $runtime '2'
if($LASTEXITCODE -ne 0){throw 'RUNTIME_POSTCHECK_FAILED'}
if((Get-FileHash -LiteralPath $target).Hash.ToLowerInvariant() -ne $manifest.modifiedSHA256){throw 'DEPLOY_HASH_MISMATCH'}
Write-Output 'DEPLOY module=bots.js contract=2 hash=PASS other_modules=UNCHANGED'
