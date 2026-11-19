'use strict';
// One-time adoption of a persisted local link. Never searches for or kills a guessed server.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto');
const assert=require('node:assert/strict'),profile=require('./profile.cjs'),service=require('./linked-service.cjs'),code=require('./service-code.cjs');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function processAt(pid){
 assert(Number.isInteger(pid)&&pid>0,'SERVICE_PID_INVALID');const shell=path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe');
 const script=`$ErrorActionPreference='Stop';$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}';if($p){@{pid=[int]$p.ProcessId;exe=$p.ExecutablePath;command=$p.CommandLine;created=$p.CreationDate.ToUniversalTime().ToString('O');ports=@(Get-NetTCPConnection -OwningProcess ${pid} -State Listen -ErrorAction SilentlyContinue|Select-Object -ExpandProperty LocalPort)}|ConvertTo-Json -Compress}`;
 const text=execFileSync(shell,['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-Command',script],{windowsHide:true,encoding:'utf8',timeout:10000}).trim();return text?JSON.parse(text):null;
}
function exactProcess(settings,process){const entry=path.join(settings.root,'node_modules/@deepseek-ai/dsh/lib/bin.js').replaceAll('\\','/').toLowerCase(),command=process?.command?.replaceAll('\\','/').toLowerCase(),port=Number(new URL(settings.url).port);assert(process&&typeof process.exe==='string'&&path.basename(process.exe).toLowerCase()==='node.exe'&&typeof process.created==='string','SERVICE_PROCESS_UNKNOWN');assert(command?.includes('"'+entry+'"')||command?.includes(' '+entry+' '),'SERVICE_PROCESS_UNKNOWN');assert(new RegExp('(?:^| )--port '+port+'(?: |$)').test(command)&&/--host 127\.0\.0\.1(?: |$)/.test(command)&&(process.ports??[]).includes(port),'SERVICE_PORT_OWNER_UNKNOWN');return process;}
async function idle(settings,{fetcher=fetch,launchFromLog}={}){
 const launch=launchFromLog(settings);assert(new URL(launch).searchParams.has('token'),'SERVICE_OWNER_SESSION_UNKNOWN');const auth=await fetcher(launch,{redirect:'manual',signal:AbortSignal.timeout(5000)});assert.equal(auth.status,303,'SERVICE_OWNER_SESSION_UNKNOWN');const cookie=auth.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert(cookie,'SERVICE_OWNER_SESSION_UNKNOWN');
 const read=async(url,body)=>{const r=await fetcher(settings.url+url,{headers:{cookie,'Content-Type':'application/json'},...body?{method:'POST',body:JSON.stringify(body)}:{},signal:AbortSignal.timeout(10000)});assert(r.ok,'SERVICE_ACTIVITY_UNKNOWN');return r.json();};
 const sessions=await read('/api/session/list',{type:'client-request',rpcId:randomUUID(),method:'session/list',payload:{args:{_request:{}}}}),tasks=await read('/naumi/bot-tasks?view=activity');assert(sessions.result?.ok&&Array.isArray(sessions.result.value?.items)&&Array.isArray(tasks.tasks),'SERVICE_ACTIVITY_UNKNOWN');assert(sessions.result.value.items.every(s=>s.running===false)&&tasks.tasks.every(t=>['completed','failed','cancelled','interrupted'].includes(t.status)),'INSTALL_RUNNING_TASKS');return {sessions:sessions.result.value.items.map(s=>s.sessionId??s.id).sort(),tasks:tasks.tasks.map(t=>[t.id,t.status])};
}
async function adopt(settings,{ensureBackend,stopBackend,launchFromLog,inspect=processAt,fetcher=fetch,stop=pid=>process.kill(pid),fault=()=>{}}={}){
 const release=service.acquire(settings.root,'desktop-linked-adoption');
 const linkBefore=fs.readFileSync(settings.linkFile),stateBefore=service.readState(settings.home);let old,stopped=false,result;
 try{
  service.plan({root:settings.root,home:settings.home,releaseRoot:settings.releaseRoot,version:settings.runtime.version});
  const identity=profile.identity(settings.home);settings.identity=identity;
  // A crash after a completed first start reattaches through its signed receipt, never SIGKILLs it.
  const receipt=profile.runtimeReceipt(settings.home,identity.id);
  if(!receipt){
   const pidFile=path.join(settings.root,'runtime/server.pid');if(fs.existsSync(pidFile)){const pid=Number(fs.readFileSync(pidFile,'utf8').trim());old=inspect(pid);if(old){exactProcess(settings,old);const before=await idle(settings,{fetcher,launchFromLog});fault('idle');assert.deepEqual(await idle(settings,{fetcher,launchFromLog}),before,'SERVICE_ACTIVITY_CHANGED');const current=exactProcess(settings,inspect(pid));assert.deepEqual(current,old,'SERVICE_PROCESS_CHANGED');stop(pid);stopped=true;for(let n=0;n<100&&inspect(pid);n++)await delay(50);assert(!inspect(pid),'SERVICE_STOP_UNKNOWN');}}
  }
  fault('stopped');const linked={...settings,linkedService:true,serviceLease:true,node:path.join(settings.releaseRoot,'node.exe'),workspace:settings.root};result=await ensureBackend(linked);
  assert(result.instanceVerified&&result.owned,'SERVICE_NEW_INSTANCE_UNKNOWN');assert(fs.readFileSync(settings.linkFile).equals(linkBefore),'SERVICE_LINK_CHANGED');
  profile.atomic(settings.linkFile,{version:2,root:settings.root,home:settings.home,homeHash:identity.homeHash,serviceUpdates:'bundled'});Object.assign(settings,linked);delete settings.serviceLease;delete settings.linkedServiceCandidate;
  return result;
 }catch(error){
  if(result)await stopBackend(result);const state=service.readState(settings.home);
  if(state?.phase==='ready'&&state!==stateBefore&&state.backup&&stopped){
   // Restore only the just-applied code transaction; data/config never entered it.
   const backup=state.backup;for(const [folder,name]of [['naumi-enterprise','dsh-enterprise'],['naumi-ui-layout','dsh-ui-layout'],['naumi-sidebar-browser','dsh-sidebar-browser']]){const file=path.join(backup,name,'PLAN.json');if(fs.existsSync(file))code.restoreAlignment(JSON.parse(fs.readFileSync(file)),path.dirname(file));}
   // Native originals are retained with exact names in this transaction's backup.
   for(const relative of service.nativeFiles){const source=path.join(backup,'native/node_modules/@deepseek-ai',relative);if(fs.existsSync(source))code.atomic(path.join(settings.root,'node_modules/@deepseek-ai',relative),fs.readFileSync(source));}
   if(stateBefore)profile.atomic(service.stateFile(settings.home),stateBefore);else fs.unlinkSync(service.stateFile(settings.home));
  }
  if(stopped){const receiptFile=path.join(settings.home,'desktop-backend.json');if(fs.existsSync(receiptFile))fs.unlinkSync(receiptFile);const restored=await ensureBackend({...settings,linkedService:false,linkedServiceCandidate:false,runtime:undefined,identity:undefined,node:old.exe});if(restored.child?.pid)fs.writeFileSync(path.join(settings.root,'runtime/server.pid'),String(restored.child.pid));}
  throw error;
 }finally{release();}
}
module.exports={adopt,idle,processAt,exactProcess};
