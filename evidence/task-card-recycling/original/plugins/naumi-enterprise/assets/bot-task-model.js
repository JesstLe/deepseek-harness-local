export const ACTIVE_TASKS=new Set(['queued','starting','running','waiting']);
export const taskLabel=task=>({queued:'排队中',starting:'准备中',running:'工作中',waiting:'待确认',completed:'已完成',failed:'未完成',cancelled:'已取消',interrupted:'已中断'}[task.status]??'待同步');
export function employeeTaskState(bot,tasks,fallback='idle'){
  const own=tasks.filter(t=>t.targetBotId===bot.id);
  if(own.some(t=>t.status==='running'))return 'running';
  if(own.some(t=>t.status==='starting'))return 'starting';
  if(own.some(t=>t.status==='waiting'))return 'waiting';
  if(own.some(t=>t.status==='queued'))return 'queued';
  return fallback;
}
export function receptionTarget(bot,tasks,sessions,workspaces){
  const jobs=new Set(tasks.map(t=>t.targetSessionId)),archived=new Set(workspaces?.archivedSessionIds??[]);
  const available=id=>!!sessions.byId[id]&&!jobs.has(id)&&!archived.has(id);
  if(available(bot.homeSessionId))return bot.homeSessionId;
  return [...bot.sessionIds].reverse().find(available)??null;
}
export function sessionTasks(tasks,sessionId){
  return tasks.filter(t=>t.sourceSessionId===sessionId||t.targetSessionId===sessionId).sort((a,b)=>Number(ACTIVE_TASKS.has(b.status))-Number(ACTIVE_TASKS.has(a.status))||b.updatedAt.localeCompare(a.updatedAt));
}
export function filePreviewAddress(file){const enc=s=>encodeURIComponent(s).replace(/%3A/gi,':');return `dsh-resource://file/session/${enc(file.sessionId)}/${file.path.replaceAll('\\','/').split('/').map(enc).join('/')}`;}

/** One owner-authenticated event subscription shared by task cards and employee activity. */
export function createTaskActivity({fetcher=globalThis.fetch,eventSource=url=>new EventSource(url),windowTarget=globalThis.window}={}){
  let snapshot={status:'idle',revision:0,tasks:[]},started=false,epoch=0,pending=null,again=false,controller=null,events=null;
  const listeners=new Set(),publish=value=>{snapshot=value;for(const fn of listeners)fn();};
  const refresh=()=>{
    if(!started)return Promise.resolve();if(pending){again=true;return pending;}
    const generation=epoch;controller=new AbortController();
    pending=(async()=>{do{
      again=false;
      try{
        const r=await fetcher('/naumi/bot-tasks?view=activity',{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});
        if(generation!==epoch)return;
        if(r.status===401||r.status===403){events?.close();events=null;publish({status:'forbidden',revision:0,tasks:[]});return;}
        if(!r.ok)throw Error('TASK_ACTIVITY_UNAVAILABLE');
        const v=await r.json();if(generation!==epoch)return;if(v.version!==1||!Array.isArray(v.tasks))throw Error('TASK_ACTIVITY_INVALID');
        publish({status:'ready',revision:v.revision,tasks:v.tasks});
      }catch{if(generation===epoch)publish({...snapshot,status:'error'});}
    }while(again&&generation===epoch);})().finally(()=>{if(generation===epoch)pending=null;});return pending;
  };
  const focus=()=>void refresh();
  return {getSnapshot:()=>snapshot,refresh,
    subscribe(fn){listeners.add(fn);if(!started){started=true;epoch++;events=eventSource('/naumi/bot-tasks/events');events.onmessage=()=>void refresh();events.onopen=()=>void refresh();events.onerror=()=>{if(started)publish({...snapshot,status:'error'});};windowTarget?.addEventListener('focus',focus);void refresh();}
      return()=>{listeners.delete(fn);if(!listeners.size){started=false;epoch++;controller?.abort();events?.close();events=null;pending=null;again=false;windowTarget?.removeEventListener('focus',focus);snapshot={status:'idle',revision:0,tasks:[]};}};},
  };
}
let shared;
export const taskActivity=()=>shared??=createTaskActivity();
