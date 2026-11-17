'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const source=read('desktop/installer/presentation.nsh'),pages=read('desktop/installer/pages.nsh');
const pkg=JSON.parse(read('desktop/package.json'));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
test('pinned installer engine changes only the assisted presentation include',()=>{
 const upstream=read('desktop/node_modules/app-builder-lib/templates/nsis/installer.nsi').replaceAll('\r\n','\n');
 const engine=read('desktop/installer/engine.nsi');
 assert.equal(engine,upstream.replace('!include "assistedInstaller.nsh"','!include "${NAUMI_WIZARD_DIR}\\pages.nsh"'));
 const meta=JSON.parse(read('desktop/installer/UPSTREAM.json'));
 assert.equal(meta.originalEngineSHA256,sha(upstream));assert.equal(meta.modifiedEngineSHA256,sha(engine));
});
test('upstream multiuser identity, install directory and upgrade admission are retained',()=>{
 const assisted=read('desktop/node_modules/app-builder-lib/templates/nsis/assistedInstaller.nsh').replaceAll('\r\n','\n');
 assert.equal(read('desktop/installer/multiuser-init.nsh'),assisted.slice(assisted.indexOf('!macro initMultiUser')));
 assert(pages.indexOf('!insertmacro PAGE_INSTALL_MODE')<pages.indexOf('Page custom NaumiInstall'));
 assert(source.includes('${If} ${isUpdated}\n      Abort'));
});
test('native progress is real, path details and default headers are hidden',()=>{
 for(const s of ['ShowInstDetails nevershow','ShowUninstDetails nevershow','SetDetailsPrint none','$mui.InstFilesPage.ProgressBar','$mui.InstFilesPage.Text ${SW_HIDE}','$mui.InstFilesPage.Log ${SW_HIDE}','$mui.InstFilesPage.ShowLogButton ${SW_HIDE}'])assert(source.includes(s),s);
 assert(!/PBM_SETPOS|PBM_DELTAPOS|PBM_SETRANGE/.test(source));
 assert(source.indexOf('!insertmacro MUI_INSTFILESPAGE_INTERFACE')<source.indexOf('Function ${PREFIX}NaumiProgressShow'));
});
test('completion remains explicit and failures cannot display false completion',()=>{
 assert(source.includes('SetAutoClose true'));assert(pages.includes('Page custom NaumiDone NaumiDoneLeave'));
 assert(pages.includes('UninstPage custom un.NaumiDone'));assert(source.includes('".onInstFailed"'));
 assert(source.includes('"onUninstFailed"'));assert(source.includes('SetAutoClose false'));
 assert(source.includes('${NSD_GetState} $NaumiRunCheck $0'));assert(pages.includes('${StdUtils.ExecShellAsUser}'));
});
test('buttons retain native semantics and local path validation is non-destructive',()=>{
 assert(source.includes('${NSD_CreateButton}'));assert(source.includes('${NSD_OnClick}'));
 assert(source.includes('nsDialogs::SelectFolderDialog'));assert(source.includes('${If} $0 != error'));
 assert(source.includes('GetFullPathNameW'));assert(!source.includes('GetFullPathName $INSTDIR'));assert(source.includes('${GetFileName}'));
 const leave=source.slice(source.indexOf('Function NaumiInstallLeave'),source.indexOf('Function NaumiDoneLeave'));
 assert(!/CreateDirectory|WriteReg|Delete|RMDir|Exec/.test(leave));
});

test('new install directories use nonexisting-path-safe Win32 canonicalization and commit only after validation',()=>{
 const leave=source.slice(source.indexOf('Function NaumiInstallLeave'),source.indexOf('Function NaumiDoneLeave'));
 assert(leave.includes('${NSD_GetText} $NaumiPathField $NaumiCandidatePath'));
 assert(leave.indexOf('Call NaumiCanonicalPath')<leave.indexOf('StrCpy $INSTDIR $NaumiCandidatePath'));
 assert(leave.split('${If} $NaumiCandidatePath == ""').length===3);
 assert(source.includes('PathGetDriveNumberW'));assert(source.includes('$1 >= ${NSIS_MAX_STRLEN}'));
 const gate=read('desktop/installer/maintenance.nsh');assert(gate.indexOf('Call NaumiCanonicalPath')<gate.indexOf('!insertmacro NaumiExtractMaintenance',gate.indexOf('!macro customCheckAppRunning')));
 assert(gate.includes('Call un.NaumiCanonicalPath'));assert(gate.includes('SetErrorLevel 43'));
});

