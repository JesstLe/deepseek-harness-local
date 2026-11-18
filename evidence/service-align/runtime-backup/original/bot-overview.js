import {displaySessionTitle,taskTitle,installBotTitles} from './bot-titles.js';
/** Read-only owner projection. Native Session identities own thread links. */
export async function botOverview(directory,service,botId){
 const bot=directory.list().bots.find(b=>b.id===botId);if(!bot)throw Error('BOT_NOT_FOUND');
 const doc=service.store.read(),related=new Set(doc.tasks.filter(t=>[t.sourceBotId,t.targetBotId].includes(botId)).map(t=>t.id));
 // A task keeps its whole delegated tree even when a later hop no longer names this Bot.
 for(let size=-1;size!==related.size;){size=related.size;for(const t of doc.tasks)if(related.has(t.parentTaskId))related.add(t.id);}
 const jobs=doc.tasks.filter(t=>related.has(t.id));
 const ids=[...new Set([...jobs.map(t=>t.targetSessionId),...bot.sessionIds])],stored=new Map();let partial=false;
 for(const id of ids){try{stored.set(id,await service.runtime.snapshot(id));}catch{stored.set(id,null);partial=true;}}
 const tasks=[];let remaining=256;
 for(const t of jobs){
  let tree={threads:[],partial:false};
  if(service.runtime.threads&&stored.get(t.targetSessionId)){
   if(remaining>0){try{tree=await service.runtime.threads(t.targetSessionId,{limit:Math.min(128,remaining)});remaining-=tree.threads.length;}catch{tree.partial=true;}}
   else tree.partial=true;
  }
  partial||=tree.partial;
  tasks.push({id:t.id,parentTaskId:t.parentTaskId,executionKind:t.executionKind,sourceBotId:t.sourceBotId,sourceSessionId:t.sourceSessionId,targetBotId:t.targetBotId,targetSessionId:t.targetSessionId,status:t.status,revision:t.revision,attempt:t.attempt,updatedAt:t.updatedAt,createdAt:t.createdAt,task:t.task.slice(0,512),progress:t.progress?.slice(0,160),delivery:t.delivery,deliveryHistory:t.deliveryHistory,workGoal:t.workGoal,workGoalUpdates:t.workGoalUpdates,title:displaySessionTitle(stored.get(t.targetSessionId),t.task),subject:displaySessionTitle(stored.get(t.targetSessionId),t.task),threads:tree.threads,threadsPartial:tree.partial});
 }
 const jobIds=new Set(doc.tasks.map(t=>t.targetSessionId));
 const sessions=bot.sessionIds.filter(id=>id!==bot.homeSessionId&&!jobIds.has(id)).flatMap(id=>{
  const s=stored.get(id);if(!s)return [];
  const messages=s.events.filter(e=>e.type==='user/message'&&e.data.source?.kind==='user');if(!messages.length)return [];
  return [{sessionId:id,title:displaySessionTitle(s),updatedAt:s.events.at(-1)?.timestamp??s.header.createdAt??'',files:s.events.filter(e=>e.type==='deliverables/presented').flatMap(e=>e.data.files.map((f,index)=>({...f,sessionId:id,seq:e.seq,index,turn:e.data.turn})))}];
 });
 return {botId,revision:doc.revision,tasks,sessions,partial};
}
export function installBotOverview(ctx,directory,service){installBotTitles(ctx,directory,service);return ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/naumi/bot-overview',handler:async(req,res)=>{res.setHeader('Cache-Control','private, no-store');const a=ctx.connection.admit(req);if('rejection'in a){res.writeHead(a.rejection).end();return;}if(a.peer.principal.kind!=='owner'){res.writeHead(403).end();return;}if(req.method!=='GET'){res.writeHead(405).end();return;}try{const id=new URL(req.url,'http://localhost').searchParams.get('botId');const v=await botOverview(directory,service,id);res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(v));}catch(e){res.writeHead(e.message==='BOT_NOT_FOUND'?404:503,{'Content-Type':'application/json'}).end(JSON.stringify({error:e.message==='BOT_NOT_FOUND'?e.message:'BOT_OVERVIEW_UNAVAILABLE'}));}}}));}
