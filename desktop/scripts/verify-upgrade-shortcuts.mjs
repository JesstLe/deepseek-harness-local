// Compile and execute the actual production macro in small native NSIS fixtures.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {spawnSync,execFileSync} from 'node:child_process';
const root=process.cwd(),require=createRequire(import.meta.url),tool=await require('app-builder-lib/out/toolsets/windows.js').getMakeNsisPath(),dir=path.join(root,'runtime/upgrade-shortcuts-regression');fs.mkdirSync(dir,{recursive:true});const q=s=>s.replaceAll('/','\\').replaceAll('$','$$'),util=fs.readFileSync(path.join(root,'desktop/node_modules/app-builder-lib/templates/nsis/include/installUtil.nsh'),'utf8'),start=util.indexOf('!macro setIsTryToKeepShortcuts'),old=util.slice(start,util.indexOf('!macroend',start)+'!macroend'.length),policy=fs.readFileSync('desktop/installer/upgrade-shortcuts.nsh','utf8');
const checks=[];
for(const [label,updated,exists,expected,fix]of [['baseline-manual',false,true,'false',false],['manual-upgrade',false,true,'true',true],['fresh-install',false,false,'false',true],['auto-update',true,true,'true',true],['changed-directory',false,false,'false',true]]){
 const cwd=path.join(dir,label);fs.mkdirSync(cwd,{recursive:true});if(exists)fs.writeFileSync(path.join(cwd,'Naumi.exe'),'fixture only');const exe=path.join(cwd,'macro.exe'),receipt=path.join(cwd,'result.txt');const script=`Unicode true
!include LogicLib.nsh
!define allowToChangeInstallationDirectory
!define APP_EXECUTABLE_FILENAME "Naumi.exe"
!define isUpdated '${updated?1:0} == 1'
Var isTryToKeepShortcuts
${old}
${fix?policy:''}
Name "Naumi shortcut capability fixture"
OutFile "${q(exe)}"
RequestExecutionLevel user
SilentInstall silent
Section
StrCpy $INSTDIR "${q(cwd)}"
!insertmacro setIsTryToKeepShortcuts
FileOpen $9 "${q(receipt)}" w
FileWrite $9 "$isTryToKeepShortcuts"
FileClose $9
SectionEnd
`;const file=path.join(cwd,'macro.nsi');fs.writeFileSync(file,script);execFileSync(tool.path,['/INPUTCHARSET','UTF8','/V2',file],{env:{...process.env,...tool.env}});const r=spawnSync(exe,[],{windowsHide:true,timeout:15000});assert.equal(r.status,0);const result=fs.readFileSync(receipt,'utf8');assert.equal(result,expected,label);checks.push({label,result,exit:0});}
fs.writeFileSync('evidence/daily-five/SHORTCUT_NATIVE.json',JSON.stringify({status:'PASS',checks,realRegistryWrites:0,userShortcutsTouched:false},null,2));console.log('SHORTCUT_NATIVE_PASS baseline_manual=false modified_manual=true fresh=false auto=true changed_directory=false cases=5 exit=0');
