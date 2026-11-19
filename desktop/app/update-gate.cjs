'use strict';
/** Admission only. External backends are observed, never quiesced/stopped by a linked client update. */
async function admitUpdate({settings,backend,prepared=false,busy=false,maintenance=false,request,quiesce,resume}){
 if(prepared)return {ok:true,release:async()=>{}};
 if(busy)return {ok:false,reason:'WORKSPACE_OPERATIONS_IN_FLIGHT'};
 if(maintenance)return {ok:false,reason:'INSTALL_MAINTENANCE_ACTIVE'};
 if(!settings||!backend)return {ok:false,reason:'INSTALL_ACTIVITY_UNKNOWN'};
 if((settings.isolated||settings.linkedService)&&backend.owned){try{await quiesce();return {ok:true,mode:'owned',release:resume};}catch{return {ok:false,reason:'INSTALL_ACTIVITY_UNKNOWN'};}}
 if(settings.isolated||settings.linkedService||backend.owned)return {ok:false,reason:'INSTALL_ACTIVITY_UNKNOWN'};
 try{
  const response=await request(settings.url+'/api/session/list',{method:'POST',credentials:'include',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:require('node:crypto').randomUUID(),method:'session/list',payload:{args:{_request:{}}}}),signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw Error('UNKNOWN');const value=await response.json(),rows=value.result?.value?.items;if(!value.result?.ok||!Array.isArray(rows)||rows.some(s=>typeof s.running!=='boolean'))throw Error('UNKNOWN');
  const tasks=await request(settings.url+'/naumi/bot-tasks?view=activity',{credentials:'include',redirect:'error',signal:AbortSignal.timeout(5000)});if(!tasks.ok)throw Error('UNKNOWN');const jobs=(await tasks.json()).tasks;if(!Array.isArray(jobs)||jobs.some(t=>!['queued','starting','running','waiting','completed','failed','cancelled','interrupted'].includes(t.status)))throw Error('UNKNOWN');
  if(rows.some(s=>s.running)||jobs.some(t=>['queued','starting','running','waiting'].includes(t.status)))return {ok:false,reason:'WORKSPACE_RUNNING_TASKS'};
  return {ok:true,mode:'external',release:async()=>{}};
 }catch{return {ok:false,reason:'INSTALL_ACTIVITY_UNKNOWN'};}
}
module.exports={admitUpdate};
