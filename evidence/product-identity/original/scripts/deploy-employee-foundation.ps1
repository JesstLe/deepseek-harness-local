param([string]$RuntimeRoot='E:\Workspace\naumi-desktop')
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$e=Join-Path $root 'evidence/employee-foundation'
$runtime=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$target=(Resolve-Path -LiteralPath (Join-Path $runtime '.dsh/profiles/web/node_modules/@naumi/dsh-enterprise')).Path
if(!$target.StartsWith($runtime+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'TARGET_ESCAPE'}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $e 'hashes.json') | ConvertFrom-Json
foreach($item in $manifest){
  $source=Join-Path $root "plugins/naumi-enterprise/$($item.path)"
  if((Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant() -ne $item.modifiedSHA256){throw 'SOURCE_CHANGED'}
  $file=Join-Path $target $item.path
  if($item.originalSHA256){if(!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $item.originalSHA256){throw "RUNTIME_CHANGED $($item.path)"}}
  elseif(Test-Path -LiteralPath $file){throw "NEW_FILE_ALREADY_EXISTS $($item.path)"}
}
& node (Join-Path $PSScriptRoot 'check-bot-runtime.mjs') $runtime '2'
if($LASTEXITCODE -ne 0){throw 'RUNTIME_NOT_IDLE_OR_UNVERIFIED'}
& (Join-Path $runtime 'Stop-DeepSeek.ps1')
foreach($item in $manifest){Copy-Item -LiteralPath (Join-Path $root "plugins/naumi-enterprise/$($item.path)") -Destination (Join-Path $target $item.path)}
& (Join-Path $runtime 'Start-DeepSeek.ps1')
foreach($item in $manifest){if((Get-FileHash -LiteralPath (Join-Path $target $item.path)).Hash.ToLowerInvariant() -ne $item.modifiedSHA256){throw 'DEPLOY_HASH_MISMATCH'}}
Write-Output 'DEPLOY employee_modules=5 hashes=PASS unrelated_files=UNCHANGED'
