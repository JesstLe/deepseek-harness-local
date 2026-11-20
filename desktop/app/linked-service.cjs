'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const profile=require('./profile.cjs'),code=require('./service-code.cjs');
const plugins=[['naumi-enterprise','dsh-enterprise'],['naumi-ui-layout','dsh-ui-layout'],['naumi-sidebar-browser','dsh-sidebar-browser']];
const nativeFiles=['dsh-client-ui-workspace/lib/client.js','dsh-client-ui-conversation/lib/client.js','dsh-client-ui-deliverables/lib/client.js','dsh-client-ui-input-trigger/lib/client.js','dsh-client-ui-sidebar-right/lib/client.js','dsh-client-ui-settings-general/lib/client.js','dsh-client-ui-model-selection/lib/client.js','dsh-llm-pi-ai/lib/index.js'];
const stateFile=home=>path.join(home,'desktop-linked-service.json');
function beneath(root,relative){assert(typeof relative==='string'&&!relative.includes('\\')&&!relative.split('/').some(p=>p==='..'||p==='.'||p===''),'SERVICE_PATH_INVALID');const file=path.resolve(root,relative);assert(file.startsWith(path.resolve(root)+path.sep),'SERVICE_PATH_ESCAPE');return file;}
function plainPath(file){for(let p=file;fs.existsSync(p);p=path.dirname(p)){assert(!fs.lstatSync(p).isSymbolicLink(),'SERVICE_LINKED_PATH');if(p===path.dirname(p))break;}return file;}
function release(root,version){
 root=fs.realpathSync(root);const runtime=profile.runtimeReference(root);assert.equal(runtime.version,version,'SERVICE_CLIENT_RELEASE_MISMATCH');const rows=JSON.parse(fs.readFileSync(path.join(root,'runtime-files.json'))),manifest=JSON.parse(fs.readFileSync(path.join(root,'runtime-manifest.json'))),index=new Map();
 for(const row of rows){const file=beneath(root,row.path);assert(!index.has(row.path),'SERVICE_DUPLICATE_INVENTORY');index.set(row.path,row);}
 const verify=relative=>{const row=index.get(relative);assert(row,'SERVICE_RELEASE_FILE_MISSING '+relative);const bytes=fs.readFileSync(plainPath(beneath(root,relative)));assert.equal(code.hash(bytes),row.sha256,'SERVICE_RELEASE_HASH '+relative);return bytes;};
 for(const [folder,name]of plugins){const expected=rows.filter(r=>r.path.startsWith('plugins/'+folder+'/'));assert(expected.length,'SERVICE_PLUGIN_MISSING');const actual=code.inventory(path.join(root,'plugins',folder));assert.equal(Object.keys(actual).length,expected.length,'SERVICE_RELEASE_EXTRA');for(const r of expected){verify(r.path);assert.equal(actual[r.path.slice(('plugins/'+folder+'/').length)],r.sha256);}}
 // Every staged native extension must participate in this same code transaction.
 for(const row of rows)if(row.path.startsWith('node_modules/@deepseek-ai/')&&row.path.endsWith('.naumi-original'))assert(nativeFiles.includes(row.path.slice('node_modules/@deepseek-ai/'.length,-'.naumi-original'.length)),'SERVICE_NATIVE_EXTENSION_UNTRACKED '+row.path);
 assert.equal(code.versionAt(path.join(root,'plugins/naumi-enterprise')),version,'SERVICE_RELEASE_LABEL_MISMATCH');for(const file of nativeFiles)verify('node_modules/@deepseek-ai/'+file);
 return {...runtime,manifest,verify};
}
function plan({root,home,releaseRoot,version}){
 root=fs.realpathSync(root);home=fs.realpathSync(home);assert.equal(path.resolve(home),path.join(root,'.dsh'),'SERVICE_HOME_NOT_LINKED_ROOT');const fixed=release(releaseRoot,version),manifest=fixed.manifest;
 assert.equal(JSON.parse(fs.readFileSync(path.join(root,'node_modules/@deepseek-ai/dsh/package.json'))).version,manifest.harness,'SERVICE_HARNESS_UPGRADE_REQUIRED');
 const plans=plugins.map(([folder,name])=>{const source=path.join(releaseRoot,'plugins',folder),target=plainPath(path.join(home,'profiles/web/node_modules/@naumi',name));assert.equal(fs.realpathSync(target),path.resolve(target),'SERVICE_PLUGIN_REDIRECT');const p=code.planAlignment({source,target});return {...p,name};});
 const native=nativeFiles.map(file=>{const relative='node_modules/@deepseek-ai/'+file,target=plainPath(beneath(root,relative)),bytes=fixed.verify(relative),old=fs.readFileSync(target);const packageName=file.split('/')[0],oldPackage=JSON.parse(fs.readFileSync(path.join(root,'node_modules/@deepseek-ai',packageName,'package.json'))),newPackage=JSON.parse(fixed.verify('node_modules/@deepseek-ai/'+packageName+'/package.json'));assert.equal(oldPackage.version,newPackage.version,'SERVICE_NATIVE_UPGRADE_REQUIRED');return {relative,target,source:beneath(releaseRoot,relative),before:code.hash(old),after:code.hash(bytes)};});
 return {version:1,root,home,releaseRoot:fixed.root,releaseVersion:version,bundleId:fixed.bundleId,plans,native,changed:plans.reduce((n,p)=>n+p.changes.length,0)+native.filter(n=>n.before!==n.after).length};
}
function readState(home){return fs.existsSync(stateFile(home))?JSON.parse(fs.readFileSync(stateFile(home))):null;}
function recover(home){
 const s=readState(home);if(!s||s.phase==='ready')return false;assert(s.version===1&&s.phase==='applying'&&s.plan.home===path.resolve(home),'SERVICE_JOURNAL_INVALID');
 for(const p of s.plan.plans){const backup=path.join(s.backup,p.name);if(fs.existsSync(path.join(backup,'PLAN.json'))){for(const row of p.changes){const file=path.join(p.target,row.file),actual=fs.existsSync(file)?code.hash(fs.readFileSync(file)):null;assert(actual===row.original||actual===row.modified,'SERVICE_RECOVERY_DRIFT');}code.restoreAlignment(p,backup,{verifyCurrent:false});}}
 for(const row of s.plan.native)if(row.before!==row.after){const saved=path.join(s.backup,'native',row.relative),bytes=fs.readFileSync(saved);assert.equal(code.hash(bytes),row.before);const actual=code.hash(fs.readFileSync(row.target));assert(actual===row.before||actual===row.after,'SERVICE_RECOVERY_DRIFT');code.atomic(row.target,bytes);}
 if(s.previous)profile.atomic(stateFile(home),s.previous);else fs.unlinkSync(stateFile(home));return true;
}
function synchronize(settings,{fault=()=>{}}={}){
 recover(settings.home);const p=plan({root:settings.root,home:settings.home,releaseRoot:settings.releaseRoot,version:settings.runtime.version});
 const previous=readState(settings.home);if(!p.changed&&previous?.phase==='ready'&&previous.bundleId===p.bundleId)return {changed:0,version:p.releaseVersion,bundleId:p.bundleId,backup:previous.backup};
 const backup=path.join(settings.home,'desktop-service-backups',randomUUID());fs.mkdirSync(backup,{recursive:true});
 for(const n of p.native)if(n.before!==n.after){const dest=path.join(backup,'native',n.relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,fs.readFileSync(n.target));}
 profile.atomic(stateFile(settings.home),{version:1,phase:'applying',plan:p,backup,previous});
 try{
  // Publish the service label last across all three plugins and native extensions.
  const ordered=[...p.plans.filter(x=>x.name!=='dsh-enterprise'),...p.plans.filter(x=>x.name==='dsh-enterprise')];
  for(const n of p.native)if(n.before!==n.after){assert.equal(code.hash(fs.readFileSync(n.target)),n.before,'SERVICE_NATIVE_DRIFT');const bytes=fs.readFileSync(n.source);assert.equal(code.hash(bytes),n.after,'SERVICE_RELEASE_DRIFT');code.atomic(n.target,bytes);fault('native');}
  for(const q of ordered)if(q.changes.length){code.applyAlignment(q,path.join(backup,q.name));fault(q.name);}
  for(const q of p.plans)code.verifyAligned(q);for(const n of p.native)assert.equal(code.hash(fs.readFileSync(n.target)),n.after);
  profile.atomic(stateFile(settings.home),{version:1,phase:'ready',releaseVersion:p.releaseVersion,bundleId:p.bundleId,releaseRoot:p.releaseRoot,backup});return {changed:p.changed,version:p.releaseVersion,bundleId:p.bundleId,backup};
 }catch(error){recover(settings.home);throw error;}
}
function readLink(userData){const file=path.join(userData,'backend-link.json');if(!fs.existsSync(file))return null;plainPath(file);const value=JSON.parse(fs.readFileSync(file));assert(typeof value.root==='string'&&path.isAbsolute(value.root),'SERVICE_LINK_INVALID');if(value.serviceUpdates!==undefined)assert(value.version===2&&value.serviceUpdates==='bundled'&&typeof value.home==='string'&&value.homeHash===profile.homeBinding(value.home),'SERVICE_LINK_INVALID');return value;}
function managedHome(userData){const link=readLink(userData);return link?.serviceUpdates==='bundled'?link.home:null;}
function acquire(root,kind){
 const file=path.join(root,'runtime/service-alignment.lock');fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.existsSync(file)){const bytes=fs.readFileSync(file);let old;try{old=JSON.parse(bytes);}catch{throw Error('SERVICE_UPDATE_BUSY');}assert(old.version===1&&['desktop-linked-update','desktop-linked-adoption'].includes(old.kind)&&Number.isInteger(old.pid)&&old.pid>0,'SERVICE_UPDATE_BUSY');let dead=false;try{process.kill(old.pid,0);}catch(e){dead=e.code==='ESRCH';}assert(dead,'SERVICE_UPDATE_BUSY');assert(fs.readFileSync(file).equals(bytes),'SERVICE_UPDATE_BUSY');fs.unlinkSync(file);}
 const value=JSON.stringify({version:1,pid:process.pid,kind,nonce:randomUUID()}),fd=fs.openSync(file,'wx');try{fs.writeFileSync(fd,value);}finally{fs.closeSync(fd);}return()=>{assert(fs.readFileSync(file,'utf8')===value,'SERVICE_LOCK_CHANGED');fs.unlinkSync(file);};
}
module.exports={acquire,stateFile,plan,release,synchronize,recover,readState,readLink,managedHome,nativeFiles};
