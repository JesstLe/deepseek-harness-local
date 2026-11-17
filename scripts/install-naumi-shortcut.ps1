param([string]$Root=(Split-Path $PSScriptRoot -Parent),[string]$DesktopPath=[Environment]::GetFolderPath('Desktop'))
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($Root)
$desktop=[IO.Path]::GetFullPath($DesktopPath)
foreach($p in @('Start-NaumiDesktop.ps1','desktop/app/assets/naumi.ico')){if(!(Test-Path -LiteralPath (Join-Path $root $p))){throw 'NAUMI_SHORTCUT_SOURCE_MISSING'}}
if(!(Test-Path -LiteralPath $desktop -PathType Container)){throw 'NAUMI_DESKTOP_MISSING'}
$shell=New-Object -ComObject WScript.Shell
$recognized=@()
foreach($name in @('DeepSeek Harness.lnk','Naumi 企业协作.lnk','Naumi.lnk')){
 $p=Join-Path $desktop $name
 if(!(Test-Path -LiteralPath $p)){continue}
 $link=$shell.CreateShortcut($p)
 $ours=$link.Arguments.Contains('"'+(Join-Path $root 'Start-Naumi.ps1')+'"') -or $link.Arguments.Contains('"'+(Join-Path $root 'Start-NaumiDesktop.ps1')+'"')
 $legacy=$name -eq 'DeepSeek Harness.lnk' -and $link.WorkingDirectory -eq (Join-Path (Split-Path $root -Parent) 'deepseek-harness-local') -and $link.Arguments.Contains('Start-DeepSeek.ps1')
 if($ours -or $legacy){$recognized+=$p}elseif($name -eq 'Naumi.lnk'){throw 'NAUMI_SHORTCUT_ALREADY_OWNED'}
}
$backup=Join-Path $root ('runtime/product-shortcut-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $backup | Out-Null
$hashes=@()
foreach($p in $recognized){Copy-Item -LiteralPath $p -Destination $backup;$hashes+=@{name=(Split-Path $p -Leaf);sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash}}
$target=Join-Path $desktop 'Naumi.lnk'
$fresh=$shell.CreateShortcut($target)
$fresh.TargetPath=(Get-Command pwsh.exe).Source
$fresh.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "'+(Join-Path $root 'Start-NaumiDesktop.ps1')+'"'
$fresh.WorkingDirectory=$root
$fresh.IconLocation=(Join-Path $root 'desktop/app/assets/naumi.ico')+',0'
$fresh.Description='Naumi'
$fresh.Save()
$check=$shell.CreateShortcut($target)
if($check.WorkingDirectory -ne $root -or !$check.Arguments.Contains('Start-NaumiDesktop.ps1') -or !$check.IconLocation.Contains('naumi.ico')){throw 'NAUMI_SHORTCUT_VERIFY_FAILED'}
foreach($p in $recognized){if($p -ne $target){Remove-Item -LiteralPath $p}}
# Restore only a second copy to prove original shortcut bytes are recoverable.
$copy=Join-Path $backup 'rollback-copy';New-Item -ItemType Directory -Path $copy | Out-Null
Copy-Item -LiteralPath $target -Destination $copy
Remove-Item -LiteralPath (Join-Path $copy 'Naumi.lnk')
foreach($r in $hashes){Copy-Item -LiteralPath (Join-Path $backup $r.name) -Destination $copy;if((Get-FileHash -LiteralPath (Join-Path $copy $r.name) -Algorithm SHA256).Hash -ne $r.sha256){throw 'NAUMI_SHORTCUT_ROLLBACK_HASH_FAILED'}}
@{status='PASS';shortcut=$target;originals=$hashes;backup=$backup;rollbackCopy='PASS';modifiedShortcutRetained=$true} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backup 'receipt.json') -Encoding utf8
Write-Output "NAUMI_SHORTCUT canonical=1 legacy_removed=$(@($recognized | Where-Object {$_ -ne $target}).Count) logo=1 rollback_copy=PASS"
