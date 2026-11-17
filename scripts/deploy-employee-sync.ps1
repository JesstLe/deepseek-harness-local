param([string]$RuntimeRoot='E:\Workspace\naumi-desktop',[string]$EvidenceRoot='E:\Workspace\naumi-design-ops-digital-employees\evidence\digital-employees',[string]$PriorManifest='')
$ErrorActionPreference='Stop';$source=Split-Path -Parent $PSScriptRoot;$runtime=(Resolve-Path -LiteralPath $RuntimeRoot).Path
$target=(Resolve-Path -LiteralPath (Join-Path $runtime '.dsh/profiles/web/node_modules/@naumi/dsh-enterprise')).Path
if(!$target.StartsWith($runtime+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'TARGET_ESCAPE'}
$manifest=@(Get-Content -Raw -LiteralPath (Join-Path $EvidenceRoot 'hashes.json')|ConvertFrom-Json|Where-Object repo -eq 'harness')
$prior=@();if($PriorManifest){$prior=@(Get-Content -Raw -LiteralPath $PriorManifest|ConvertFrom-Json)}
$before=@{};Get-ChildItem -LiteralPath $target -File -Recurse | ForEach-Object {$before[$_.FullName]=(Get-FileHash -LiteralPath $_.FullName).Hash}
foreach($m in $manifest){$relative=$m.path.Replace('plugins/naumi-enterprise/','');$file=Join-Path $target $relative;$src=Join-Path $source $m.path
 if((Get-FileHash -LiteralPath $src).Hash.ToLowerInvariant() -ne $m.modifiedSHA256){throw 'SOURCE_CHANGED'}
 if(Test-Path -LiteralPath $file){$actual=(Get-FileHash -LiteralPath $file).Hash.ToLowerInvariant();$old=@($prior|Where-Object key -eq $m.key);if($actual -ne $m.originalSHA256 -and ($old.Count -ne 1 -or $actual -ne $old[0].modifiedSHA256)){throw "RUNTIME_CHANGED $relative"}}elseif($m.originalSHA256){throw "RUNTIME_MISSING $relative"}}
& node (Join-Path $PSScriptRoot 'check-bot-runtime.mjs') $runtime '2';if($LASTEXITCODE -ne 0){throw 'RUNTIME_NOT_IDLE'}
& (Join-Path $runtime 'Stop-DeepSeek.ps1')
foreach($m in $manifest){$relative=$m.path.Replace('plugins/naumi-enterprise/','');Copy-Item -LiteralPath (Join-Path $source $m.path) -Destination (Join-Path $target $relative)}
& (Join-Path $runtime 'Start-DeepSeek.ps1')
$changed=@($manifest|ForEach-Object{(Join-Path $target $_.path.Replace('plugins/naumi-enterprise/',''))});$unrelated=@()
foreach($file in $before.Keys){if($file -notin $changed -and (Get-FileHash -LiteralPath $file).Hash -ne $before[$file]){$unrelated+=$file}}
if($unrelated.Count){throw 'UNRELATED_RUNTIME_CHANGE'}
foreach($m in $manifest){if((Get-FileHash -LiteralPath (Join-Path $target $m.path.Replace('plugins/naumi-enterprise/',''))).Hash.ToLowerInvariant() -ne $m.modifiedSHA256){throw 'RUNTIME_HASH_MISMATCH'}}
@{files=$manifest.Count;hashes='PASS';unrelatedChanges=$unrelated;autoEnrollment=$false;autoUpload=$false}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $EvidenceRoot 'HARNESS_DEPLOYMENT.json')
Write-Output "DEPLOY employee_sync=1 files=$($manifest.Count) hashes=PASS unrelated=0 auto_enrollment=0 auto_upload=0"
