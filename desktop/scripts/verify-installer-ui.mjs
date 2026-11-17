// Isolated native QA only: no product registry, shortcuts or employee profile.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const require=createRequire(import.meta.url);
const {getMakeNsisPath}=require('app-builder-lib/out/toolsets/windows.js');
const tool=await getMakeNsisPath();
const folder=path.join(root,'runtime/installer-ui-fixture');
const preview=process.argv.includes('--preview');
fs.mkdirSync(folder,{recursive:true});
const q=s=>s.replaceAll('/','\\');
const exe=path.join(folder,preview?'Naumi-Page-Preview.exe':'Naumi-UI-Fixture.exe');
const header=`Unicode true
!include MUI2.nsh
!define VERSION "0.3.3"
!define NAUMI_WIZARD_DIR "${q(path.join(root,'desktop/installer'))}"
!include "\${NAUMI_WIZARD_DIR}\\presentation.nsh"
Name "Naumi"
Caption "Naumi${preview?' · 页面预览':''}"
OutFile "${q(exe)}"
InstallDir "${q(path.join(folder,'installed/Naumi'))}"
RequestExecutionLevel user
`;
const body=preview?`
; Production uninstall UI only; NO removal, installation, registration or launch.
!insertmacro NaumiFunctions "" "uninstall"
!insertmacro NaumiUninstallPage ""
Page custom NaumiConfirm
Page custom NaumiDone
!insertmacro MUI_LANGUAGE "SimpChinese"
Section
SectionEnd
`:`
!define MUI_CUSTOMFUNCTION_GUIINIT QaInit
!insertmacro NaumiInstallerFunctions
!insertmacro NaumiUninstallerFunctions
Page custom NaumiInstall NaumiInstallLeave
!define MUI_PAGE_CUSTOMFUNCTION_SHOW NaumiProgressShow
!insertmacro MUI_PAGE_INSTFILES
Page custom NaumiDone NaumiDoneLeave
UninstPage custom un.NaumiConfirm
!define MUI_PAGE_CUSTOMFUNCTION_SHOW un.NaumiProgressShow
!insertmacro MUI_UNPAGE_INSTFILES
UninstPage custom un.NaumiDone
!insertmacro MUI_LANGUAGE "SimpChinese"
Function QaInit
  IfFileExists "${q(path.join(folder,'qa-progress.flag'))}" 0 +2
    System::Call 'user32::PostMessageW(p $HWNDPARENT, i 0x111, p 1, p 0)'
FunctionEnd
Function StartApp
  FileOpen $0 "${q(path.join(folder,'launch-request.txt'))}" w
  FileWrite $0 "fixture only; no application launched"
  FileClose $0
FunctionEnd
Section
  StrCmp $INSTDIR "${q(path.join(folder,'installed/Naumi'))}" +2
    Abort
  SetDetailsPrint none
  SetOutPath "$INSTDIR\\resources\\backend\\node_modules\\@deepseek-ai\\fixture"
  File /oname=module.txt "${q(path.join(root,'desktop/installer/UPSTREAM.json'))}"
  WriteUninstaller "$INSTDIR\\Uninstall Naumi.exe"
  IfSilent +2
    Sleep 18000
  FileOpen $0 "${q(path.join(folder,'install-receipt.txt'))}" w
  FileWrite $0 "fixture installed; no product registry or employee data modified"
  FileClose $0
SectionEnd
Section Uninstall
  StrCmp $INSTDIR "${q(path.join(folder,'installed/Naumi'))}" +2
    Abort
  SetDetailsPrint none
  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"
SectionEnd
`;
const source=path.join(folder,preview?'preview.nsi':'fixture.nsi');
fs.writeFileSync(source,header+body);
const output=execFileSync(tool.path,['/INPUTCHARSET','UTF8','/V2',source],{env:{...process.env,...tool.env},encoding:'utf8'});
fs.writeFileSync(path.join(folder,preview?'preview-compile.log':'compile.log'),output);
assert(!/warning 6000/.test(output),'NSIS_UNRESOLVED_VARIABLE');
assert(fs.existsSync(exe));
console.log(`INSTALLER_UI_COMPILE ${preview?'presentation_preview':'fixture'}=PASS production_presentation=shared executable=${exe}`);
