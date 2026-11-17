export const MODE_KEY='naumi.navigationMode.v1';
export const navigationMode=value=>value==='bot'?'bot':'threads';
export function botForSession(bots,sessionId){return bots.find(bot=>bot.sessionIds.includes(sessionId))??null;}
export function botSessions(bot,sessions,workspaces){return bot.sessionIds.filter(id=>sessions.byId[id]&&!workspaces?.archivedSessionIds?.includes(id)).map(id=>({...sessions.byId[id],sessionId:id}));}
export function botTarget(bot,sessions,status,workspaces){
  const rows=botSessions(bot,sessions,workspaces);return rows.find(s=>status.get(s.sessionId)?.running??s.running)?.sessionId??rows.at(-1)?.sessionId??null;
}
export function currentSessionId(sessions,activePanelId){return activePanelId!==null?null:Object.values(sessions.byId).find(row=>(row.retainedBy?.mainView??0)>0)?.id??null;}
export function botSelected(bot,sessionId,sessions){return bot.sessionIds.includes(sessionId)||bot.sessionIds.some(id=>sessions.projectionsBySession[id]?.values.agentTeam?.members.some(member=>member.id===sessionId));}
export function botActivity(bot,sessions,status){
  const ids=new Set(bot.sessionIds);for(const id of bot.sessionIds)for(const m of sessions.projectionsBySession[id]?.values.agentTeam?.members??[])ids.add(m.id);
  let known=false,running=false;for(const id of ids){const state=status.get(id);if(state?.pendingInteraction)return 'waiting';const active=state?.running??sessions.byId[id]?.running;if(typeof active==='boolean')known=true;if(active)running=true;}
  return running?'running':known?'idle':'unknown';
}
export function botSummary(bot,sessions){
  for(const id of [...bot.sessionIds].reverse()){
    const values=sessions.projectionsBySession[id]?.values??sessions.byId[id]?.projections?.values;
    const active=values?.agentTeam?.tasks?.find(t=>t.status==='in_progress');if(active)return active.subject;
  }
  const rows=botSessions(bot,sessions),last=rows.at(-1);return last?(sessions.projectionsBySession[last.sessionId]?.values.title??last.projections?.values?.title??'新任务'):'暂无任务';
}
export function botTone(id){let hash=0;for(const char of id)hash=(hash*31+char.charCodeAt(0))>>>0;return ['violet','blue','green','orange'][hash%4];}
export function newBotTaskRequest(bot,workspaces){
  const normalize=value=>value?.replaceAll('\\','/').replace(/\/$/,'').toLocaleLowerCase();
  const workspace=workspaces.items.find(w=>normalize(w.path)===normalize(bot.cwd));
  return {...(workspace?{workspaceId:workspace.workspaceId}:{cwd:bot.cwd}),...(bot.agentPreset?{agentPreset:bot.agentPreset}:{})};
}

/** One shared subscription for the sidebar and right panel. Never polls or writes names from the browser. */
export function createBotCatalog({fetcher=globalThis.fetch,eventSource=url=>new EventSource(url),windowTarget=globalThis.window}={}){
  const listeners=new Set();let snapshot={status:'idle',bots:[],revision:0},controller=null,events=null,epoch=0,started=false,pending=null,again=false;
  const publish=value=>{snapshot=value;for(const listener of listeners)listener();};
  const stopEvents=()=>{events?.close();events=null;};
  const refresh=()=>{
    if(!started)return Promise.resolve();
    if(pending){again=true;return pending;}
    const generation=epoch;controller=new AbortController();publish({...snapshot,status:'loading'});
    pending=Promise.resolve().then(async()=>{
      do{
        again=false;
        try{
          const response=await fetcher('/naumi/bots',{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
          if(generation!==epoch)return;
          if(!response.ok){if(response.status===401||response.status===403){stopEvents();publish({status:'forbidden',bots:[],revision:0});}else publish({...snapshot,status:'error'});return;}
          const value=await response.json();if(generation!==epoch)return;
          if(value.version!==1||!Array.isArray(value.bots))throw Error('BOT_DIRECTORY_INVALID');
          publish({status:'ready',bots:value.bots,revision:value.revision});
          if(started&&!events){events=eventSource('/naumi/bots/events');events.onmessage=()=>void refresh();events.onerror=()=>{if(started&&generation===epoch){stopEvents();publish({...snapshot,status:'error'});void refresh();}};}
        }catch(error){if(generation===epoch&&!controller.signal.aborted)publish({...snapshot,status:'error'});}
      }while(again&&generation===epoch);
    }).finally(()=>{if(generation===epoch)pending=null;});return pending;
  };
  const focus=()=>{if(started)void refresh();};
  return {
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);if(!started){started=true;epoch++;windowTarget?.addEventListener('focus',focus);void refresh();}return()=>{listeners.delete(listener);if(listeners.size===0){started=false;epoch++;controller?.abort();stopEvents();pending=null;again=false;windowTarget?.removeEventListener('focus',focus);snapshot={status:'idle',bots:[],revision:0};}};},
    refresh,
    async appearance(bot,appearance){
      const response=await fetcher('/naumi/bots',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify({action:'appearance',botId:bot.id,expectedRevision:bot.revision,appearance}),signal:AbortSignal.timeout(12000)});
      const value=await response.json().catch(()=>({error:'BOT_APPEARANCE_FAILED'}));if(!response.ok){await refresh();throw Error(value.error??'BOT_APPEARANCE_FAILED');}await refresh();return value;
    },
    async bind(bot,sessionId){
      const response=await fetcher('/naumi/bots',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify({action:'bind',botId:bot.id,sessionId,expectedRevision:bot.revision}),signal:AbortSignal.timeout(12000)});
      const value=await response.json().catch(()=>({error:response.status===401||response.status===403?'BOT_AUTH_REQUIRED':'BOT_BIND_FAILED'}));if(!response.ok){await refresh();throw Error(value.error??'BOT_BIND_FAILED');}await refresh();return value;
    },
  };
}
let shared;
export function botCatalog(){return shared??=createBotCatalog();}
