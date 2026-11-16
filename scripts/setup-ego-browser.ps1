param([string]$SourceApplication)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$lock=Get-Content -LiteralPath (Join-Path $root 'plugins/naumi-enterprise/third-party/ego-lite/runtime-lock.json') -Raw | ConvertFrom-Json
$target=Join-Path $root 'runtime/ego-lite/win32-x64/Application'
if(![Environment]::Is64BitOperatingSystem -or !$IsWindows){throw 'EGO_PLATFORM_NOT_PACKAGED'}
Push-Location $root
try {
  if(!(Test-Path -LiteralPath (Join-Path $target 'ego.exe'))){
    $archive=Join-Path $root "runtime/ego-lite-win32-x64-$($lock.browserVersion).zip"
    if(Test-Path -LiteralPath $archive){
      $expected=(Get-Content -LiteralPath "$archive.sha256" -Raw).Trim()
      if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLower() -ne $expected){throw 'EGO_ARCHIVE_CHECKSUM_MISMATCH'}
      Expand-Archive -LiteralPath $archive -DestinationPath (Join-Path $root 'runtime/ego-lite/win32-x64')
    }else{
      if(!$SourceApplication){$SourceApplication=Join-Path $env:LOCALAPPDATA 'Citro Labs/ego lite/Application'}
      if(!(Test-Path -LiteralPath (Join-Path $SourceApplication 'ego.exe'))){
        $cache=Join-Path $root '.dsh/ego-lite-backup';New-Item -ItemType Directory -Force $cache | Out-Null
        $installer=Join-Path $cache "egolite-$($lock.browserVersion)-setup.exe"
        if(!(Test-Path -LiteralPath $installer)){Invoke-WebRequest $lock.installer.url -OutFile $installer}
        if((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash.ToLower() -ne $lock.installer.sha256){throw 'EGO_INSTALLER_CHECKSUM_MISMATCH'}
        $signature=Get-AuthenticodeSignature -LiteralPath $installer
        if($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CITRO LABS'){throw 'EGO_INSTALLER_SIGNATURE_INVALID'}
        $tag='--tag=appguid={712B23BF-E734-4038-BE42-D5736B6D9570}&browser=4&usagestats=0&appname=ego%20lite&needsadmin=false&ap=-arch_x64-statsdef_0&installdataindex=empty'
        $p=Start-Process -FilePath $installer -ArgumentList @('--install','--silent',$tag) -WindowStyle Hidden -Wait -PassThru
        if($p.ExitCode){throw "EGO_INSTALLER_EXIT_$($p.ExitCode)"}
      }
      New-Item -ItemType Directory -Force $target | Out-Null
      Copy-Item -LiteralPath (Join-Path $SourceApplication 'ego.exe') -Destination $target
      Copy-Item -LiteralPath (Join-Path $SourceApplication $lock.browserVersion) -Destination $target -Recurse
    }
  }
  node scripts/ego-browser.mjs status
  if($LASTEXITCODE){throw 'EGO_RUNTIME_VERIFICATION_FAILED'}
  Write-Output "EGO_RUNTIME_READY version=$($lock.browserVersion) personal_profile_bundled=0"
}finally{Pop-Location}
