param([string]$RuntimeRoot='E:\Workspace\naumi-desktop',[string]$ConfigPath='')
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $RuntimeRoot).Path
if(!$ConfigPath){$ConfigPath=Join-Path $root '.dsh/model-gateway/config.json'}
$config=Get-Content -Raw -LiteralPath $ConfigPath|ConvertFrom-Json
$existing=Get-NetTCPConnection -LocalPort $config.port -State Listen -ErrorAction SilentlyContinue
if($existing){$h=Invoke-RestMethod -Uri ($config.gateway+'/health') -TimeoutSec 5;if($h.product -ne 'naumi-model-gateway'){throw 'MODEL_PORT_CONFLICT'};Write-Output "GATEWAY ready=$($h.ready) routes=$($h.routes) existing=1";exit 0}
$node=(Get-Command node -ErrorAction Stop).Source
$log=Join-Path $root 'logs';New-Item -ItemType Directory -Path $log -Force|Out-Null
$previous=$env:NAUMI_MODEL_GATEWAY_CONFIG
try{
 $env:NAUMI_MODEL_GATEWAY_CONFIG=(Resolve-Path -LiteralPath $ConfigPath).Path
 $p=Start-Process -FilePath $node -ArgumentList @('services/model-gateway/main.mjs') -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $log 'model-gateway.out.log') -RedirectStandardError (Join-Path $log 'model-gateway.err.log') -PassThru
 for($i=0;$i -lt 40;$i++){Start-Sleep -Milliseconds 250;if($p.HasExited){throw 'MODEL_GATEWAY_START_FAILED'};try{$h=Invoke-RestMethod -Uri ($config.gateway+'/health') -TimeoutSec 2;if($h.product -eq 'naumi-model-gateway' -and $h.ready){Write-Output "GATEWAY ready=True routes=$($h.routes) pid=$($p.Id)";exit 0}}catch{}}
 throw 'MODEL_GATEWAY_HEALTH_TIMEOUT'
}finally{if($null -eq $previous){Remove-Item Env:\NAUMI_MODEL_GATEWAY_CONFIG -ErrorAction SilentlyContinue}else{$env:NAUMI_MODEL_GATEWAY_CONFIG=$previous}}
