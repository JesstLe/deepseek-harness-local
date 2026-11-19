'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {begin,check}=require('../app/installer-relaunch.cjs');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8').replaceAll('\r\n','\n');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-launch-proof-')),root=path.join(dir,'Naumi'),userData=path.join(dir,'profile'),file=path.join(dir,'proof.json');fs.mkdirSync(root);fs.mkdirSync(userData);
 const time=Date.now()-5000,receipt={version:1,pid:123,clientVersion:'0.4.1',serviceVersion:'0.4.1',executable:path.join(root,'Naumi.exe'),readyAt:new Date(time+2000).toISOString()},process={pid:123,exe:receipt.executable,created:new Date(time+1000).toISOString()};
 begin(file,root,'0.4.1',{now:time,userData});
 return {dir,root,userData,file,time,receipt,process,write(r=receipt){fs.writeFileSync(path.join(userData,'desktop-runtime.json'),JSON.stringify(r));},close(){fs.rmSync(dir,{recursive:true,force:true});}};
}
test('new version fresh ready receipt and exact live process prove completion',()=>{const f=fixture();try{f.write();assert.equal(check(f.file,{inspect:()=>[f.process]}),true);}finally{f.close();}});
test('old/missing/stale/wrong-install receipts never claim startup',()=>{const f=fixture();try{assert.equal(check(f.file),false);for(const change of [{clientVersion:'0.4.0'},{readyAt:new Date(f.time-1).toISOString()},{executable:path.join(f.dir,'other','Naumi.exe')},{pid:0},{readyAt:'invalid'}]){f.write({...f.receipt,...change});assert.equal(check(f.file,{inspect:()=>[f.process]}),false,JSON.stringify(change));}}finally{f.close();}});
test('exited, reused or identity-unknown PIDs never close result page',()=>{const f=fixture();try{f.write();for(const records of [[],[{...f.process,exe:null}],[{...f.process,exe:path.join(f.dir,'other.exe')}],[{...f.process,created:new Date(f.time-1).toISOString()}],[{...f.process,created:new Date(f.time+3000).toISOString()}]])assert.equal(check(f.file,{inspect:()=>records}),false);}finally{f.close();}});
test('inventory failure remains unknown and does not mutate receipt or launch processes',()=>{const f=fixture();try{f.write();const before=fs.readFileSync(path.join(f.userData,'desktop-runtime.json'));assert.throws(()=>check(f.file,{inspect:()=>{throw Error('query blocked');}}),/query blocked/);assert.deepEqual(fs.readFileSync(path.join(f.userData,'desktop-runtime.json')),before);}finally{f.close();}});
test('invalid proofs fail closed; no receipt changes or app/data removal',()=>{const f=fixture();try{f.write();fs.writeFileSync(f.file,'{}');assert.throws(()=>check(f.file),/PROOF_INVALID/);assert.throws(()=>begin(f.file,'relative','0.4.1',{userData:f.userData}),/PROOF_INVALID/);assert(fs.existsSync(path.join(f.userData,'desktop-runtime.json')));}finally{f.close();}});
test('old silent clients reveal native update UI while keeping registered scope/elevation',()=>{
 const hook=read('installer/maintenance.nsh');assert(hook.includes('SetSilent normal'));assert(hook.indexOf('SetSilent normal')>hook.indexOf('ReadRegStr $R2 HKLM'));
 assert(hook.includes('!macro customInstallMode'));assert(hook.includes('StrCpy $isForceMachineInstall "1"'));assert(hook.includes('StrCpy $isForceCurrentInstall "1"'));
 const init=hook.slice(hook.indexOf('!macro customInit'),hook.indexOf('!macro customInstallMode'));
 assert(init.includes('${If} ${UAC_IsInnerInstance}\n      !insertmacro customCheckAppRunning'));
 const finish=hook.slice(hook.indexOf('!macro customInstall\n'));assert(finish.indexOf('!insertmacro NaumiExtractMaintenance')<finish.indexOf('"finish"'));
});
test('updated completion uses exact executable, no second checkbox launch, retry without reinstall',()=>{
 const page=read('installer/pages.nsh'),ui=read('installer/update-ui.nsh'),presentation=read('installer/presentation.nsh');
 assert(page.includes('${StdUtils.ExecShellAsUser} $0 "$appExe"'));assert(ui.includes('Call StartApp'));assert(ui.includes('"check" "$PLUGINSDIR\\update-launch.json"'));
 assert(ui.includes('EnableWindow $NaumiUpdateRetry 0'));assert(ui.includes('EnableWindow $NaumiUpdateRetry 1'));assert(ui.includes('$NaumiUpdateLaunchPending == "1"'));
 assert(ui.includes('Naumi 尚未就绪'));assert(ui.includes('${NSD_KillTimer} NaumiUpdatePoll'));
 assert(presentation.includes('Call NaumiUpdateDone'));assert(presentation.includes('SendMessage $mui.InstFilesPage.ProgressBar 0x40A 1 40'));
 assert(!/RMDir|DeleteReg|taskkill|quitAndInstall/.test(ui));
});
test('maintenance probes are hidden at process creation and never route through a visible shell',()=>{
 const inventory=read('app/installer-state.cjs'),ui=read('installer/update-ui.nsh'),hook=read('installer/maintenance.nsh');
 assert(inventory.includes("'-WindowStyle','Hidden'"));assert(inventory.includes('windowsHide:true'));
 assert(!inventory.includes('shell:true'));assert(ui.includes('nsExec::ExecToStack'));assert(hook.includes('nsExec::ExecToStack'));
 const qa=read('scripts/verify-update-friendly.mjs');assert.match(qa,/ExecShell "open" "\$appExe".+SW_HIDE/);
});

test("a new client with a stale or unknown service never proves update complete",()=>{const f=fixture();try{for(const serviceVersion of [undefined,'0.3.9']){f.write({...f.receipt,serviceVersion});assert.equal(check(f.file,{inspect:()=>[f.process]}),false);}}finally{f.close();}});
