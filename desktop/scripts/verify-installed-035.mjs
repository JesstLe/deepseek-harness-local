// Final production installer, real silent install/uninstall into an owned new path.
// Preserve the pre-existing development shortcut; never adopt another product install.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{execFileSync,spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const root=path.resolve(process.argv[2]??fileURLToPath(new URL('../..',import.meta.url))),pwsh='D:/DEV/PowerShell/pwsh.exe',e=path.join(root,'evidence/installer-path-fix'),base=path.join(root,'runtime/i035'),target=path.join(base,'中文 空格','Naumi'),setup=path.join(root,'runtime/naumi-desktop-release-0.3.5/Naumi-Setup-0.3.5-x64.exe'),sha=b=>createHash('sha256').update(b).digest('hex');
fs.mkdirSync(e,{recursive:true});assert(!fs.existsSync(target),'TEST_TARGET_EXISTS');assert(target.startsWith(path.join(root,'runtime')+path.sep));
const ps=script=>execFileSync(pwsh,['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true}).trim(),quote=v=>"'"+v.replaceAll("'","''")+"'";
const snapshot=()=>JSON.parse(ps(`$g='fef98446-cfc3-5773-96cc-aa410c507d30';$reg=@();foreach($h in @('HKCU:','HKLM:')){foreach($p in @('Software\\'+$g,'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\'+$g,'Software\\Classes\\AppUserModelId\\com.naumi.desktop')){if(Test-Path -LiteralPath ($h+'\\'+$p)){$reg+=($h+'\\'+$p)}}};$d=Join-Path ([Environment]::GetFolderPath('Desktop')) 'Naumi.lnk';$s=Join-Path ([Environment]::GetFolderPath('Programs')) 'Naumi.lnk';@{registry=$reg;desktop=$d;desktopHash=if(Test-Path -LiteralPath $d){(Get-FileHash -LiteralPath $d).Hash}else{''};menu=$s;menuHash=if(Test-Path -LiteralPath $s){(Get-FileHash -LiteralPath $s).Hash}else{''}}|ConvertTo-Json -Compress`));
const before=snapshot();assert.equal(before.registry.length,0,'EXISTING_PRODUCT_REGISTRY_PRESERVED');assert.equal(before.menuHash,'','EXISTING_MENU_PRESERVED');
fs.mkdirSync(base,{recursive:true});fs.writeFileSync(path.join(e,'INSTALL_BEFORE.json'),JSON.stringify(before,null,2)+'\n');
const exits=[];
function run(file,args,label){const r=spawnSync(file,args,{cwd:base,windowsHide:true,windowsVerbatimArguments:true,encoding:'utf8',timeout:600000});exits.push({stage:label,exit:r.status,signal:r.signal});assert.equal(r.status,0,label+' '+r.error?.message);console.log('INSTALLED_NATIVE stage='+label+' exit=0');}
function assertDesktop(){const now=snapshot();assert.equal(now.desktopHash,before.desktopHash,'USER_DESKTOP_SHORTCUT_CHANGED');}
let installed=false,removed=false;
try{
 run(setup,['/S','--no-desktop-shortcut','/D='+target],'install-new-unicode-path');installed=true;assertDesktop();
 assert(fs.existsSync(path.join(target,'Naumi.exe')));assert.equal(sha(fs.readFileSync(path.join(target,'uninstallerIcon.ico'))),sha(fs.readFileSync(path.join(root,'desktop/app/assets/naumi.ico'))));
 const metadata=JSON.parse(fs.readFileSync(path.join(target,'resources/backend/runtime-manifest.json')));assert.equal(metadata.version,'0.3.5');
 const inventory=JSON.parse(fs.readFileSync(path.join(target,'resources/backend/runtime-files.json')));for(const item of inventory)assert.equal(sha(fs.readFileSync(path.join(target,'resources/backend',item.path))),item.sha256,item.path);
 const registered=ps(`$p=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\fef98446-cfc3-5773-96cc-aa410c507d30';@{version=$p.DisplayVersion;location=$p.InstallLocation}|ConvertTo-Json -Compress`),reg=JSON.parse(registered);assert.equal(reg.version,'0.3.5');assert.equal(path.resolve(reg.location),path.resolve(target));
 const smoke=spawnSync(process.execPath,[path.join(root,'desktop/scripts/verify-release-035.mjs'),root,path.join(target,'Naumi.exe')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:3e6});fs.writeFileSync(path.join(e,'INSTALLED_SMOKE.txt'),smoke.stdout+smoke.stderr);assert.equal(smoke.status,0,'INSTALLED_SMOKE_FAILED '+smoke.stderr);
 // NSIS _?= disables its temp-copy fork, so the exit receipt is from actual removal.
 run(path.join(target,'Uninstall Naumi.exe'),['/S','--keep-shortcuts','_?='+target],'uninstall-owned-target');removed=true;
 // Keep-shortcuts protects the user's desktop .lnk. Remove only the menu entry
 // created by this test, after resolving its exact owned target.
 ps(`$m=${quote(before.menu)};$w=New-Object -ComObject WScript.Shell;if(Test-Path -LiteralPath $m){$l=$w.CreateShortcut($m);if($l.TargetPath -ne ${quote(path.join(target,'Naumi.exe'))}){throw 'FOREIGN_MENU_PRESERVED'};Remove-Item -LiteralPath $m};$k='HKCU:\\Software\\Classes\\AppUserModelId\\com.naumi.desktop';if(Test-Path -LiteralPath $k){Remove-Item -LiteralPath $k -Recurse}`);
 // The in-place uninstaller may retain only itself; verify before deleting it.
 if(fs.existsSync(target)){const names=fs.readdirSync(target);assert(names.every(n=>n==='Uninstall Naumi.exe'),'UNEXPECTED_INSTALLED_REMAINS '+names.join(','));if(names.length)fs.unlinkSync(path.join(target,names[0]));fs.rmdirSync(target);}
 const after=snapshot();assert.deepEqual(after,before,'ENVIRONMENT_NOT_RESTORED');
 fs.writeFileSync(path.join(e,'INSTALLED.json'),JSON.stringify({status:'PASS',version:'0.3.5',target,productionInstaller:setup,nativeExits:exits,newUnicodeSpaceDirectory:true,uninstallerIcon:true,inventoryFiles:inventory.length,installedAppSmoke:'PASS',uninstall:'PASS',registryRestored:true,userDesktopShortcutUnchanged:true,realEmployeeDataTouched:false,service3080Touched:false,modelCalls:0},null,2)+'\n');
 console.log('FINAL_NSIS install=PASS unicode_spaces=PASS logo=PASS inventory=PASS installed_login=PASS installed_update=PASS uninstall=PASS registry=RESTORED desktop=UNCHANGED exit=0');
}catch(error){fs.writeFileSync(path.join(e,'INSTALL_PENDING.json'),JSON.stringify({installed,removed,target,exits,error:String(error)},null,2));throw error;}
