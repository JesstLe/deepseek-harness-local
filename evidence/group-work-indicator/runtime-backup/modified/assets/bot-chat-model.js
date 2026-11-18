export const CHAT_PANEL='naumi-conversation';
export const CHAT_EVENT='naumi:conversation';
export const PIN_KEY='naumi.botPinned.v1';
export const ORDER_KEY='naumi.botOrder.v1';
const DRAG_PENDING_KEY='naumi.botDragPending.v1';
export function pendingBotGroup(value,storage=globalThis.sessionStorage){try{if(value===null){storage?.removeItem(DRAG_PENDING_KEY);return null;}if(value!==undefined){storage?.setItem(DRAG_PENDING_KEY,JSON.stringify(value));return value;}const saved=JSON.parse(storage?.getItem(DRAG_PENDING_KEY)??'null');if(saved&&['create','add-members'].includes(saved.action)&&Array.isArray(saved.botIds)&&saved.botIds.every(v=>typeof v==='string')&&saved.botIds.length<=12&&typeof(saved.id??saved.operationId)==='string')return saved;}catch{}return null;}
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
/** Read-only current-room work projection; never infer activity from a Bot's other chats. */
export function groupWorkMembers(room,detail){
 if(!room?.id||detail?.room?.id!==room.id)return [];
 const members=new Map((room.members??[]).map(m=>[m.botId,m])),sessions=new Set([...members.values()].map(m=>m.sessionId).filter(Boolean)),rows=new Map(),latest=new Map();
 const rank={running:0,starting:1,replying:2,waiting:3,queued:4};
 const rowFor=id=>{if(!rows.has(id))rows.set(id,{botId:id,state:'queued',tasks:[],replies:[]});return rows.get(id);};
 const stateFor=(row,state)=>{if(rank[state]<rank[row.state])row.state=state;};
 for(const task of detail.tasks??[]){
  if(!task.id||!task.targetBotId||!sessions.has(task.sourceSessionId))continue;
  const prior=latest.get(task.id);if(!prior||Number(task.revision??0)>=Number(prior.revision??0))latest.set(task.id,task);
 }
 for(const task of latest.values())if(['queued','starting','running','waiting'].includes(task.status)){
  const row=rowFor(task.targetBotId);row.tasks.push(task);stateFor(row,task.status);
 }
 const seen=new Set();
 for(const post of detail.posts??[])for(const reply of post.replies??[]){
  const member=members.get(reply.botId);if(!member||reply.sessionId!==member.sessionId||seen.has(reply.id)||!['queued','starting','sent'].includes(reply.state))continue;
  seen.add(reply.id);const row=rowFor(reply.botId);row.replies.push(reply);stateFor(row,reply.state==='sent'?'replying':reply.state);
 }
 const order=new Map([...members.keys()].map((id,i)=>[id,i]));
 return [...rows.values()].sort((a,b)=>rank[a.state]-rank[b.state]||(order.get(a.botId)??members.size)-(order.get(b.botId)??members.size)||a.botId.localeCompare(b.botId));
}
export function groupTimeline(posts,activity=[]){
 const rows=posts.flatMap(p=>[{...p,type:'user',order:p.seq*100,createdAt:p.createdAt??''},...p.replies.map((r,i)=>({...r,type:'reply',order:p.seq*100+i+1,createdAt:r.updatedAt??p.createdAt??''}))]);
 for(const item of activity)rows.push({...item,order:Number.MAX_SAFE_INTEGER});
 return rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.order-b.order||a.id.localeCompare(b.id));
}
/** Stop one current reply per member; preserve later queued chat topics. */
export function groupInterruptTargets(replies){
 const targets=new Map();
 for(const r of replies){if(!['queued','starting','sent'].includes(r.state))continue;const prior=targets.get(r.sessionId);
  if(!prior||prior.state==='queued'&&r.state!=='queued')targets.set(r.sessionId,r);
 }
 return [...targets.values()];
}
export function readBotOrder(storage=globalThis.localStorage){try{const value=JSON.parse(storage?.getItem(ORDER_KEY)??'[]');return Array.isArray(value)?value.filter(v=>typeof v==='string'):[];}catch{return[];}}
export function writeBotOrder(order,storage=globalThis.localStorage){const value=[...new Set(order.filter(v=>typeof v==='string'))];try{storage?.setItem(ORDER_KEY,JSON.stringify(value));}catch{}return value;}
export function reorderBotIds(order,dragged,target,before){const ids=[...new Set(order)],moving=new Set(dragged.filter(id=>ids.includes(id)));if(moving.has(target)||!ids.includes(target))return ids;const remaining=ids.filter(id=>!moving.has(id)),index=remaining.indexOf(target)+(before?0:1);remaining.splice(index,0,...ids.filter(id=>moving.has(id)));return remaining;}
export function groupBotIds(selected,target){return [...new Set([target,...selected])];}
export function conversationRows(bots,rooms,query='',pinned=null,order=[]){const q=query.trim().toLocaleLowerCase(),rank=new Map(order.map((id,i)=>[id,i])),active=bots.filter(b=>b.status==='active');const rows=[...active.map(bot=>({kind:'bot',id:bot.id,bot,name:bot.name,pinned:bot.id===pinned})),...rooms.map(room=>({kind:'group',id:room.id,room,name:room.name,pinned:false}))];return rows.filter(r=>!q||r.name.toLocaleLowerCase().includes(q)).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||(a.kind==='bot'&&b.kind==='bot'?(rank.get(a.id)??active.length)-(rank.get(b.id)??active.length):a.kind==='bot'?-1:b.kind==='bot'?1:0));}
export async function groupRequest(url='/naumi/bot-groups',{signal,body,fetcher=globalThis.fetch}={}){
 const r=await fetcher(url,{credentials:'same-origin',cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000),...(body?{method:'POST',headers:{'Content-Type':'application/json','x-naumi-bot-groups':'1'},body:JSON.stringify(body)}:{})});
 const data=await r.json().catch(()=>null);if(!r.ok||!data){const error=Error(data?.error??'BOT_GROUP_UNAVAILABLE');error.status=r.status;throw error;}return data;
}
export const groupError=e=>({BOT_GROUP_MENTION_REQUIRED:'请 @ 一位成员，或选择默认接话者。',BOT_GROUP_MEMBER_UNAVAILABLE:'有成员已归档，请重新选择。',BOT_GROUP_MEMBER_LIMIT:'群组最多容纳 12 位成员。',BOT_GROUP_INVALID_NAME:'群名需为 1–80 个字符。',BOT_GROUP_CONFLICT:'内容已变化，请刷新后重试。',BOT_GROUP_DEFAULT_NOT_MEMBER:'默认接话者必须在群内。',BOT_GROUP_TASK_NOT_FOUND:'这项任务不属于当前群。',BOT_GROUP_TASK_RECIPIENT_CONFLICT:'任务补充需交给原派单成员。',BOT_GROUP_ATTACHMENT_NOT_STAGED:'附件已失效，请重新添加。',BOT_GROUP_STOP_PENDING:'停止尚未确认，请稍后核对回复状态。'}[e?.message]??([401,403].includes(e?.status)?'连接已失效，请重新进入工作台。':'操作未完成，请重试。'));
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
  renamed(room){generation++;abort?.abort();pending=null;publish({...snapshot,rooms:snapshot.rooms.map(r=>r.id===room.id?room:r),details:{...snapshot.details,...(snapshot.details[room.id]?{[room.id]:{...snapshot.details[room.id],room}}:{})}});void refresh();},
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