test('ZIP extraction admission is derived from real payload paths before any file write',async()=>{
 const {installPathBudget}=await import('../scripts/build-desktop.mjs');
 const value=installPathBudget([{path:'x'.repeat(174)}]);assert.equal(value.longestPayloadPathChars,192);assert.equal(value.maxInstallDirChars,66);
 assert.equal(value.maxInstallDirChars+1+value.longestPayloadPathChars,259);
 assert.throws(()=>installPathBudget([]),/INVENTORY_REQUIRED/);assert.throws(()=>installPathBudget([{path:'x'.repeat(260)}]),/BUDGET_EXHAUSTED/);
 assert(source.includes('$1 > ${NAUMI_MAX_INSTALLDIR_CHARS}'));assert(source.includes('installer-path-budget.nsh'));
});
test('one light layout scales geometry and uses high resolution branded assets',()=>{
 for(const s of ['MUI_BGCOLOR FFFFFF','GetDpiForWindow','NaumiScale','820 520','NaumiRail','Microsoft YaHei UI'])assert(source.includes(s));
 const assets={'logo.bmp':[88,88],'rail.bmp':[432,1040],'action-install.bmp':[320,88],'action-browse.bmp':[168,80]};
 for(const [file,[w,h]]of Object.entries(assets)){const b=fs.readFileSync(path.join(root,'desktop/installer/assets',file));assert.equal(b.toString('ascii',0,2),'BM');assert.equal(b.readInt32LE(18),w);assert.equal(b.readInt32LE(22),h);}
 for(const dpi of [96,120,144,192]){const scale=v=>Math.trunc(v*dpi/96);assert(scale(612)+scale(160)<scale(820));assert(scale(388)+scale(44)<scale(520));}
});
test('maintenance gate, user data retention, product identity and package staging stay enabled',()=>{
 const hook=read('desktop/installer/maintenance.nsh');
 for(const s of ['!macro customCheckAppRunning','SetErrorLevel 42','installer-preflight.cjs','!macro customInstall','!macro customUnInstall'])assert(hook.includes(s));
 assert(!hook.includes('taskkill'));assert.equal(pkg.build.appId,'com.naumi.desktop');
 assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);assert.equal(pkg.build.nsis.script,undefined);
 assert(pkg.scripts.build.includes('npm run installer:ui && npm run stage'));
 assert.equal(pkg.build.beforePack,'./scripts/verify-staged-runtime.cjs');
 const lock=JSON.parse(read('desktop/package-lock.json'));assert.equal(lock.version,pkg.version);assert.equal(lock.packages[''].version,pkg.version);
});
test('uninstall preview is a non-destructive presentation, not an alternate removal engine',()=>{
 const fixture=read('desktop/scripts/verify-installer-ui.mjs');
 const preview=fixture.slice(fixture.indexOf('const body=preview?'),fixture.indexOf('`:`'));
 for(const token of ['RMDir','DeleteRegKey','WriteRegStr','WriteUninstaller','ExecShell'])assert(!preview.includes(token));
 assert(preview.includes('NaumiUninstallPage'));assert(preview.includes('Page custom NaumiDone'));
});

test('presentation build hook preserves both native builder phases and restores original method',async()=>{
 const {installPresentationHook,presentationScript}=await import('../scripts/build-desktop.mjs');
 const raw=read('desktop/node_modules/app-builder-lib/templates/nsis/installer.nsi'),engine=read('desktop/installer/engine.nsi'),meta=JSON.parse(read('desktop/installer/UPSTREAM.json'));
 const calls=[];class Target{computeFinalScript(raw,installer,archs){calls.push({raw,installer,archs,owner:this});return raw;}}
 const original=Target.prototype.computeFinalScript,restore=installPresentationHook(Target,engine,meta),target=new Target;
 try{target.computeFinalScript(raw,false,['x64']);target.computeFinalScript(raw,true,['x64']);assert.deepEqual(calls.map(c=>c.installer),[false,true]);assert(calls.every(c=>c.raw===engine&&c.owner===target));assert.throws(()=>presentationScript(raw+'x',engine,meta),/SOURCE_CHANGED/);}finally{restore();}
 assert.equal(Target.prototype.computeFinalScript,original);
 const builder=read('desktop/scripts/build-desktop.mjs');assert(builder.includes("publish:'never'"));
 const hook=builder.slice(builder.indexOf('export function installPresentationHook'),builder.indexOf('export async function buildDesktop'));assert(!hook.includes('writeFile'));
 assert(builder.includes("path.join(root,'runtime/installer-path-budget.nsh')"));
});
