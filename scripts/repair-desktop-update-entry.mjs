import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const hash=b=>createHash('sha256').update(b).digest('hex');
const normalize=s=>s.replaceAll('\r\n','\n');
function replaceOnce(text,anchor,replacement){assert.equal(text.split(anchor).length,2,'REPAIR_ANCHOR_CHANGED');return text.replace(anchor,replacement);}

/** Thin deployment adapter: reuse the installed release's actual slot component.
 * Do not replace the legacy backend/client wholesale or change its data/profile. */
export function planUpdateEntry({host,client,productVersion,sourceClient,sourceUI,sourceCSS,version}){
 assert.match(version,/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/);
 let nextHost=normalize(host),nextClient=normalize(client);
 assert(nextHost.includes('productVersion:PRODUCT_VERSION'),'PRODUCT_VERSION_CONTRACT_MISSING');
 const marker="import('/naumi/assets/desktop-updates.js')",source=normalize(sourceClient),at=source.indexOf(marker);
 assert(at>=0,'INSTALLED_UPDATE_COMPONENT_MISSING');
 const start=source.lastIndexOf('  ctx.effect(()=>{',at),end=source.indexOf('  });',at)+6;
 assert(start>=0&&end>at,'UPDATE_EFFECT_CONTRACT_CHANGED');
 if(!nextClient.includes(marker))nextClient=replaceOnce(nextClient,'function installNaumiContextUI(ctx,React,createPortal,Icon){','function installNaumiContextUI(ctx,React,createPortal,Icon){\n'+source.slice(start,end)+'\n');
 for(const [name,type]of [['desktop-updates.js','text/javascript'],['desktop-updates.css','text/css']]){
  // The declaration must precede these registrations. Keep every unrelated route intact.
  if(!nextHost.includes("assets.set('"+name+"'")){
   const anchor="  assets.set('product-copy-keys.js'";
   nextHost=replaceOnce(nextHost,anchor,"  assets.set('"+name+"','"+type+"; charset=utf-8');\n"+anchor);
  }
 }
 if(!nextHost.includes('href="/naumi/assets/desktop-updates.css"'))nextHost=replaceOnce(nextHost,'<link rel="stylesheet" href="/naumi/assets/style.css">','<link rel="stylesheet" href="/naumi/assets/style.css"><link rel="stylesheet" href="/naumi/assets/desktop-updates.css">');
 assert(sourceUI.includes("ctx.slots.inject('sidebar.footer.action'"),'NATIVE_SLOT_REQUIRED');
 assert(sourceUI.includes('api?.checkUpdates'),'NATIVE_UPDATE_API_REQUIRED');
 assert(/^export const PRODUCT_VERSION\s*=/.test(productVersion.trim()),'PRODUCT_VERSION_FILE_CHANGED');
 return new Map([['host.js',nextHost],['client.js',nextClient],['product-version.js','export const PRODUCT_VERSION='+JSON.stringify(version)+';\n'],['assets/desktop-updates.js',sourceUI],['assets/desktop-updates.css',sourceCSS]]);
}

