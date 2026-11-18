// Isolated native NSIS acceptance. Shares production maintenance, progress and
// result functions. The tiny proof client is a fixture, NOT a production boot.
import fs from 'node:fs';import path from 'node:path';import{fileURLToPath}from'node:url';import{createRequire}from'node:module';import{execFileSync,spawn}from'node:child_process';
const root=fileURLToPath(new URL('../..',import.meta.url)),require=createRequire(import.meta.url),{getMakeNsisPath,getNsisPluginsPath}=require('app-builder-lib/out/toolsets/windows.js');
const folder=path.join(root,'runtime/update-friendly-fixture'),out=path.join(root,'evidence/update-friendly');fs.mkdirSync(folder,{recursive:true});fs.mkdirSync(out,{recursive:true});
const tool=await getMakeNsisPath(),plugins=await getNsisPluginsPath(),q=p=>p.replaceAll('/','\\'),include=path.join(root,'desktop/node_modules/app-builder-lib/templates/nsis/include');
const nsi=String.raw`Unicode true
SetCompressor zlib
!addincludedir "${q(include)}"
!addplugindir /x86-unicode "${q(path.join(plugins,'x86-unicode'))}"
!include LogicLib.nsh
!include UAC.nsh
!include StdUtils.nsh
!define VERSION "0.4.1"
!define NAUMI_MAX_INSTALLDIR_CHARS 220
!define isUpdated '1 == 1'
!define INSTALL_REGISTRY_KEY "Software\Naumi-Update-Friendly-Fixture-Only"
!define NAUMI_PRODUCT_ENGINE
Var installMode
Var hasPerMachineInstallation
Var hasPerUserInstallation
Var appExe
!macro GetDParameter OUT
  StrCpy ${'${OUT}'} ""
!macroend
!macro setInstallModePerUser
  StrCpy $installMode "current"
!macroend
!macro setInstallModePerAllUsers
  StrCpy $installMode "all"
!macroend
!include "${q(path.join(root,'desktop/installer/maintenance.nsh'))}"
Name "Naumi update acceptance"
Caption "Naumi · 更新验收"
OutFile "${q(path.join(folder,'Naumi-Update-Fixture.exe'))}"
InstallDir "${q(path.join(folder,'app/Naumi'))}"
RequestExecutionLevel user
!insertmacro NaumiInstallerFunctions
!include "${q(path.join(root,'desktop/installer/update-ui.nsh'))}"
Page custom NaumiInstall NaumiInstallLeave
!define MUI_PAGE_CUSTOMFUNCTION_SHOW NaumiProgressShow
!insertmacro MUI_PAGE_INSTFILES
Page custom NaumiDone NaumiDoneLeave
!insertmacro MUI_LANGUAGE "SimpChinese"
Function .onInit
  StrCpy $installMode "current"
  !insertmacro customInit
FunctionEnd
Function StartApp
  FileOpen $0 "${q(path.join(folder,'launches.txt'))}" a
  FileWrite $0 "launch$\r$\n"
  FileClose $0
  ; The proof client is a console-only fixture, never flash it on the desktop.
  ExecShell "open" "$appExe" '"${q(path.join(folder,'proof-client.cjs'))}"' SW_HIDE
FunctionEnd
Section
  SetDetailsPrint none
  !insertmacro customCheckAppRunning
  Sleep 10000
  SetOutPath "$INSTDIR"
  File /oname=Naumi.exe "${q(path.join(root,'runtime/desktop-backend/node.exe'))}"
  StrCpy $appExe "$INSTDIR\Naumi.exe"
  !insertmacro customInstall
SectionEnd
`;
fs.writeFileSync(path.join(folder,'fixture.nsi'),nsi);
fs.writeFileSync(path.join(folder,'proof-client.cjs'),`const fs=require('node:fs'),p=require('node:path');const dir=__dirname;setTimeout(()=>{if(!fs.existsSync(p.join(dir,'ready.flag')))process.exit(0);const home=p.join(dir,'profile','Naumi');fs.mkdirSync(home,{recursive:true});fs.writeFileSync(p.join(home,'desktop-runtime.json'),JSON.stringify({version:1,pid:process.pid,clientVersion:'0.4.1',executable:process.execPath,readyAt:new Date().toISOString()}));setTimeout(()=>process.exit(0),20000);},3000);`);
const compiled=execFileSync(tool.path,['/INPUTCHARSET','UTF8','/V2',path.join(folder,'fixture.nsi')],{env:{...process.env,...tool.env},encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'NATIVE_COMPILE.log'),compiled);
if(/warning 6000/.test(compiled))throw Error('NSIS_UNRESOLVED_VARIABLE');
if(process.argv.includes('--launch')){
 const ready=process.argv.includes('--ready'),flag=path.join(folder,'ready.flag');if(ready)fs.writeFileSync(flag,'ready');else if(fs.existsSync(flag))fs.unlinkSync(flag);
 fs.writeFileSync(path.join(folder,'launches.txt'),'');
 const env={...process.env,APPDATA:path.join(folder,'profile'),LOCALAPPDATA:path.join(folder,'local')};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(path.join(folder,'Naumi-Update-Fixture.exe'),['/S'],{env,stdio:'ignore',detached:true});child.unref();
 fs.writeFileSync(path.join(out,'NATIVE_RUN.json'),JSON.stringify({pid:child.pid,ready,exe:path.join(folder,'Naumi-Update-Fixture.exe'),scope:'isolated native fixture, no product install/registration'},null,2));
 console.log('UPDATE_NATIVE_LAUNCHED pid='+child.pid+' oldSilentFlag=/S ready='+ready);
}else console.log('UPDATE_NATIVE_COMPILE PASS');
