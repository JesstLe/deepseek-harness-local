// Native NSIS regression: invoke the production page-leave callback with real EDIT
// controls. No product registration, shortcuts, payload installation or user profiles.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createRequire}from'node:module';import{fileURLToPath}from'node:url';import{execFileSync,spawnSync}from'node:child_process';
const root=path.resolve(process.argv.find(x=>x.startsWith('--root='))?.slice(7)??fileURLToPath(new URL('../..',import.meta.url))),r=createRequire(import.meta.url),{getMakeNsisPath}=r('app-builder-lib/out/toolsets/windows.js'),tool=await getMakeNsisPath(),baseline=process.argv.includes('--baseline'),dir=path.join(root,'runtime/installer-path-regression'),q=s=>s.replaceAll('/','\\').replaceAll('$','$$');
fs.mkdirSync(dir,{recursive:true});const exe=path.join(dir,'regression.exe'),receipt=path.join(dir,'receipt.txt'),parent=path.win32.join(path.parse(root).root,'np35-uncreated');assert(!fs.existsSync(parent));
const cases=[path.join(parent,'Naumi'),path.join(parent,'中文 空格','Naumi'),path.join(parent,'chosen-parent'),path.join(parent,'Naumi')+'\\'];
const body=cases.map((input,i)=>`System::Call 'user32::CreateWindowExW(i 0,w "EDIT",w "${q(input)}",i 0,i 0,i 0,i 1,i 1,p 0,p 0,p 0,p 0)p.r0'
StrCpy $NaumiPathField $0
StrCpy $INSTDIR "${q(path.join(dir,'previous-valid','Naumi'))}"
Call NaumiInstallLeave
FileWriteUTF16LE $9 "${i}=$INSTDIR$\\r$\\n"
System::Call 'user32::DestroyWindow(p $NaumiPathField)'
`).join('\n');
const extra=baseline?'':[['relative','Naumi'],['drive-relative','E:Naumi'],['unc','\\\\server\\share\\Naumi'],['empty',''],['too-long','E:\\'+('x'.repeat(70))+'\\Naumi']].map(([label,input])=>`Push "${q(input)}"
Call NaumiCanonicalPath
Pop $0
FileWriteUTF16LE $9 "invalid-${label}=$0$\\r$\\n"`).join('\n');
const source=`Unicode true
!define VERSION "fixture"
!define NAUMI_WIZARD_DIR "${q(path.join(root,'desktop/installer'))}"
!include "\${NAUMI_WIZARD_DIR}\\presentation.nsh"
Name "Naumi Installer Path Regression"
OutFile "${q(exe)}"
RequestExecutionLevel user
SilentInstall silent
!insertmacro NaumiInstallerFunctions
Page custom NaumiInstall NaumiInstallLeave
!insertmacro MUI_PAGE_INSTFILES
Page custom NaumiDone NaumiDoneLeave
!insertmacro MUI_LANGUAGE "SimpChinese"
Function StartApp
FunctionEnd
Function .onInit
FileOpen $9 "${q(receipt)}" w
${body}
${extra}
FileClose $9
SetErrorLevel 0
Quit
FunctionEnd
Section
SectionEnd
`;
fs.writeFileSync(path.join(dir,'regression.nsi'),source);execFileSync(tool.path,['/INPUTCHARSET','UTF8','/V2',path.join(dir,'regression.nsi')],{env:{...process.env,...tool.env}});
const run=spawnSync(exe,[],{windowsHide:true,encoding:'utf8',timeout:15000});assert.equal(run.status,0,run.error?.message);
const lines=fs.readFileSync(receipt,'utf16le').trim().split(/\r?\n/),values=Object.fromEntries(lines.map(line=>{const i=line.indexOf('=');return[line.slice(0,i),line.slice(i+1)];}));assert(!fs.existsSync(parent),'VALIDATION_CREATED_TARGET');
if(baseline){assert.equal(values[0],'\\Naumi');console.log('BASELINE native_page_leave=FAIL selected_absolute_path='+cases[0]+' actual='+values[0]+' exit=1');process.exitCode=1;}
else{for(const [i,input]of cases.entries()){const normalized=path.win32.normalize(input).replace(/\\$/,'');const expected=path.win32.basename(normalized).toLowerCase()==='naumi'?normalized:path.win32.join(normalized,'Naumi');assert.equal(values[i],expected,'PATH_'+i);}
for(const key of Object.keys(values).filter(k=>k.startsWith('invalid-')))assert.equal(values[key],'',key);console.log('NATIVE_PATH cases=9 pass=9 invalid_rejected=5 new_parent=PASS unicode_spaces=PASS trailing_slash=PASS long_path=REJECTED no_writes=PASS exit=0');}
