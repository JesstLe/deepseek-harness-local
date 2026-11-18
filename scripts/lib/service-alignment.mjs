// Code-only service alignment. Business/config files never enter the plan.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';
import {inventory} from '../repair-desktop-update-entry.mjs';
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const INERT_EXTRAS=['assets/bot-chat-model.js.queue-stop-before','assets/bot-groups.js.queue-stop-before'];
export function versionAt(root){const text=fs.readFileSync(path.join(root,'product-version.js'),'utf8'),m=text.match(/^export const PRODUCT_VERSION\s*=\s*(["'])(\d+\.\d+\.\d+)\1;\s*$/);assert(m,'SERVICE_VERSION_INVALID');return m[2];}
export function planAlignment({source,target,allowedExtras=INERT_EXTRAS}){
 source=fs.realpathSync(source);target=fs.realpathSync(target);assert.notEqual(source.toLowerCase(),target.toLowerCase(),'SERVICE_SOURCE_EQUALS_TARGET');
 const expected=inventory(source),before=inventory(target),extras=Object.keys(before).filter(f=>!(f in expected));for(const f of extras)assert(allowedExtras.includes(f),'SERVICE_UNKNOWN_EXTRA '+f);
 const files=Object.keys(expected).sort().map(file=>({file,original:before[file]??null,modified:expected[file]})),changes=files.filter(r=>r.original!==r.modified);
 return {schemaVersion:1,source,target,version:versionAt(source),previousVersion:versionAt(target),sourceFiles:files.length,targetFiles:Object.keys(before).length,files,changes,extras:Object.fromEntries(extras.map(f=>[f,before[f]]))};
}
export function assertBefore(plan){const current=inventory(plan.target),expected=Object.fromEntries([...plan.files.filter(r=>r.original).map(r=>[r.file,r.original]),...Object.entries(plan.extras)]);assert.deepEqual(current,expected,'SERVICE_TARGET_DRIFT');assert.deepEqual(inventory(plan.source),Object.fromEntries(plan.files.map(r=>[r.file,r.modified])),'SERVICE_SOURCE_DRIFT');}
export function verifyAligned(plan){const current=inventory(plan.target),expected=Object.fromEntries([...plan.files.map(r=>[r.file,r.modified]),...Object.entries(plan.extras)]);assert.deepEqual(current,expected,'SERVICE_CODE_NOT_ALIGNED');assert.equal(versionAt(plan.target),plan.version);return {version:plan.version,sourceFiles:plan.files.length,extrasPreserved:Object.keys(plan.extras).length};}
function atomic(file,bytes){const temp=file+'.service-'+randomUUID()+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
export function restoreAlignment(plan,backup,{verifyCurrent=true}={}){
 if(verifyCurrent)for(const r of plan.changes)assert.equal(hash(fs.readFileSync(path.join(plan.target,r.file))),r.modified,'SERVICE_ROLLBACK_DRIFT '+r.file);
 for(const r of plan.changes){const file=path.join(plan.target,r.file);if(r.original){const bytes=fs.readFileSync(path.join(backup,'original',r.file));assert.equal(hash(bytes),r.original);atomic(file,bytes);}else if(fs.existsSync(file))fs.unlinkSync(file);}
 const expected=Object.fromEntries([...plan.files.filter(r=>r.original).map(r=>[r.file,r.original]),...Object.entries(plan.extras)]);assert.deepEqual(inventory(plan.target),expected,'SERVICE_RESTORE_FAILED');
}
export function applyAlignment(plan,backup,{beforeWrite=()=>{}}={}){
 assertBefore(plan);assert(!fs.existsSync(path.join(backup,'PLAN.json')),'SERVICE_BACKUP_EXISTS');fs.mkdirSync(backup,{recursive:true});
 for(const r of plan.changes)for(const [kind,root,expected]of [['original',plan.target,r.original],['modified',plan.source,r.modified]])if(expected){const file=path.join(backup,kind,r.file),bytes=fs.readFileSync(path.join(root,r.file));assert.equal(hash(bytes),expected);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 fs.writeFileSync(path.join(backup,'PLAN.json'),JSON.stringify(plan,null,2));
 // Never publish the release label before every required code file has landed.
 const ordered=[...plan.changes.filter(r=>r.file!=='product-version.js'),...plan.changes.filter(r=>r.file==='product-version.js')];
 try{for(const r of ordered){beforeWrite(r);atomic(path.join(plan.target,r.file),fs.readFileSync(path.join(backup,'modified',r.file)));}return verifyAligned(plan);}catch(error){restoreAlignment(plan,backup,{verifyCurrent:false});throw error;}
}