export function inventory(root){const result={};function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);assert(!e.isSymbolicLink(),'LINKED_PLUGIN_REJECTED');if(e.isDirectory())visit(file);else if(e.isFile())result[path.relative(root,file).replaceAll('\\','/')]=hash(fs.readFileSync(file));}}visit(root);return result;}
function shell(script){const r=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command',script],{encoding:'utf8',windowsHide:true,timeout:150000});if(r.status!==0)throw Error('REPAIR_SHELL_FAILED '+r.stderr);return r.stdout;}
const quote=s=>"'"+s.replaceAll("'","''")+"'";

export async function repair({root,installed,out,apply=false}){
 root=path.resolve(root);installed=path.resolve(installed);out=path.resolve(out);
 assert(!out.startsWith(path.join(root,'.dsh')+path.sep),'EVIDENCE_IN_PROFILE_REJECTED');
 assert(!fs.existsSync(path.join(out,'DEPLOYMENT.json')),'REPAIR_RECEIPT_ALREADY_EXISTS');
 const require=createRequire(path.join(root,'desktop/package.json')),asar=require('@electron/asar'),archive=path.join(installed,'resources/app.asar'),pkg=JSON.parse(asar.extractFile(archive,'package.json'));
 assert.equal(pkg.name,'naumi-desktop');assert(asar.extractFile(archive,'app/preload.cjs').toString().includes('checkUpdates'),'INSTALLED_NATIVE_API_MISSING');
 const source=path.join(installed,'resources/backend/plugins/naumi-enterprise'),plugin=path.join(root,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise');
 assert(fs.realpathSync(plugin).startsWith(fs.realpathSync(root)+path.sep),'EXTERNAL_PLUGIN_REJECTED');
 const read=(base,file)=>fs.readFileSync(path.join(base,file),'utf8');
 const plan=planUpdateEntry({host:read(plugin,'host.js'),client:read(plugin,'client.js'),productVersion:read(plugin,'product-version.js'),sourceClient:read(source,'client.js'),sourceUI:read(source,'assets/desktop-updates.js'),sourceCSS:read(source,'assets/desktop-updates.css'),version:pkg.version});
 fs.mkdirSync(out,{recursive:true});const before=inventory(plugin),entries=[];
 for(const [file,text]of plan){const target=path.join(plugin,file),bytes=Buffer.from(text),old=fs.existsSync(target)?fs.readFileSync(target):null;if(old&&hash(old)===hash(bytes))continue;
  const orig=path.join(out,'original',file),modified=path.join(out,'modified',file);fs.mkdirSync(path.dirname(modified),{recursive:true});fs.writeFileSync(modified,bytes);if(old){fs.mkdirSync(path.dirname(orig),{recursive:true});fs.writeFileSync(orig,old);}entries.push({path:file,original:old?hash(old):null,modified:hash(bytes)});
 }
 const shortcut=shell("$w=New-Object -ComObject WScript.Shell;$p=Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Naumi.lnk';if(Test-Path -LiteralPath $p){$s=$w.CreateShortcut($p);[pscustomobject]@{path=$p;target=$s.TargetPath;arguments=$s.Arguments;icon=$s.IconLocation}|ConvertTo-Json -Compress}");
 const link=shortcut.trim()?JSON.parse(shortcut):null,exe=path.join(installed,'Naumi.exe');
 if(link){const old=path.resolve(link.target),cache=path.resolve(process.env.LOCALAPPDATA,'Naumi/client-builds');assert(old.toLowerCase()===exe.toLowerCase()||(old.toLowerCase().startsWith(cache.toLowerCase()+path.sep)&&path.basename(old).toLowerCase()==='naumi.exe'&&fs.existsSync(path.join(path.dirname(old),'naumi-client-build.json'))),'UNRECOGNIZED_SHORTCUT');fs.copyFileSync(link.path,path.join(out,'ORIGINAL_Naumi.lnk'));}
 const manifest={version:pkg.version,installed,root,plugin,entries,shortcut:link,executable:exe,changedFields:['legacy host update asset routes/css','legacy client native sidebar slot hook','PRODUCT_VERSION from installed release','personal desktop shortcut target'],installedASAR:hash(fs.readFileSync(archive))};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 if(!apply){console.log('BASELINE legacy_version='+read(plugin,'product-version.js').match(/"([^"]+)"/)?.[1]+' update_hook='+Number(read(plugin,'client.js').includes("import('/naumi/assets/desktop-updates.js')"))+' planned_files='+entries.length+' exit=0');return manifest;}
 const probe=()=>{const r=spawnSync(process.execPath,[path.join(root,'scripts/check-bot-runtime.mjs'),root,'2'],{encoding:'utf8',windowsHide:true,timeout:30000});assert.equal(r.status,0,'RUNTIME_NOT_IDLE');return r.stdout.trim();};
 const protectedPaths=['.dsh/.credentials.yaml','.dsh/cordis.patch.yml','.dsh/profiles/web/package.json','.dsh/profiles/web/cordis.patch.yml',path.relative(root,path.join(process.env.APPDATA,'Naumi/backend-link.json'))],protectedFiles=Object.fromEntries(protectedPaths.filter(p=>fs.existsSync(path.join(root,p))).map(p=>[p,hash(fs.readFileSync(path.join(root,p)))]));
 const baseline=probe();let stopped=false,shortcutChanged=false;
 try{
  shell('& '+quote(path.join(root,'Stop-Naumi.ps1')));stopped=true;
  for(const e of entries){const f=path.join(plugin,e.path);assert.equal(fs.existsSync(f)?hash(fs.readFileSync(f)):null,e.original,'RUNTIME_CHANGED');fs.mkdirSync(path.dirname(f),{recursive:true});fs.copyFileSync(path.join(out,'modified',e.path),f);}
  shell('& '+quote(path.join(root,'Start-Naumi.ps1')));stopped=false;const afterProbe=probe();
  const after=inventory(plugin);for(const e of entries)assert.equal(after[e.path],e.modified);for(const [p,h]of Object.entries(before))if(!entries.some(e=>e.path===p))assert.equal(after[p],h,'UNRELATED_RUNTIME_CHANGED');
  for(const [p,h]of Object.entries(protectedFiles))assert.equal(hash(fs.readFileSync(path.join(root,p))),h,'CONFIG_CHANGED');
  if(link&&path.resolve(link.target).toLowerCase()!==exe.toLowerCase()){
   shell("$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut("+quote(link.path)+");$s.TargetPath="+quote(exe)+";$s.Arguments='';$s.WorkingDirectory="+quote(installed)+";$s.IconLocation="+quote(exe+',0')+";$s.Save();$s=$w.CreateShortcut("+quote(link.path)+");if($s.TargetPath -ne "+quote(exe)+"){throw 'SHORTCUT_VERIFY_FAILED'}");shortcutChanged=true;
  }
  if(link){manifest.shortcutModified=hash(fs.readFileSync(link.path));fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');fs.copyFileSync(link.path,path.join(out,'MODIFIED_Naumi.lnk'));}
  assert.equal(hash(fs.readFileSync(archive)),manifest.installedASAR);
  fs.writeFileSync(path.join(out,'DEPLOYMENT.json'),JSON.stringify({status:'PASS',version:pkg.version,baseline,after:afterProbe,runtimeFiles:entries.length,unrelatedRuntimeFilesPreserved:Object.keys(before).filter(p=>!entries.some(e=>e.path===p)).length,configHashesPreserved:Object.keys(protectedFiles).length,backendLinkRetained:true,installedASARUnchanged:true,shortcutTarget:exe,shortcutChanged,modelCalls:0},null,2)+'\n');
  console.log('MODIFIED version='+pkg.version+' update_hook=1 files='+entries.length+' shortcut=INSTALLED config=UNCHANGED model_calls=0 exit=0');
 }catch(error){
  if(!stopped){shell('& '+quote(path.join(root,'Stop-Naumi.ps1')));stopped=true;}
  for(const e of entries){const f=path.join(plugin,e.path);if(e.original)fs.copyFileSync(path.join(out,'original',e.path),f);else if(fs.existsSync(f))fs.unlinkSync(f);}
  if(shortcutChanged)fs.copyFileSync(path.join(out,'ORIGINAL_Naumi.lnk'),link.path);
  shell('& '+quote(path.join(root,'Start-Naumi.ps1')));throw error;
 }
 return manifest;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(2,i),x.slice(i+1)];}));
 await repair({root:args.root??process.cwd(),installed:args.installed??'C:/Program Files/Naumi',out:args.out??path.join(process.cwd(),'evidence/update-entry-fix'),apply:process.argv.includes('--apply')});
}
