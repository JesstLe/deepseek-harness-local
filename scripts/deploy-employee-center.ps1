param([string]$RuntimeRoot='E:\Workspace\naumi-desktop')
$ErrorActionPreference='Stop';$root=Split-Path -Parent $PSScriptRoot;$e=Join-Path $root 'evidence/employee-center';$runtime=(Resolve-Path -LiteralPath $RuntimeRoot).Path;$target=(Resolve-Path -LiteralPath (Join-Path $runtime '.dsh/profiles/web/node_modules/@naumi/dsh-enterprise')).Path
if(!$target.StartsWith($runtime+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'TARGET_ESCAPE'}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $e 'hashes.json')|ConvertFrom-Json
foreach($m in $manifest){$source=Join-Path $root "plugins/naumi-enterprise/$($m.path)";$file=Join-Path $target $m.path;if((Get-FileHash -LiteralPath $source).Hash.ToLowerInvariant() -ne $m.modifiedSHA256){throw 'SOURCE_CHANGED'};if($m.originalSHA256){if(!(Test-Path -LiteralPath $file) -or (Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant() -ne $m.originalSHA256){throw "RUNTIME_CHANGED $($m.path)"}}elseif(Test-Path -LiteralPath $file){throw 'NEW_FILE_ALREADY_EXISTS'}}
& node (Join-Path $PSScriptRoot 'check-bot-runtime.mjs') $runtime '2';if($LASTEXITCODE -ne 0){throw 'RUNTIME_NOT_IDLE_OR_UNVERIFIED'}
& (Join-Path $runtime 'Stop-Naumi.ps1')
foreach($m in $manifest){Copy-Item -LiteralPath (Join-Path $root "plugins/naumi-enterprise/$($m.path)") -Destination (Join-Path $target $m.path)}
& (Join-Path $runtime 'Start-Naumi.ps1')
foreach($m in $manifest){if((Get-FileHash -LiteralPath (Join-Path $target $m.path)).Hash.ToLowerInvariant() -ne $m.modifiedSHA256){throw 'DEPLOY_HASH_MISMATCH'}}
Write-Output 'DEPLOY employee_center=1 work_api=1 files=10 hashes=PASS'
