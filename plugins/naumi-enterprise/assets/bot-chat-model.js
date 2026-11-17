export const CHAT_PANEL='naumi-conversation';
export const CHAT_EVENT='naumi:conversation';
export const PIN_KEY='naumi.botPinned.v1';
const ACTIVE_KEY='naumi.groupSelection.v1';
const memoryDrafts=new Map();
export function roomDraft(id,value){
 const key='naumi.groupComposer.v1:'+id;
 if(value!==undefined){memoryDrafts.set(id,value);try{globalThis.sessionStorage?.setItem(key,JSON.stringify({targets:value.targets??[],...(value.taskId?{taskId:value.taskId}:{}),...(value.submission?{submission:value.submission}:{})}));}catch{}}
 if(!memoryDrafts.has(id))try{const saved=JSON.parse(globalThis.sessionStorage?.getItem(key)??'null');if(saved&&Array.isArray(saved.targets))memoryDrafts.set(id,{text:'',...saved});}catch{}
 return memoryDrafts.get(id)??{text:'',targets:[]};
}
export function previewText(text,max=70){return String(text??'').replace(/```[\s\S]*?```/g,'代码').replace(/[#*_`>]/g,'').replace(/\s+/g,' ').trim().slice(0,max);}
export function roomPreview(room,bots,detail){const post=detail?.posts?.at(-1),reply=post?.replies?.findLast(r=>r.text);return previewText(reply?`${bots.find(b=>b.id===reply.botId)?.name??'成员'}：${reply.text}`:post?.text) || room.members.map(m=>bots.find(b=>b.id===m.botId)?.name).filter(Boolean).join('、');}
export function roomWorking(detail){return !!(detail?.posts?.some(p=>p.replies.some(r=>['queued','starting','sent'].includes(r.state)))||detail?.tasks?.some(t=>['queued','starting','running','waiting'].includes(t.status)));}
export function groupTimeline(posts,activity=[]){
 const rows=posts.flatMap(p=>[{...p,type:'user',order:p.seq*100,createdAt:p.createdAt??''},...p.replies.map((r,i)=>({...r,type:'reply',order:p.seq*100+i+1,createdAt:r.updatedAt??p.createdAt??''}))]);
 for(const item of activity)rows.push({...item,order:Number.MAX_SAFE_INTEGER});
 return rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.order-b.order||a.id.localeCompare(b.id));
}
export function conversationRows(bots,rooms,query='',pinned=null){const q=query.trim().toLocaleLowerCase();const rows=[...bots.filter(b=>b.status==='active').map(bot=>({kind:'bot',id:bot.id,bot,name:bot.name,pinned:bot.id===pinned})),...rooms.map(room=>({kind:'group',id:room.id,room,name:room.name,pinned:false}))];return rows.filter(r=>!q||r.name.toLocaleLowerCase().includes(q)).sort((a,b)=>Number(b.pinned)-Number(a.pinned));}
export async function groupRequest(url='/naumi/bot-groups',{signal,body,fetcher=globalThis.fetch}={}){
 const r=await fetcher(url,{credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'Content-Type':'application/json','x-naumi-bot-groups':'1'},body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);if(!r.ok||!data){const error=Error(data?.error??'BOT_GROUP_UNAVAILABLE');error.status=r.status;throw error;}return data;
}
export const groupError=e=>({BOT_GROUP_MENTION_REQUIRED:'请 @ 一位成员，或选择默认接话者。',BOT_GROUP_MEMBER_UNAVAILABLE:'有成员已归档，请重新选择。',BOT_GROUP_CONFLICT:'内容已变化，请刷新后重试。',BOT_GROUP_DEFAULT_NOT_MEMBER:'默认接话者必须在群内。',BOT_GROUP_TASK_NOT_FOUND:'这项任务不属于当前群。',BOT_GROUP_TASK_RECIPIENT_CONFLICT:'任务补充需交给原派单成员。',BOT_GROUP_ATTACHMENT_NOT_STAGED:'附件已失效，请重新添加。',BOT_GROUP_STOP_PENDING:'停止尚未确认，请稍后核对回复状态。'}[e?.message]??([401,403].includes(e?.status)?'连接已失效，请重新进入工作台。':'操作未完成，请重试。'));
export function createGroupCatalog({fetcher=globalThis.fetch,target=globalThis.window,storage=globalThis.sessionStorage}={}){
 let selected=null;try{selected=storage?.getItem(ACTIVE_KEY)??null;}catch{}
 let snapshot={status:'idle',rooms:[],details:{},selected,creating:false},abort=null,pending=null,timer=null,alive=false,generation=0;
 const listeners=new Set(),publish=next=>{snapshot=next;for(const cb of listeners)cb();};
 const refresh=()=>{
  if(!alive)return Promise.resolve();if(pending)return pending;const gen=generation;abort=new AbortController();
  pending=groupRequest('/naumi/bot-groups',{fetcher,signal:abort.signal}).then(d=>{if(gen===generation)publish({...snapshot,status:'ready',rooms:d.rooms,selected:snapshot.selected??d.rooms[0]?.id??null});}).catch(e=>{if(gen===generation&&!abort.signal.aborted)publish([401,403].includes(e.status)?{...snapshot,status:'forbidden',rooms:[],details:{}}:{...snapshot,status:'error'});}).finally(()=>{if(gen===generation)pending=null;});return pending;
 };
 const focus=()=>void refresh();
 return {
  getSnapshot:()=>snapshot,
  subscribe(cb){listeners.add(cb);if(!alive){alive=true;generation++;void refresh();target?.addEventListener('focus',focus);timer=setInterval(()=>{if(!globalThis.document?.hidden)void refresh();},15000);}return()=>{listeners.delete(cb);if(!listeners.size){alive=false;generation++;abort?.abort();pending=null;clearInterval(timer);target?.removeEventListener('focus',focus);}};},
  refresh,
  select(ctx,id,{create=false}={}){publish({...snapshot,selected:id,creating:create});try{if(id)storage?.setItem(ACTIVE_KEY,id);}catch{}ctx.layout.beginNavigation?.();ctx.layout.selectPanel(CHAT_PANEL);target?.dispatchEvent(new CustomEvent(CHAT_EVENT));},
  created(ctx,room){publish({...snapshot,rooms:[room,...snapshot.rooms.filter(r=>r.id!==room.id)],selected:room.id,creating:false,status:'ready'});this.select(ctx,room.id);},
  detail(id,value){publish({...snapshot,details:{...snapshot.details,[id]:value}});},
 };
}
let shared;export const groupCatalog=()=>shared??=createGroupCatalog();

/** Read only this exact group's message turn, never a teammate's other conversation. */
export function groupReplyView(entries,messageId,sessionId){
 let turn=null,current=null,text='',attempt=null;const files=[];
 for(const row of entries??[]){const e=row.event??row;if(e.type==='turn/start')current=e.data.turn;
  if(e.type==='user/message'&&e.data.id===messageId)turn=current;
  if(turn===null||e.data?.turn!==turn)continue;
  if(e.type==='assistant/message'&&!e.data.message?.toolCalls?.length){text=(e.data.message?.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('\n');attempt=null;}
  if(e.type==='assistant/live-chunk'&&e.data.chunk?.type==='text-delta'){if(attempt!==e.data.attemptId){attempt=e.data.attemptId;text='';}text+=e.data.chunk.text;}
  if(e.type==='deliverables/presented')for(const [index,f]of (e.data.files??[]).entries())files.push({...f,sessionId,seq:e.seq,index,turn});
 }
 return {text,files};
}

/** Client Session references open read-only history/live feeds; never prompt or resume Host agents. */
export function watchGroupReplies(ctx,replies,onValue,{schedule=cb=>requestAnimationFrame(cb),cancel=id=>cancelAnimationFrame(id)}={}){
 const sessions=ctx.get?.('sessions')??ctx.sessions;if(!sessions?.retain)return()=>{};
 let closed=false,frame=null;const handles=[],stops=[],values={};
 const attach=()=>{if(closed)return;for(const id of new Set(replies.filter(r=>!['queued','starting'].includes(r.state)).map(r=>r.sessionId))){
  let ref;try{ref=sessions.retain(id,{source:'naumiGroupChat'});handles.push(ref);}catch{continue;}
  void ref.ready.then(binding=>{if(closed)return;const read=()=>{for(const r of replies.filter(r=>r.sessionId===id))values[r.id]=groupReplyView(binding.eventSource.getSnapshot().entries,r.messageId??r.id,id);if(frame===null)frame=schedule(()=>{frame=null;if(!closed)onValue({...values});});};stops.push(binding.eventSource.subscribe(read));read();}).catch(()=>{});
 }};
 if(sessions.refresh)void sessions.refresh().then(attach).catch(()=>{});else attach();
 return()=>{closed=true;if(frame!==null)cancel(frame);for(const stop of stops)stop();for(const ref of handles)ref.release();};
}
