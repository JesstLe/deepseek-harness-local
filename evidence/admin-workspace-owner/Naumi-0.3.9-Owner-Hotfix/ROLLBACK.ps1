param([Parameter(Mandatory=$true)][string]$InstallRoot)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath($InstallRoot)
$node=Join-Path $root 'resources/backend/node.exe'
if(!(Test-Path -LiteralPath $node)){throw 'HOTFIX_BUNDLED_NODE_MISSING'}
& $node (Join-Path $PSScriptRoot 'admin-workspace-hotfix.cjs') 'rollback' $root
if($LASTEXITCODE -ne 0){throw 'HOTFIX_FAILED'}
