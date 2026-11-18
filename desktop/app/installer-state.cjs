'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto'),{execFileSync}=require('node:child_process');
const {atomic,exists}=require('./profile.cjs');
const canonical=p=>{let value=exists(p)?fs.realpathSync.native(p):path.resolve(p);return process.platform==='win32'?value.toLowerCase():value;};
function plain(file){if(!exists(file))return null;const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>1024*1024)throw Error('INSTALL_METADATA_INVALID');try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('INSTALL_METADATA_INVALID');}}
function inventory(){
 const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const result=execFileSync(shell,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',"$ErrorActionPreference='Stop';@(Get-CimInstance Win32_Process | ForEach-Object {@{pid=[int]$_.ProcessId;parent=[int]$_.ParentProcessId;exe=$_.ExecutablePath;created=$_.CreationDate.ToUniversalTime().ToString('O')}}) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true,maxBuffer:4e6});
 const records=JSON.parse(result);if(!Array.isArray(records))throw Error('INSTALL_PROCESS_INVENTORY_UNKNOWN');return records;
}
const same=(a,b)=>!!a&&!!b&&a.pid===b.pid&&a.created===b.created&&typeof a.exe==='string'&&typeof b.exe==='string'&&a.exe.toLowerCase()===b.exe.toLowerCase();
function locations(root,local=process.env.LOCALAPPDATA){
 if(!local||!path.isAbsolute(root))throw Error('INSTALL_ROOT_INVALID');const id=createHash('sha256').update(canonical(root)).digest('hex'),base=path.join(local,'Naumi','installations',id);
 for(const dir of[path.join(local,'Naumi'),path.join(local,'Naumi','installations'),base]){if(exists(dir)&&(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink()))throw Error('INSTALL_METADATA_INVALID');}
 return {base,profiles:path.join(base,'profiles.json'),lease:path.join(base,'maintenance.json'),root:canonical(root)};
}
function readLease(loc){const lease=plain(loc.lease);if(lease&&(lease.version!==1||lease.root!==loc.root||!Number.isInteger(lease.owner?.pid)||typeof lease.owner?.created!=='string'||typeof lease.owner?.exe!=='string'))throw Error('INSTALL_LEASE_INVALID');return lease;}
function assertStartupAllowed(root,{local,inspect=inventory}={}){const loc=locations(root,local),lease=readLease(loc);if(lease&&same(lease.owner,inspect().find(p=>p.pid===lease.owner.pid)))throw Error('INSTALL_MAINTENANCE_ACTIVE');return loc;}
function registerProfile(root,userData,{local,inspect=inventory}={}){
 const loc=assertStartupAllowed(root,{local,inspect});fs.mkdirSync(loc.base,{recursive:true});const previous=plain(loc.profiles);if(previous&&(previous.version!==1||previous.root!==loc.root||!Array.isArray(previous.profiles)||previous.profiles.length>64||previous.profiles.some(p=>typeof p!=='string'||!path.isAbsolute(p))))throw Error('INSTALL_PROFILE_INDEX_INVALID');
 const profiles=[...new Set([...(previous?.profiles??[]),canonical(userData)])];if(profiles.length>64)throw Error('INSTALL_PROFILE_INDEX_FULL');atomic(loc.profiles,{version:1,root:loc.root,profiles});return loc;
}
function acquireLease(root,{ownerPid,targetVersion,workspaceProtocol=1,local,inspect=inventory}={}){
 const loc=locations(root,local);fs.mkdirSync(loc.base,{recursive:true});const records=inspect(),owner=records.find(p=>p.pid===ownerPid);if(!owner?.exe||!owner.created)throw Error('INSTALL_OWNER_UNKNOWN');
 const prior=readLease(loc);if(prior&&same(prior.owner,records.find(p=>p.pid===prior.owner.pid))){
  let current=owner;const seen=new Set();while(current&&!seen.has(current.pid)){if(same(current,prior.owner))return {...loc,record:prior,joined:true};seen.add(current.pid);current=records.find(p=>p.pid===current.parent);}
  throw Error('INSTALL_MAINTENANCE_BUSY');
 }
 if(prior)fs.unlinkSync(loc.lease);
 const lease={version:1,root:loc.root,owner:{pid:owner.pid,created:owner.created,exe:owner.exe},targetVersion,workspaceProtocol,startedAt:new Date().toISOString()};const fd=fs.openSync(loc.lease,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(lease,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return {...loc,record:lease,joined:false};
}
function releaseLease(loc){const current=readLease(loc);if(current&&same(current.owner,loc.record.owner)&&!loc.joined)fs.unlinkSync(loc.lease);}
module.exports={canonical,plain,inventory,same,locations,readLease,assertStartupAllowed,registerProfile,acquireLease,releaseLease};
