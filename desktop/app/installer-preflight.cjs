'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomBytes}=require('node:crypto');
const state=require('./installer-state.cjs'),profile=require('./profile.cjs'),{readWorkspaces,homeFor}=require('./workspaces.cjs'),{readConnection}=require('./enterprise.cjs'),{maintenanceRequest}=require('./backend.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function preflight({root,userData,ownerPid,mode='install',targetVersion,local,inspect=state.inventory,request=fetch,backendRequest=maintenanceRequest,waitMs=20000}){
 root=path.resolve(root);if(!path.isAbsolute(userData)||!['install','uninstall','replace'].includes(mode))throw Error('INSTALL_ARGUMENT_INVALID');
 const loc=state.locations(root,local),prior=state.readLease(loc),records=inspect();
 const index=state.plain(loc.profiles);if(index&&(index.version!==1||index.root!==loc.root||!Array.isArray(index.profiles)||index.profiles.length>64||index.profiles.some(p=>typeof p!=='string'||!path.isAbsolute(p))))throw Error('INSTALL_PROFILE_INDEX_INVALID');
 const profiles=[...new Set([userData,...(index?.profiles??[])].map(state.canonical))],homes=[];
 for(const data of profiles){const selected=readWorkspaces(data);if(mode==='replace'&&selected.active!=='default'&&!(prior&&prior.workspaceProtocol>=1&&state.same(prior.owner,records.find(p=>p.pid===prior.owner.pid))))throw Error('INSTALL_LEGACY_WORKSPACE_DOWNGRADE');for(const entry of[{id:'default'},...selected.entries.filter(x=>x.id!=='default')]){const home=homeFor(data,entry.id);if(profile.exists(home)&&(!fs.lstatSync(home).isDirectory()||fs.lstatSync(home).isSymbolicLink()))throw Error('INSTALL_PROFILE_DIRECTORY_INVALID');homes.push(home);}}
 for(const data of profiles){const linked=require('./linked-service.cjs').managedHome(data);if(linked&&!homes.includes(linked))homes.push(linked);}
 const lease=state.acquireLease(root,{ownerPid,targetVersion,workspaceProtocol:mode==='install'?1:0,local,inspect}),ticket=randomBytes(32).toString('hex'),prepared=[],covered=new Set();
 async function gui(bridge,action){const r=await request('http://127.0.0.1:'+bridge.port+'/maintenance',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+bridge.token,'x-naumi-maintenance-ticket':ticket,'x-naumi-maintenance-action':action},signal:AbortSignal.timeout(5000)});const result=await r.json();if(!r.ok||result.maintenanceProtocol!==1||result.pid!==bridge.pid)throw Error(/^INSTALL_[A-Z_]+$/.test(result.error??'')?result.error:'INSTALL_GUI_MAINTENANCE_UNKNOWN');}
 try{
  for(const home of homes){
   const identity=state.plain(path.join(home,'desktop-instance.json'));if(!identity)continue;
   if(identity.version!==1||identity.homeHash!==profile.homeBinding(home))throw Error('INSTALL_PROFILE_IDENTITY_INVALID');
   const receipt=profile.runtimeReceipt(home,identity.id),bridge=state.plain(path.join(home,'naumi-desktop-bridge.json'));
   if(bridge&&records.some(p=>p.pid===bridge.pid)){
    if(bridge.version!==1||!/^[a-f0-9]{64}$/.test(bridge.token)||!Number.isInteger(bridge.port)||bridge.port<1||bridge.port>65535)throw Error('INSTALL_GUI_RECEIPT_INVALID');
    const process=records.find(p=>p.pid===bridge.pid);if(!process.exe||state.canonical(process.exe)!==state.canonical(path.join(root,'Naumi.exe')))throw Error('INSTALL_GUI_OWNERSHIP_UNKNOWN');
    if(covered.has(bridge.pid))continue;await gui(bridge,'quiesce');prepared.push({bridge});covered.add(bridge.pid);if(receipt?.pid)covered.add(receipt.pid);
   }else if(receipt&&(receipt.pid===null||records.some(p=>p.pid===receipt.pid))){
    if(receipt.pid===null)throw Error('INSTALL_BACKEND_START_UNKNOWN');const process=records.find(p=>p.pid===receipt.pid);
    if(!process.exe||state.canonical(process.exe)!==state.canonical(path.join(root,'resources/backend/node.exe')))throw Error('INSTALL_BACKEND_OWNERSHIP_UNKNOWN');
    const settings={home,identity,url:'http://127.0.0.1:'+receipt.port,enterpriseOrigin:readConnection(home)?.origin??''};
    const result=await backendRequest(settings,'quiesce',ticket);if(result.pid!==receipt.pid)throw Error('INSTALL_BACKEND_IDENTITY_CHANGED');prepared.push({settings});covered.add(receipt.pid);
   }
  }
  const beneath=p=>p.exe&&state.canonical(p.exe).startsWith(loc.root+path.sep);
  if(records.some(p=>beneath(p)&&!covered.has(p.pid)&&p.pid!==ownerPid)){
   // Electron renderer/GPU children belong to a proven GUI; any other process remains unknown.
   const owned=p=>{const seen=new Set();while(p&&!seen.has(p.pid)){if(covered.has(p.pid))return true;seen.add(p.pid);p=records.find(x=>x.pid===p.parent);}return false;};
   if(records.some(p=>beneath(p)&&p.pid!==ownerPid&&!owned(p)))throw Error('INSTALL_UNREGISTERED_PROCESS');
  }
  for(const p of prepared)if(p.bridge)await gui(p.bridge,'stop');else await backendRequest(p.settings,'quiesce-stop',ticket);
  const end=Date.now()+waitMs;for(;;){const current=inspect();if(!current.some(p=>beneath(p)&&p.pid!==ownerPid))break;if(Date.now()>=end)throw Error('INSTALL_PROCESS_EXIT_UNKNOWN');await sleep(100);}
  return {status:'PASS',profiles:profiles.length,homes:homes.length,quiesced:prepared.length,lease};
 }catch(error){for(const p of prepared.reverse())try{if(p.bridge)await gui(p.bridge,'resume');else await backendRequest(p.settings,'resume',ticket);}catch{}state.releaseLease(lease);throw error;}
}
module.exports={preflight};
if(require.main===module){const[root,userData,mode,targetVersion,pid]=process.argv.slice(2);if(mode==='finish'){const loc=state.locations(root),lease=state.readLease(loc);if(lease&&lease.owner.pid===Number(pid))state.releaseLease({...loc,record:lease,joined:false});console.log('INSTALL_MAINTENANCE_FINISHED');}else preflight({root,userData,mode,targetVersion,ownerPid:Number(pid)}).then(r=>console.log('INSTALL_PREFLIGHT profiles='+r.profiles+' homes='+r.homes+' quiesced='+r.quiesced+' processes=stopped lease=held'),error=>{console.error(/^INSTALL_[A-Z_]+$/.test(error.message)?error.message:'INSTALL_PREFLIGHT_FAILED');process.exitCode=42;});}
