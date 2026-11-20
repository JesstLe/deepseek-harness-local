'use strict';
// Shared code-only transaction used by CLI repair and the packaged desktop.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{createHash,randomUUID}=require('node:crypto');
function inventory(root){const result={};function visit(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,e.name);assert(!e.isSymbolicLink(),'LINKED_PLUGIN_REJECTED');if(e.isDirectory())visit(file);else if(e.isFile())result[path.relative(root,file).replaceAll('\\','/')]=hash(fs.readFileSync(file));}}visit(root);return result;}
const hash=b=>createHash('sha256').update(b).digest('hex');
const INERT_EXTRAS=['assets/bot-chat-model.js.queue-stop-before','assets/bot-groups.js.queue-stop-before'];
// Exact official files retired by the CUA/headless-business migrations. Never classify user/unknown code as removable.
const CUA_RETIRED={
 'assets/business-context-client.js':['b52012f7ab44bcf43ea595e72fc13d20e4f16c9d47027040226f049771982a27','b52012f7ab44bcf43ea595e72fc13d20e4f16c9d47027040226f049771982a27'],
 'agent-desktop.js':'2cb1839c9ae5350bc48aa8da5d7fbfa3156a0a512bcf239f7e0cf50da2a339d3',
 'skills/naumi-desktop/references/desktop-1.3.1.md':'abd913be10552c028e461e0a45c20e3734a7a1e5251fc2f9ef6fd63fdd606a6e',
 'skills/naumi-desktop/references/platform-1.3.1.md':'babc8d3f0583afc3f41b3b84cc775d3be24010043b57966755fcf9bda8880073'
};
const hashAt=file=>fs.existsSync(file)?hash(fs.readFileSync(file)):null;
function versionAt(root){if(!fs.existsSync(path.join(root,'product-version.js')))return null;const text=fs.readFileSync(path.join(root,'product-version.js'),'utf8'),m=text.match(/^export const PRODUCT_VERSION\s*=\s*(["'])(\d+\.\d+\.\d+)\1;\s*$/);assert(m,'SERVICE_VERSION_INVALID');return m[2];}
function planAlignment({source,target,allowedExtras=INERT_EXTRAS}){
 source=fs.realpathSync(source);target=fs.realpathSync(target);assert.notEqual(source.toLowerCase(),target.toLowerCase(),'SERVICE_SOURCE_EQUALS_TARGET');
 const expected=inventory(source),before=inventory(target),allExtras=Object.keys(before).filter(f=>!(f in expected)),pkg=path.join(source,'package.json'),version=versionAt(source),parts=version?.split('.').map(Number);
 const cua=expected['cua.js']&&expected['cua-runtime.js']&&fs.existsSync(pkg)&&JSON.parse(fs.readFileSync(pkg)).name==='@naumi/dsh-enterprise'&&parts&&(parts[0]>0||parts[1]>4||parts[1]===4&&parts[2]>=4);
 const retired=allExtras.filter(f=>cua&&(Array.isArray(CUA_RETIRED[f])?CUA_RETIRED[f].includes(before[f]):CUA_RETIRED[f]===before[f])),extras=allExtras.filter(f=>!retired.includes(f));for(const f of extras)assert(allowedExtras.includes(f),'SERVICE_UNKNOWN_EXTRA '+f);
 const files=[...Object.keys(expected).sort().map(file=>({file,original:before[file]??null,modified:expected[file]})),...retired.map(file=>({file,original:before[file],modified:null}))],changes=files.filter(r=>r.original!==r.modified);
 return {schemaVersion:1,source,target,version,previousVersion:versionAt(target),sourceFiles:Object.keys(expected).length,targetFiles:Object.keys(before).length,files,changes,extras:Object.fromEntries(extras.map(f=>[f,before[f]]))};
}
function assertBefore(plan){const current=inventory(plan.target),expected=Object.fromEntries([...plan.files.filter(r=>r.original).map(r=>[r.file,r.original]),...Object.entries(plan.extras)]);assert.deepEqual(current,expected,'SERVICE_TARGET_DRIFT');assert.deepEqual(inventory(plan.source),Object.fromEntries(plan.files.filter(r=>r.modified).map(r=>[r.file,r.modified])),'SERVICE_SOURCE_DRIFT');}
function verifyAligned(plan){const current=inventory(plan.target),expected=Object.fromEntries([...plan.files.filter(r=>r.modified).map(r=>[r.file,r.modified]),...Object.entries(plan.extras)]);assert.deepEqual(current,expected,'SERVICE_CODE_NOT_ALIGNED');assert.equal(versionAt(plan.target),plan.version);return {version:plan.version,sourceFiles:plan.sourceFiles,extrasPreserved:Object.keys(plan.extras).length};}
function atomic(file,bytes){const temp=file+'.service-'+randomUUID()+'.tmp';fs.mkdirSync(path.dirname(file),{recursive:true});try{fs.writeFileSync(temp,bytes,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
function restoreAlignment(plan,backup,{verifyCurrent=true}={}){
 if(verifyCurrent)for(const r of plan.changes)assert.equal(hashAt(path.join(plan.target,r.file)),r.modified,'SERVICE_ROLLBACK_DRIFT '+r.file);
 for(const r of plan.changes){const file=path.join(plan.target,r.file);if(r.original){const bytes=fs.readFileSync(path.join(backup,'original',r.file));assert.equal(hash(bytes),r.original);atomic(file,bytes);}else if(fs.existsSync(file))fs.unlinkSync(file);}
 const expected=Object.fromEntries([...plan.files.filter(r=>r.original).map(r=>[r.file,r.original]),...Object.entries(plan.extras)]);assert.deepEqual(inventory(plan.target),expected,'SERVICE_RESTORE_FAILED');
}
function applyAlignment(plan,backup,{beforeWrite=()=>{}}={}){
 assertBefore(plan);assert(!fs.existsSync(path.join(backup,'PLAN.json')),'SERVICE_BACKUP_EXISTS');fs.mkdirSync(backup,{recursive:true});
 for(const r of plan.changes)for(const [kind,root,expected]of [['original',plan.target,r.original],['modified',plan.source,r.modified]])if(expected){const file=path.join(backup,kind,r.file),bytes=fs.readFileSync(path.join(root,r.file));assert.equal(hash(bytes),expected);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 fs.writeFileSync(path.join(backup,'PLAN.json'),JSON.stringify(plan,null,2));
 // Never publish the release label before every required code file has landed.
 const ordered=[...plan.changes.filter(r=>r.file!=='product-version.js'),...plan.changes.filter(r=>r.file==='product-version.js')];
 try{for(const r of ordered){beforeWrite(r);if(r.modified)atomic(path.join(plan.target,r.file),fs.readFileSync(path.join(backup,'modified',r.file)));else fs.unlinkSync(path.join(plan.target,r.file));}return verifyAligned(plan);}catch(error){restoreAlignment(plan,backup,{verifyCurrent:false});throw error;}
}

module.exports={hash,INERT_EXTRAS,inventory,versionAt,planAlignment,assertBefore,applyAlignment,restoreAlignment,verifyAligned,atomic};
