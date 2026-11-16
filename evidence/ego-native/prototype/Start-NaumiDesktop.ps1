param([switch]$Build)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
  & (Join-Path $root 'Start-Naumi.ps1')
  node scripts/ego-browser.mjs status
  if($LASTEXITCODE){throw 'EGO_RUNTIME_NOT_READY'}
  $app=Join-Path $root 'runtime/naumi-desktop/Naumi.Desktop.exe'
  if($Build -or !(Test-Path -LiteralPath $app)){
    dotnet publish desktop/Naumi.Desktop/Naumi.Desktop.csproj -c Release -r win-x64 --self-contained true -o runtime/naumi-desktop -v minimal
    if($LASTEXITCODE){throw 'NATIVE_DESKTOP_BUILD_FAILED'}
  }
  # This is the product's interactive UI, not a background helper.
  $process=Start-Process -FilePath $app -ArgumentList @($root) -WindowStyle Normal -PassThru
  Write-Output "NAUMI_NATIVE_DESKTOP PID=$($process.Id)"
}finally{Pop-Location}
