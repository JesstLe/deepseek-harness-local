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
export const SETTLED_TASKS=new Set(['completed','failed','cancelled','interrupted']);
export const TASK_CARD_RETENTION_MS=8000;
export const TASK_CARD_DISMISSALS_KEY='naumi.taskCards.dismissed.v1';
export const taskCardIdentity=task=>JSON.stringify([task.id,task.attempt??1,task.status]);
export function readTaskCardDismissals(storage){
  try{const value=JSON.parse((storage??globalThis.localStorage)?.getItem(TASK_CARD_DISMISSALS_KEY)??'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'&&v.length<500).slice(-500):[];}catch{return [];}
}
export function dismissTaskCard(task,current=[],storage){
  if(!SETTLED_TASKS.has(task.status))return current;
  const key=taskCardIdentity(task),value=[...new Set([...readTaskCardDismissals(storage),...current,key])].slice(-500);
  try{(storage??globalThis.localStorage)?.setItem(TASK_CARD_DISMISSALS_KEY,JSON.stringify(value));}catch{/* A blocked/full preference store never blocks chat. */}
  return value;
}
/** Presentation-only retention. Never mutates, deletes, stops or rewrites a task. */
export function taskDockRows(tasks,sessionId,{now=Date.now(),dismissed=[],pinned=[]}={}){
  const hidden=new Set(dismissed),reading=new Set(pinned),current=[],history=[];let nextExpiry=null;
  for(const task of sessionTasks(tasks,sessionId)){
    if(!SETTLED_TASKS.has(task.status)){current.push(task);continue;}
    const expiry=Date.parse(task.updatedAt)+TASK_CARD_RETENTION_MS,remaining=expiry-now;
    const recent=remaining>0&&remaining<=TASK_CARD_RETENTION_MS;
    if(!hidden.has(taskCardIdentity(task))&&(reading.has(task.id)||recent)){
      current.push(task);if(!reading.has(task.id)&&recent)nextExpiry=nextExpiry===null?expiry:Math.min(nextExpiry,expiry);
    }else history.push(task);
  }
  return {current,history,nextExpiry,errors:history.filter(t=>t.status==='failed'||t.status==='interrupted').length};
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
