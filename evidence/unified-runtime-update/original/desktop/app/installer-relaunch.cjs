'use strict';
// Read-only completion proof. Installed files or ShellExecute success alone do
// not prove the new desktop finished booting. Never launch/kill a process here.
const fs=require('node:fs'),path=require('node:path');
const state=require('./installer-state.cjs');
function begin(file,root,version,{now=Date.now(),userData=path.join(process.env.APPDATA||'', 'Naumi')}={}){
 if(!path.isAbsolute(root)||!path.isAbsolute(userData)||!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version))throw Error('UPDATE_PROOF_INVALID');
 const proof={version:1,root:state.canonical(root),targetVersion:version,startedAt:now,userData:path.resolve(userData)};
 fs.writeFileSync(file,JSON.stringify(proof));return proof;
}
function check(file,{inspect=state.inventory,now=Date.now()}={}){
 const proof=state.plain(file);
 if(!proof||proof.version!==1||!path.isAbsolute(proof.root)||!path.isAbsolute(proof.userData)||!Number.isFinite(proof.startedAt)||proof.startedAt>now)throw Error('UPDATE_PROOF_INVALID');
 const r=state.plain(path.join(proof.userData,'desktop-runtime.json'));
 if(!r||r.version!==1||r.clientVersion!==proof.targetVersion||!Number.isInteger(r.pid)||r.pid<=0||typeof r.executable!=='string'||!Number.isFinite(Date.parse(r.readyAt))||Date.parse(r.readyAt)<proof.startedAt)return false;
 const expected=state.canonical(path.join(proof.root,'Naumi.exe'));
 if(state.canonical(r.executable)!==expected)return false;
 const p=inspect().find(p=>p.pid===r.pid);
 return !!(p?.exe&&state.canonical(p.exe)===expected&&Number.isFinite(Date.parse(p.created))&&Date.parse(p.created)>=proof.startedAt&&Date.parse(p.created)<=Date.parse(r.readyAt));
}
module.exports={begin,check};
if(require.main===module){
 try{const[mode,file,root,version]=process.argv.slice(2);
  if(mode==='begin'){begin(file,root,version);console.log('UPDATE_LAUNCH_PROOF_STARTED');}
  else if(mode==='check'){const ready=check(file);console.log(ready?'UPDATE_NEW_DESKTOP_READY':'UPDATE_DESKTOP_NOT_READY');process.exitCode=ready?0:10;}
  else throw Error('UPDATE_PROOF_INVALID');
 }catch{console.error('UPDATE_LAUNCH_PROOF_UNKNOWN');process.exitCode=20;}
}
