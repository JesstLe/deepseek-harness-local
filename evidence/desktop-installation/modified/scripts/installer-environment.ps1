param([ValidateSet('capture','owned','restored')][string]$Action='capture',[string]$InstallDir='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$e=Join-Path $root 'evidence/desktop-installation'
$guid='fef98446-cfc3-5773-96cc-aa410c507d30'
$relative=@("Software\$guid","Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid","Software\Classes\AppUserModelId\com.naumi.desktop")
function Registry-State {
 $result=@()
 foreach($hive in @([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryHive]::LocalMachine)){
  foreach($view in @([Microsoft.Win32.RegistryView]::Registry64,[Microsoft.Win32.RegistryView]::Registry32)){
   $base=[Microsoft.Win32.RegistryKey]::OpenBaseKey($hive,$view)
   try{foreach($p in $relative){$key=$base.OpenSubKey($p);try{if($null -ne $key){$result+=@{hive="$hive";view="$view";path=$p;location=$key.GetValue('InstallLocation');version=$key.GetValue('DisplayVersion');uninstall=$key.GetValue('UninstallString')}}}finally{if($null -ne $key){$key.Dispose()}}}}finally{$base.Dispose()}
  }
 }
 return @($result)
}
function Preserved-State {
 $locations=@([Environment]::GetFolderPath('Desktop'),[Environment]::GetFolderPath('CommonDesktopDirectory'),[Environment]::GetFolderPath('Programs'),[Environment]::GetFolderPath('CommonPrograms'))
 $links=@();$standard=@()
 foreach($p in $locations){$standard+=Join-Path $p 'Naumi.lnk';$links+=@(Get-ChildItem -LiteralPath $p -Filter '*Naumi*.lnk' -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.Name -ne 'Naumi.lnk'} | Sort-Object FullName | ForEach-Object {@{path=$_.FullName;hash=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}})}
 $data=Join-Path $env:APPDATA 'Naumi';$metadata=@();if(Test-Path -LiteralPath $data){$metadata=@(Get-ChildItem -LiteralPath $data -File -Recurse -Force -ErrorAction Stop | Sort-Object FullName | ForEach-Object {@{path=[IO.Path]::GetRelativePath($data,$_.FullName);size=$_.Length;written=$_.LastWriteTimeUtc.Ticks}})}
 return @{shortcuts=@($links);standard=@($standard);realUserData=$data;realUserMetadata=@($metadata)}
}
$registry=@(Registry-State)
if($Action -eq 'capture'){
 if($registry.Count){throw 'EXISTING_PRODUCT_REGISTRY_PRESERVED'}
 $state=Preserved-State
 foreach($p in $state.standard){if(Test-Path -LiteralPath $p){throw 'EXISTING_PRODUCT_SHORTCUT_PRESERVED'}}
 $default=Join-Path $env:LOCALAPPDATA 'Programs/Naumi';if(Test-Path -LiteralPath $default){throw 'EXISTING_DEFAULT_INSTALL_PRESERVED'}
 if(@(Get-Process -Name Naumi -ErrorAction SilentlyContinue).Count){throw 'DESKTOP_PROCESS_RUNNING'}
 $pinned=Join-Path $env:APPDATA 'Microsoft/Internet Explorer/Quick Launch/User Pinned/TaskBar'
 if(Test-Path -LiteralPath $pinned){$shell=New-Object -ComObject Shell.Application;$folder=$shell.Namespace($pinned);if($null -ne $folder){foreach($item in $folder.Items()){if($item.Name -match 'Naumi' -or $item.ExtendedProperty('System.AppUserModel.ID') -eq 'com.naumi.desktop'){throw 'EXISTING_PINNED_PRODUCT_PRESERVED'}}}}

 @{version=1;guid=$guid;registry=$registry;preserved=$state;defaultInstall=$default}|ConvertTo-Json -Depth 10|Set-Content -LiteralPath (Join-Path $e 'INSTALL_ENVIRONMENT.json') -Encoding utf8
 Write-Output 'INSTALL_ENVIRONMENT registry=absent standard_shortcuts=absent existing_custom_shortcuts=protected real_user_data=protected'
}elseif($Action -eq 'owned'){
 $full=[IO.Path]::GetFullPath($InstallDir);$allowed=Join-Path $root '.dsh';if(!$full.StartsWith($allowed+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'TEST_INSTALL_TARGET_OUTSIDE_WORKSPACE'}
 if(!$registry.Count){throw 'PRODUCT_REGISTRY_MISSING'}
 $locations=@($registry | Where-Object {$_.location} | ForEach-Object {[IO.Path]::GetFullPath($_.location)})
 if(!$locations.Count -or @($locations|Where-Object {![string]::Equals($_,$full,[StringComparison]::OrdinalIgnoreCase)}).Count){throw 'FOREIGN_INSTALL_REGISTRY_PRESERVED'}
 $versions=@($registry|Where-Object {$_.version}|ForEach-Object {$_.version}|Select-Object -Unique)
 if($versions.Count -ne 1){throw 'INSTALL_VERSION_UNKNOWN'}
 Write-Output ('INSTALL_REGISTRY owned=1 version='+$versions[0])
}else{
 if($registry.Count){throw 'PRODUCT_REGISTRY_REMAINS'}
 $before=Get-Content -LiteralPath (Join-Path $e 'INSTALL_ENVIRONMENT.json') -Raw|ConvertFrom-Json -AsHashtable
 $now=Preserved-State
 foreach($p in $before.preserved.standard){if(Test-Path -LiteralPath $p){throw 'TEST_SHORTCUT_REMAINS'}}
 if(Test-Path -LiteralPath $before.defaultInstall){throw 'UNEXPECTED_DEFAULT_INSTALL'}
 $old=@($before.preserved.shortcuts|ForEach-Object {[ordered]@{path=$_.path;hash=$_.hash}})|ConvertTo-Json -Depth 8 -Compress;$new=@($now.shortcuts|ForEach-Object {[ordered]@{path=$_.path;hash=$_.hash}})|ConvertTo-Json -Depth 8 -Compress;if($old -ne $new){throw 'EXISTING_SHORTCUTS_CHANGED'}
 $old=@($before.preserved.realUserMetadata|ForEach-Object {[ordered]@{path=$_.path;size=$_.size;written=$_.written}})|ConvertTo-Json -Depth 8 -Compress;$new=@($now.realUserMetadata|ForEach-Object {[ordered]@{path=$_.path;size=$_.size;written=$_.written}})|ConvertTo-Json -Depth 8 -Compress;if($old -ne $new){throw 'REAL_USER_DATA_METADATA_CHANGED'}
 Write-Output 'INSTALL_RESTORED registry=absent test_shortcuts=removed existing_shortcuts=unchanged real_user_data=unchanged'
}
