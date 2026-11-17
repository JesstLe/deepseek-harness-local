$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$e=Join-Path $root 'evidence/employee-foundation'
$copy=Join-Path $e 'rollback-copy'
New-Item -ItemType Directory -Path $copy -Force | Out-Null
$manifest=Get-Content -Raw -LiteralPath (Join-Path $e 'hashes.json') | ConvertFrom-Json
foreach($m in $manifest){Copy-Item -LiteralPath (Join-Path $root "plugins/naumi-enterprise/$($m.path)") -Destination (Join-Path $copy $m.path)}
$sentinel=Join-Path $copy 'employees.sqlite'
[IO.File]::WriteAllText($sentinel,'rollback-copy employee-data preservation fixture')
$dataHash=(Get-FileHash -LiteralPath $sentinel).Hash
$env:NAUMI_NODE_EXE=(Get-Command node.exe).Source.Replace('\','/')
$bash=Join-Path (Split-Path -Parent (Split-Path -Parent (Get-Command git.exe).Source)) 'bin/bash.exe'
& $bash (Join-Path $e 'ROLLBACK.sh') $copy
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
if((Get-FileHash -LiteralPath $sentinel).Hash -ne $dataHash){throw 'EMPLOYEE_DATA_CHANGED'}
Push-Location $root
try{& node scripts/verify-employee-foundation.mjs rollback;exit $LASTEXITCODE}finally{Pop-Location}
