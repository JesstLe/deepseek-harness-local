import fs from 'node:fs';import path from'node:path';import{createRequire}from'node:module';import{execFileSync,spawnSync}from'node:child_process';
const root=process.cwd(),dir=path.join(root,'runtime/path-probe');fs.mkdirSync(dir,{recursive:true});const r=createRequire(path.join(root,'desktop/package.json')),{getMakeNsisPath}=r('app-builder-lib/out/toolsets/windows.js'),tool=await getMakeNsisPath(),q=s=>s.replaceAll('/','\\');
const code=`Unicode true
!include FileFunc.nsh
Name "Naumi Path Probe"
OutFile "${q(path.join(dir,'probe.exe'))}"
RequestExecutionLevel user
SilentInstall silent
Function .onInit
 StrCpy $INSTDIR "E:\\Workspace\\Naumi Test\\Naumi"
 GetFullPathName $INSTDIR "$INSTDIR"
 FileOpen $9 "${q(path.join(dir,'result.txt'))}" w
 FileWrite $9 "alias=$INSTDIR$\\r$\\n"
 \${GetFileName} "$INSTDIR" $0
 FileWrite $9 "after_name=$INSTDIR name=$0$\\r$\\n"
 StrCpy $8 "E:\\Workspace\\Naumi Test\\Naumi"
 GetFullPathName $INSTDIR "$8"
 FileWrite $9 "different=$INSTDIR$\\r$\\n"
 FileClose $9
FunctionEnd
Section
SectionEnd
`;
fs.writeFileSync(path.join(dir,'probe.nsi'),code);execFileSync(tool.path,['/INPUTCHARSET','UTF8','/V2',path.join(dir,'probe.nsi')],{env:{...process.env,...tool.env}});const run=spawnSync(path.join(dir,'probe.exe'),[],{windowsHide:true,encoding:'utf8'});console.log('NATIVE_PROBE exit='+run.status);console.log(fs.readFileSync(path.join(dir,'result.txt'),'utf8'));
