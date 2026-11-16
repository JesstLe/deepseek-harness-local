'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,randomBytes,createHash}=require('node:crypto');
const samePath=(a,b)=>path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
const exists=p=>{try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
function regular(p){if(exists(p)&&(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink()))throw Error('PROFILE_METADATA_INVALID');}
function read(p){regular(p);try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{throw Error('PROFILE_METADATA_INVALID');}}
function replaceMetadata(from,to){
 // Windows scanners/readers can temporarily deny delete sharing. Keep the fsynced candidate
 // intact and retry only the atomic rename; never delete the prior authoritative receipt.
 for(let attempt=0;;attempt++){try{fs.renameSync(from,to);return;}catch(error){if(process.platform!=='win32'||!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=7)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,Math.min(10*2**attempt,200));}}
}
function atomic(p,value){regular(p);const temp=p+'.'+randomUUID()+'.tmp';try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}replaceMetadata(temp,p);}finally{if(exists(temp))fs.unlinkSync(temp);}}
function directory(p){if(exists(p)&&(!fs.lstatSync(p).isDirectory()||fs.lstatSync(p).isSymbolicLink()))throw Error('PROFILE_DIRECTORY_UNMANAGED');fs.mkdirSync(p,{recursive:true});}
function identity(home){
 directory(home);const file=path.join(home,'desktop-instance.json');
 if(!exists(file))atomic(file,{version:1,id:randomUUID(),key:randomBytes(32).toString('hex')});
 const value=read(file);if(value.version!==1||!/^[0-9a-f-]{36}$/.test(value.id)||!/^[0-9a-f]{64}$/.test(value.key))throw Error('PROFILE_IDENTITY_INVALID');
 const homeHash=homeBinding(home);
 if(value.homeHash!==undefined&&value.homeHash!==homeHash)throw Error('PROFILE_HOME_RELOCATION_REQUIRES_MIGRATION');
 // Additive v1 metadata migration. Preserve the original UUID/key and every employee record.
 if(value.homeHash===undefined){value.homeHash=homeHash;atomic(file,value);}return value;
}
function homeBinding(home){let canonical=fs.realpathSync.native(home);if(process.platform==='win32')canonical=canonical.toLowerCase();return createHash('sha256').update('naumi-home-v1\0'+canonical).digest('hex');}
function runtimeReference(root){
 root=path.resolve(root);const manifest=read(path.join(root,'runtime-manifest.json'));
 if(manifest.product!=='Naumi'||manifest.schemaVersion!==2||manifest.desktop?.profileVersion!==1||manifest.desktop?.identityProtocol!==2||!/^[a-f0-9]{64}$/.test(manifest.inventorySHA256))throw Error('RUNTIME_DESKTOP_CONTRACT_UNSUPPORTED');
 if(createHash('sha256').update(fs.readFileSync(path.join(root,'runtime-files.json'))).digest('hex')!==manifest.inventorySHA256)throw Error('RUNTIME_INVENTORY_INVALID');
 if(createHash('sha256').update(fs.readFileSync(path.join(root,'node.exe'))).digest('hex')!==manifest.nodeSHA256)throw Error('RUNTIME_NODE_INVALID');
 if(!fs.statSync(path.join(root,'node_modules')).isDirectory())throw Error('RUNTIME_DEPENDENCIES_MISSING');
 return {root,nodeModules:path.join(root,'node_modules'),bundleId:manifest.inventorySHA256,version:manifest.version};
}
function linkTarget(p){if(!exists(p))return null;if(!fs.lstatSync(p).isSymbolicLink())throw Error('PROFILE_DEPENDENCIES_UNMANAGED');return path.resolve(path.dirname(p),fs.readlinkSync(p));}
function validReference(r){return r&&typeof r.root==='string'&&path.isAbsolute(r.root)&&r.nodeModules===path.join(r.root,'node_modules')&&/^[a-f0-9]{64}$/.test(r.bundleId)&&typeof r.version==='string';}
function profileState(home,id){
 const file=path.join(home,'desktop-profile.json');if(!exists(file))return null;
 const value=read(file);if(value.version!==1||value.ownerId!==id||!validReference(value.current)||value.previous!==null&&!validReference(value.previous))throw Error('PROFILE_STATE_UNSUPPORTED');return value;
}
function stateFile(home){return path.join(home,'desktop-profile.json');}
function journalFile(home){return path.join(home,'desktop-profile-journal.json');}
/** Main process single-instance lock and absence of a live backend are preconditions. No employee data is migrated. */
function recoverProfile(home,id){
 const journal=journalFile(home);if(!exists(journal))return false;
 const j=read(journal),profile=path.join(home,'profiles/web'),mount=path.join(profile,'node_modules');
 if(j.version!==1||j.ownerId!==id||!validReference(j.to)||j.from!==null&&!validReference(j.from)||!/^\.naumi-dependencies-[0-9a-f-]{36}$/.test(j.backup)||!['prepared','switched'].includes(j.phase))throw Error('PROFILE_JOURNAL_INVALID');
 const backup=path.join(profile,j.backup),current=linkTarget(mount),saved=linkTarget(backup),state=profileState(home,id);
 if(saved&&(!j.from||!samePath(saved,j.from.nodeModules)))throw Error('PROFILE_MIGRATION_STATE_CONFLICT');
 const committed=state?.current.bundleId===j.to.bundleId&&samePath(state.current.root,j.to.root)&&current&&samePath(current,j.to.nodeModules);
 if(committed){if(saved)fs.unlinkSync(backup);fs.unlinkSync(journal);return true;}
 if(current&&!samePath(current,j.to.nodeModules)&&(!j.from||!samePath(current,j.from.nodeModules)))throw Error('PROFILE_MIGRATION_STATE_CONFLICT');
 if(saved){if(current)fs.unlinkSync(mount);fs.renameSync(backup,mount);}
 else if(j.from){if(!current)fs.symlinkSync(j.from.nodeModules,mount,'junction');else if(!samePath(current,j.from.nodeModules))throw Error('PROFILE_MIGRATION_STATE_CONFLICT');}
 else if(current)fs.unlinkSync(mount);
 fs.unlinkSync(journal);return true;
}
function prepareProfile(settings,{fault=()=>{}}={}){
 const {home,identity:id,runtime:target}=settings,profile=path.join(home,'profiles/web');
 directory(home);directory(path.join(home,'profiles'));directory(profile);recoverProfile(home,id.id);
 const state=profileState(home,id.id),mount=path.join(profile,'node_modules'),current=linkTarget(mount);
 if(current&&(!state||!samePath(current,state.current.nodeModules))&&!samePath(current,target.nodeModules))throw Error('PROFILE_DEPENDENCIES_UNMANAGED');
 if(state&&current&&!samePath(current,state.current.nodeModules))throw Error('PROFILE_MIGRATION_STATE_CONFLICT');
 // Only the old default junction to this installation may be adopted without an ownership record.
 const from=state?.current??(current?target:null),changed=!current||!samePath(current,target.nodeModules),backup='.naumi-dependencies-'+randomUUID();
 const j={version:1,ownerId:id.id,from,to:target,backup,phase:'prepared'};atomic(journalFile(home),j);fault('prepared');
 try{
  if(changed){if(current)fs.renameSync(mount,path.join(profile,backup));fault('detached');fs.symlinkSync(target.nodeModules,mount,'junction');}
  atomic(journalFile(home),{...j,phase:'switched'});fault('switched');
  for(const [file,template]of [['package.json','profile.json'],['cordis.patch.yml','profile.yml']])if(!exists(path.join(profile,file)))fs.copyFileSync(path.join(target.root,'defaults',template),path.join(profile,file),fs.constants.COPYFILE_EXCL);
  if(!exists(path.join(home,'cordis.patch.yml')))fs.copyFileSync(path.join(target.root,'defaults/home.yml'),path.join(home,'cordis.patch.yml'),fs.constants.COPYFILE_EXCL);
  const previous=state&&(state.current.bundleId!==target.bundleId||!samePath(state.current.root,target.root))?state.current:state?.previous??null;
  atomic(stateFile(home),{version:1,ownerId:id.id,current:target,previous});fault('committed');
  if(exists(path.join(profile,backup)))fs.unlinkSync(path.join(profile,backup));fs.unlinkSync(journalFile(home));
  return {version:1,bundleId:target.bundleId,switched:changed,adopted:!state&&!!current};
 }catch(e){recoverProfile(home,id.id);throw e;}
}
function runtimeReceipt(home,id){
 const file=path.join(home,'desktop-backend.json');if(!exists(file))return null;const r=read(file);
 if(r.version!==1||r.ownerId!==id||!Number.isInteger(r.port)||r.port<1||r.port>65535||!['starting','ready'].includes(r.phase)||!(r.pid===null&&r.phase==='starting'||Number.isInteger(r.pid)&&r.pid>0)||!/^[a-f0-9]{64}$/.test(r.bundleId)||!/^[a-f0-9-]{36}$/.test(r.runId))throw Error('PROFILE_BACKEND_RECEIPT_INVALID');return r;
}
module.exports={identity,homeBinding,runtimeReference,prepareProfile,recoverProfile,runtimeReceipt,atomic,samePath,exists,profileState};
