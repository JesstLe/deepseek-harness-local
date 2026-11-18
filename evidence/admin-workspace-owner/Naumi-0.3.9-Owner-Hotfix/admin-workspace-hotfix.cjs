'use strict';
// Self-contained .9 code-only hotfix, executed by the installation's bundled Node.
// No profile, credentials, ACL or application data are edited by this distributor.
const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto'),{execFileSync}=require('node:child_process');
const parse=(bytes)=>{try{return JSON.parse(bytes);}catch{fail('HOTFIX_METADATA_INVALID');}};
const id='admin-workspace-owner-20261118',sha=b=>createHash('sha256').update(b).digest('hex'),fail=code=>{throw Error(code);};
function guard(root,relative){const target=path.resolve(root,relative);if(!target.startsWith(root+path.sep))fail('HOTFIX_PATH_REJECTED');let p=root;for(const name of path.relative(root,target).split(path.sep)){p=path.join(p,name);if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())fail('HOTFIX_REPARSE_REJECTED');}return target;}
function idle(root){
 if(process.platform!=='win32')return;
 const ps=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),raw=execFileSync(ps,['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);@(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;name=$_.Name;exe=$_.ExecutablePath}})|ConvertTo-Json -Compress"],{env:{...process.env,PSModulePath:path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/Modules')},encoding:'utf8',windowsHide:true,maxBuffer:4e6}),rows=JSON.parse(raw);if(!Array.isArray(rows))fail('HOTFIX_PROCESS_UNKNOWN');
 for(const p of rows){if(p.pid===process.pid)continue;if(p.exe&&path.resolve(p.exe).toLowerCase().startsWith(root.toLowerCase()+path.sep)||p.name?.toLowerCase()==='naumi.exe'&&!p.exe)fail('HOTFIX_CLOSE_NAUMI_FIRST');}
}
function atomic(file,bytes){const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,bytes,{flag:'wx'});fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
function main({installRoot,packageRoot=__dirname,action='apply'}){
 if(!['apply','rollback'].includes(action))fail('HOTFIX_ACTION_INVALID');
 const root=path.resolve(installRoot);if(!fs.existsSync(root)||fs.lstatSync(root).isSymbolicLink()||fs.realpathSync.native(root).toLowerCase()!==root.toLowerCase())fail('HOTFIX_INSTALL_ROOT_INVALID');
 if(!fs.existsSync(guard(root,'Naumi.exe'))||!fs.existsSync(guard(root,'resources/app.asar')))fail('HOTFIX_NAUMI_INSTALL_REQUIRED');idle(root);
 const base=guard(root,'resources/backend'),backup=guard(root,'.naumi-hotfix-'+id),record=path.join(backup,'receipt.json'),definition=parse(fs.readFileSync(path.join(packageRoot,'HOTFIX.json')));
 if(definition.id!==id)fail('HOTFIX_PACKAGE_INVALID');
 function restore(plan){for(const r of plan.files){const file=guard(root,r.relative),now=sha(fs.readFileSync(file));if(now!==r.modified&&now!==r.original)fail('HOTFIX_ROLLBACK_DRIFT');}for(const r of [...plan.files].reverse()){const bytes=fs.readFileSync(guard(backup,r.backup));if(sha(bytes)!==r.original)fail('HOTFIX_BACKUP_INVALID');atomic(guard(root,r.relative),bytes);}}
 if(action==='rollback'){
  const plan=parse(fs.readFileSync(record));if(plan.id!==id||plan.root.toLowerCase()!==root.toLowerCase()||plan.status!=='applied')fail('HOTFIX_RECEIPT_INVALID');restore(plan);plan.status='rolled-back';atomic(record,Buffer.from(JSON.stringify(plan,null,2)));console.log('OWNER_HOTFIX_ROLLBACK files='+plan.files.length+' original_hashes=PASS data=UNTOUCHED exit=0');return;
 }
 if(fs.existsSync(record)){const old=parse(fs.readFileSync(record));if(old.status==='applied'&&old.root.toLowerCase()===root.toLowerCase()&&old.files.every(r=>sha(fs.readFileSync(guard(root,r.relative)))===r.modified)){console.log('OWNER_HOTFIX_ALREADY_APPLIED exit=0');return;}fail('HOTFIX_EXISTING_RECEIPT_REVIEW_REQUIRED');}
 const inventoryFile=guard(base,'runtime-files.json'),manifestFile=guard(base,'runtime-manifest.json'),inventoryRaw=fs.readFileSync(inventoryFile),manifestRaw=fs.readFileSync(manifestFile),manifest=parse(manifestRaw),rows=parse(inventoryRaw);if(manifest.product!=='Naumi'||manifest.version!=='0.3.9'||sha(inventoryRaw)!==manifest.inventorySHA256||!Array.isArray(rows))fail('HOTFIX_SUPPORTED_039_INVENTORY_REQUIRED');
 const changes=[];
 for(const dir of ['plugins/naumi-enterprise','node_modules/@naumi/dsh-enterprise'])for(const r of definition.files){
  const relative=dir+'/'+r.file,file=guard(base,relative),old=fs.readFileSync(file),normalized=Buffer.from(old.toString('utf8').replaceAll('\r\n','\n'));
  if(sha(normalized)!==r.originalNormalized)fail('HOTFIX_UNRECOGNIZED_ORIGINAL '+relative);
  const bytes=fs.readFileSync(guard(path.resolve(packageRoot),'payload/'+r.file));if(sha(bytes)!==r.modified)fail('HOTFIX_PAYLOAD_INVALID');const matches=rows.filter(v=>v.path===relative);if(matches.length!==1||matches[0].sha256!==sha(old))fail('HOTFIX_FILE_INVENTORY_MISMATCH '+relative);matches[0].size=bytes.length;matches[0].sha256=sha(bytes);changes.push({relative:'resources/backend/'+relative,old,bytes});
 }
 const newInventory=Buffer.from(JSON.stringify(rows,null,2)+'\n');manifest.inventorySHA256=sha(newInventory);if(manifest.hotfixes!==undefined&&!Array.isArray(manifest.hotfixes))fail('HOTFIX_MANIFEST_INVALID');manifest.hotfixes=[...(manifest.hotfixes??[]),id];changes.push({relative:'resources/backend/runtime-files.json',old:inventoryRaw,bytes:newInventory},{relative:'resources/backend/runtime-manifest.json',old:manifestRaw,bytes:Buffer.from(JSON.stringify(manifest,null,2)+'\n')});
 if(fs.existsSync(backup))fail('HOTFIX_BACKUP_ALREADY_EXISTS');fs.mkdirSync(backup);const plan={id,root,status:'preparing',files:changes.map((r,i)=>({relative:r.relative,original:sha(r.old),modified:sha(r.bytes),backup:i+'.bin'}))};
 for(let i=0;i<changes.length;i++)fs.writeFileSync(path.join(backup,i+'.bin'),changes[i].old,{flag:'wx'});atomic(record,Buffer.from(JSON.stringify(plan,null,2)));
 try{idle(root);for(const r of changes){const file=guard(root,r.relative);if(sha(fs.readFileSync(file))!==sha(r.old))fail('HOTFIX_CONCURRENT_CHANGE');atomic(file,r.bytes);}for(const r of plan.files)if(sha(fs.readFileSync(guard(root,r.relative)))!==r.modified)fail('HOTFIX_VERIFY_FAILED');const updated=parse(fs.readFileSync(manifestFile));if(updated.inventorySHA256!==sha(fs.readFileSync(inventoryFile)))fail('HOTFIX_INVENTORY_VERIFY_FAILED');plan.status='applied';atomic(record,Buffer.from(JSON.stringify(plan,null,2)));console.log('OWNER_HOTFIX_APPLIED files='+changes.length+' inventory=PASS data=UNTOUCHED restart=REQUIRED exit=0');}
 catch(error){restore(plan);plan.status='rolled-back';atomic(record,Buffer.from(JSON.stringify(plan,null,2)));throw error;}
}
module.exports={main};
if(require.main===module){try{main({action:process.argv[2]??'apply',installRoot:process.argv[3],packageRoot:__dirname});}catch(error){console.error(error.message);process.exitCode=1;}}
