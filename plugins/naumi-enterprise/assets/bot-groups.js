import {filePreviewAddress,taskLabel,taskActivity} from './bot-task-model.js';
import {botCatalog} from './bot-sidebar-model.js';
import {createBotAvatar} from './bot-avatar.js';
import {createChatMarkdown} from './bot-chat-markdown.js';
import {groupCatalog,groupRequest,groupError,roomDraft,watchGroupReplies,roomWorking,groupTimeline} from './bot-chat-model.js';

export function createBotGroupsPage(ctx,React){
 const h=React.createElement,{useEffect,useState,useRef,useSyncExternalStore}=React,groups=groupCatalog(),catalog=botCatalog(),Avatar=createBotAvatar(React),Markdown=createChatMarkdown(React);
 const icon=(kind,size=18)=>h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:{send:'m5 12 7-7 7 7 M12 5v14',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',files:'M14 3H6v18h12V7z M14 3v5h5 M9 12h6 M9 16h6',close:'m6 6 12 12 M18 6 6 18',at:'M16 8v6a2 2 0 0 0 4 0v-2a8 8 0 1 0-3 6 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0'}[kind]??'M5 12h14'}));
 const action=(label,onClick,kind,props={})=>h('button',{type:'button',className:'nbc-icon','aria-label':label,title:label,onClick,...props},icon(kind));
 const openSession=id=>{ctx.layout.beginNavigation?.();ctx.uiWorkspace.openSession(id);};
 const openFile=file=>{const sidebar=ctx.get?.('sidebarRight');if(sidebar)sidebar.openResource(filePreviewAddress(file));else openSession(file.sessionId);};
 function Faces({members,bots}){return h('span',{className:'nbc-faces','aria-hidden':true},members.slice(0,4).map(m=>{const bot=bots.find(b=>b.id===m.botId);return bot?h(Avatar,{key:m.botId,bot,staticPreview:true}):h('span',{key:m.botId},'·');}));}
 function Files({files}){return files?.length?h('div',{className:'nbc-files'},files.map((f,i)=>h('button',{type:'button',key:f.sessionId+':'+f.seq+':'+i,onClick:()=>openFile(f)},icon('files',16),h('span',null,f.description??f.path.split(/[\\/]/).at(-1))))):null;}
 function TaskDrawer({tasks,bots,onClose,onSelect}){return h('aside',{className:'nbc-drawer','aria-label':'任务与文件'},h('header',null,h('h3',null,'任务与文件'),action('关闭任务',onClose,'close')),tasks.length?tasks.map(t=>h('article',{key:t.id},h('strong',null,t.subject),h('div',{className:'nbc-task-meta'},bots.find(b=>b.id===t.targetBotId)?.name,' · ',taskLabel(t)),t.result&&h(Markdown,{text:t.result}),h(Files,{files:t.files}),h('div',{className:'nbc-task-actions'},h('button',{type:'button',onClick:()=>openSession(t.targetSessionId)},'打开任务'),['queued','starting','running','waiting','completed'].includes(t.status)&&h('button',{type:'button',onClick:()=>onSelect(t)},'调整要求'),t.handoff&&h('button',{type:'button',onClick:()=>openSession(t.handoff.sessionId)},'上游任务')))):h('div',{className:'nbc-empty-small'},'暂无任务'));}
 function CreateRoom({bots,onCancel}){
  const [name,setName]=useState(''),[members,setMembers]=useState([]),[manager,setManager]=useState(''),[pending,setPending]=useState(false),[error,setError]=useState('');const operation=useRef(null),ref=useRef(null),prior=useRef(document.activeElement),alive=useRef(true);
  useEffect(()=>{alive.current=true;ref.current?.querySelector('input')?.focus();return()=>{alive.current=false;if(prior.current?.isConnected)prior.current.focus();};},[]);
  const change=fn=>{operation.current=null;setError('');fn();};
  const submit=async e=>{e.preventDefault();if(pending||!name.trim()||members.length<2)return;operation.current??=crypto.randomUUID();setPending(true);setError('');try{const room=await groupRequest(undefined,{body:{action:'create',id:operation.current,name:name.trim(),botIds:members,defaultBotId:manager||null}});if(alive.current)groups.created(ctx,room);else void groups.refresh();}catch(e){if(alive.current)setError(groupError(e));}finally{if(alive.current)setPending(false);}};
  const key=e=>{if(e.key==='Escape'&&!pending){e.preventDefault();onCancel();}if(e.key==='Tab'){const nodes=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
  return h('div',{className:'nbc-modal-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget&&!pending)onCancel();}},h('form',{ref,className:'nbc-create',role:'dialog','aria-modal':true,'aria-label':'新建群聊',onSubmit:submit,onKeyDown:key},h('header',null,h('h2',null,'新建群聊'),action('关闭建群',onCancel,'close',{disabled:pending})),h('label',{className:'nbc-field'},'群名',h('input',{value:name,maxLength:80,required:true,disabled:pending,onChange:e=>change(()=>setName(e.target.value))})),h('fieldset',{disabled:pending},h('legend',null,'成员'),h('div',{className:'nbc-member-grid'},bots.map(bot=>h('label',{key:bot.id,className:'nbc-member-option','data-checked':members.includes(bot.id)},h('input',{type:'checkbox',checked:members.includes(bot.id),disabled:members.length>=12&&!members.includes(bot.id),onChange:e=>change(()=>{setMembers(v=>e.target.checked?[...v,bot.id]:v.filter(id=>id!==bot.id));if(!e.target.checked&&manager===bot.id)setManager('');})}),h(Avatar,{bot,staticPreview:true}),h('span',null,bot.name))))),h('label',{className:'nbc-field'},'默认接话者',h('select',{value:manager,disabled:pending,onChange:e=>change(()=>setManager(e.target.value))},h('option',{value:''},'每次点名'),bots.filter(b=>members.includes(b.id)).map(b=>h('option',{key:b.id,value:b.id},b.name)))),error&&h('p',{className:'nbc-error',role:'alert'},error),h('footer',null,h('button',{type:'button',onClick:onCancel,disabled:pending},'取消'),h('button',{type:'submit',className:'nbc-primary',disabled:pending||members.length<2||!name.trim()},pending?'创建中…':'创建群聊'))));
 }
 function NativeComposer({room,native,accessory,busy,onSubmit,onCancel}){
  const [binding,setBinding]=useState(null),[error,setError]=useState('');const callbacks=useRef({onSubmit,onCancel});callbacks.current={onSubmit,onCancel};
  useEffect(()=>{let closed=false,ref,dispose;const controller=new AbortController();
   void (async()=>{try{
    const prepared=await groupRequest(undefined,{signal:controller.signal,body:{action:'prepare',roomId:room.id}});if(closed)return;
    const sessions=ctx.get?.('sessions')??ctx.sessions;await sessions.refresh();if(closed)return;
    ref=sessions.retain(prepared.sessionId,{source:'naumiGroupComposer'});await ref.ready;if(closed)return;
    const conversation=ctx.get?.('conversation')??ctx.conversation;
    if(!conversation?.registerComposerTransport)throw Error('NATIVE_COMPOSER_EXTENSION_MISSING');
    dispose=conversation.registerComposerTransport(prepared.sessionId,{submit:args=>callbacks.current.onSubmit(args),cancel:()=>callbacks.current.onCancel()});
    setBinding({sessionId:prepared.sessionId,reference:ref});
   }catch(e){if(!closed){console.error('Naumi group composer:',e);setError(e.message==='NATIVE_COMPOSER_EXTENSION_MISSING'?'原生输入区扩展尚未加载，请更新工作台。':groupError(e));}}})();
   return()=>{closed=true;controller.abort();dispose?.();ref?.release();};
  },[room.id]);
  return h('div',{className:'nbc-native-dock','data-native-composer':binding?.sessionId??'loading'},error?h('div',{className:'nbc-error',role:'alert'},error):binding&&native?.SessionProvider?h(native.SessionProvider,{session:binding.reference},native.renderFactorySlot('naumi.group.composer',{groupBusy:busy,placeholder:'发送消息，@ 提及成员',accessory})):h('div',{className:'nbc-loading',role:'status'},'载入输入区…'));
 }
 function Conversation({room,bots,native}){
  const [data,setData]=useState(null),[older,setOlder]=useState([]),[end,setEnd]=useState(false),[loadingOlder,setLoadingOlder]=useState(false),[draft,setDraft]=useState(()=>roomDraft(room.id)),[error,setError]=useState(''),[readError,setReadError]=useState(''),[sending,setSending]=useState(false),[mentions,setMentions]=useState(false),[drawer,setDrawer]=useState(null),[live,setLive]=useState({});
  const refresh=useRef(null),timeline=useRef(null),follow=useRef(true),alive=useRef(true),initial=useRef(true),flight=useRef(false),reader=useRef(null),submissionRef=useRef(null);const label=id=>bots.find(b=>b.id===id)?.name??'已归档成员';
  const update=value=>{const next={...value,submission:undefined};roomDraft(room.id,next);setDraft(next);submissionRef.current=null;setError('');};
  useEffect(()=>{alive.current=true;const controller=new AbortController();let pending=false;
   const load=async()=>{if(pending||controller.signal.aborted)return;pending=true;try{const next=await groupRequest('/naumi/bot-groups?roomId='+encodeURIComponent(room.id),{signal:controller.signal});if(!controller.signal.aborted){setData(next);groups.detail(room.id,next);setReadError('');}}catch(e){if(!controller.signal.aborted){setReadError(groupError(e));if([401,403].includes(e.status)){setData(null);setLive({});void groups.refresh();}}}finally{pending=false;}};
   refresh.current=load;void load();const timer=setInterval(()=>{if(!document.hidden)void load();},2000),focus=()=>void load();window.addEventListener('focus',focus);
   return()=>{alive.current=false;controller.abort();clearInterval(timer);window.removeEventListener('focus',focus);refresh.current=null;};
  },[room.id]);
  useEffect(()=>taskActivity().subscribe(()=>void refresh.current?.()),[room.id]);
  const posts=[...new Map([...older,...(data?.posts??[])].map(p=>[p.seq,p])).values()].sort((a,b)=>a.seq-b.seq),replies=[...posts.flatMap(p=>p.replies),...(data?.activity??[]).filter(a=>a.type==='relay')],key=replies.map(r=>r.id+':'+r.state).join('|');reader.current=replies;
  useEffect(()=>watchGroupReplies(ctx,reader.current,setLive),[key]);
  useEffect(()=>{if(timeline.current&&(initial.current||follow.current)){timeline.current.scrollTop=timeline.current.scrollHeight;initial.current=false;}},[data,live]);
  const loadOlder=async()=>{if(loadingOlder||!posts[0])return;setLoadingOlder(true);const before=timeline.current,top=before?.scrollTop??0,height=before?.scrollHeight??0;try{const d=await groupRequest('/naumi/bot-groups?roomId='+encodeURIComponent(room.id)+'&before='+posts[0].seq);if(alive.current){setOlder(v=>[...d.posts,...v]);setEnd(d.posts.length<50);requestAnimationFrame(()=>{if(before?.isConnected)before.scrollTop=top+before.scrollHeight-height;});}}catch(e){if(alive.current)setError(groupError(e));}finally{if(alive.current)setLoadingOlder(false);}};
  const send=async({text,attachments,signal})=>{if(flight.current)return {kind:'error'};flight.current=true;setSending(true);setError('');
   const value={action:'post',roomId:room.id,text:text.trim(),botIds:draft.taskId?[]:draft.targets,...(draft.taskId?{taskId:draft.taskId}:{}),...(attachments.length?{attachments}:{})},fingerprint=JSON.stringify(value);
   const saved=roomDraft(room.id).submission;
   if(submissionRef.current?.fingerprint!==fingerprint)submissionRef.current=saved?.fingerprint===fingerprint?saved:{fingerprint,id:crypto.randomUUID()};
   const request=submissionRef.current;roomDraft(room.id,{...roomDraft(room.id),submission:request});
   try{await groupRequest(undefined,{signal,body:{...value,id:request.id}});submissionRef.current=null;
    if(roomDraft(room.id).submission?.id===request.id)roomDraft(room.id,{text:'',targets:[]});
    if(alive.current){setDraft(roomDraft(room.id));setMentions(false);follow.current=true;void refresh.current?.();}void groups.refresh();return {kind:'success'};
   }catch(e){if(alive.current)setError(groupError(e));return {kind:'error'};}finally{flight.current=false;if(alive.current)setSending(false);}
  };
  const stopReply=async()=>{setError('');try{for(const r of replies.filter(r=>['queued','starting','sent'].includes(r.state)))await groupRequest(undefined,{body:{action:'interrupt',roomId:room.id,replyId:r.id}});void refresh.current?.();}catch(e){if(alive.current)setError(groupError(e));}};
  const targets=room.members.filter(m=>bots.some(b=>b.id===m.botId&&b.status==='active')),working=roomWorking(data),selectTask=t=>{if(!t)return;update({...draft,taskId:t.id,targets:[]});setDrawer(null);};
  const botWorking=id=>(data?.tasks??[]).some(t=>t.targetBotId===id&&['starting','running'].includes(t.status));
  const bubble=reply=>{if(reply.type==='relay'&&!live[reply.id]?.text&&!live[reply.id]?.files?.length)return null;const bot=bots.find(b=>b.id===reply.botId),view=live[reply.id],text=reply.type==='task-message'?reply.text:reply.state==='completed'?reply.text:view?.text,active=['queued','starting','sent'].includes(reply.state);return h('article',{key:reply.id,className:'nbc-message nbc-assistant','data-reply-id':reply.id},h('div',{className:'nbc-message-avatar'},bot?h(Avatar,{bot,state:active||botWorking(reply.botId)?'running':'idle'}):null),h('div',{className:'nbc-message-body'},h('div',{className:'nbc-speaker'},label(reply.botId)),text?h('div',{className:'nbc-bubble'},h(Markdown,{text})):active?h('div',{className:'nbc-typing',role:'status','aria-label':label(reply.botId)+'正在回复'},h('i'),h('i'),h('i')):h('div',{className:'nbc-bubble nbc-interrupted'},reply.state==='blocked'?'需要你确认':'回复未完成',h('button',{type:'button',onClick:()=>openSession(reply.sessionId)},'查看会话')),h(Files,{files:reply.files??view?.files}),reply.taskId&&h('button',{type:'button',className:'nbc-task-link',onClick:()=>selectTask((data?.tasks??[]).find(t=>t.id===reply.taskId))},'调整这项任务')))};
  const messages=groupTimeline(posts,data?.activity).map(row=>{
   if(row.type==='user')return h('article',{key:row.id,className:'nbc-message nbc-user'},h('div',{className:'nbc-message-body'},row.taskId&&h('div',{className:'nbc-speaker'},'补充任务'),h('div',{className:'nbc-bubble'},h(Markdown,{text:row.text}),row.attachments?.map((f,i)=>h('span',{key:i,className:'nbc-attachment'},f.name??f.file?.name??'附件')))));
   if(row.type==='task-state')return h('div',{key:row.id,className:'nbc-task-receipt','data-task-id':row.taskId,'data-task-status':row.status},h('span',null,label(row.botId),' · ',taskLabel(row)),h('button',{type:'button',onClick:()=>selectTask((data?.tasks??[]).find(t=>t.id===row.taskId))},row.subject));
   return bubble(row);
  });
  const accessory=h(React.Fragment,null,
   error&&h('div',{className:'nbc-error',role:'alert'},error),
   draft.taskId&&h('div',{className:'nbc-task-selection'},h('span',null,(data?.tasks??[]).find(t=>t.id===draft.taskId)?.subject??draft.taskId),action('取消任务关联',()=>update({...draft,taskId:null}),'close')),
   h('div',{className:'nbc-group-controls'},action('点名成员',()=>setMentions(!mentions),'at',{'aria-expanded':mentions,disabled:sending||!!draft.taskId}),
    (mentions||draft.targets.length>0)&&h('div',{className:'nbc-mentions','aria-label':'点名成员'},targets.map(m=>h('button',{type:'button',key:m.botId,'aria-pressed':draft.targets.includes(m.botId),disabled:sending||!!draft.taskId,onClick:()=>update({...draft,targets:draft.targets.includes(m.botId)?draft.targets.filter(id=>id!==m.botId):[...draft.targets,m.botId]})},'@'+label(m.botId)))))
  );
  return h('section',{className:'nbc-conversation','aria-label':room.name},
   h('header',{className:'nbc-header'},h('div',{className:'nbc-title'},h(Faces,{members:room.members,bots}),h('div',null,h('h1',null,room.name),working&&h('span',{className:'nbc-working'},'正在协作'))),h('div',{className:'nbc-header-actions'},h('button',{type:'button',className:'nbc-members-button',onClick:()=>setDrawer(drawer==='members'?null:'members'),'aria-label':'群成员'},room.members.length,' 位成员',icon('users',17)),action('任务与文件',()=>setDrawer(drawer==='tasks'?null:'tasks'),'files',{'aria-expanded':drawer==='tasks'}))),
   h('div',{className:'nbc-main'},
    h('div',{className:'nbc-timeline',ref:timeline,role:'log','aria-label':'群消息记录',onScroll:e=>{const n=e.currentTarget;follow.current=n.scrollHeight-n.scrollTop-n.clientHeight<90;}},h('div',{className:'nbc-transcript'},
     readError&&h('div',{className:'nbc-error',role:'alert'},readError,h('button',{type:'button',onClick:()=>refresh.current?.()},'重试')),
     !data&&!readError&&h('div',{className:'nbc-loading',role:'status'},'载入中…'),
     data&&posts.length===0&&h('div',{className:'nbc-empty'},h(Faces,{members:room.members,bots}),h('h2',null,room.name)),
     posts.length>=50&&!end&&h('button',{type:'button',className:'nbc-history',onClick:loadOlder,disabled:loadingOlder},loadingOlder?'载入中…':'更早的消息'),messages)),
    drawer==='tasks'&&h(TaskDrawer,{tasks:data?.tasks??[],bots,onClose:()=>setDrawer(null),onSelect:selectTask}),
    drawer==='members'&&h('aside',{className:'nbc-drawer','aria-label':'群成员'},h('header',null,h('h3',null,'群成员'),action('关闭成员',()=>setDrawer(null),'close')),room.members.map(m=>{const b=bots.find(b=>b.id===m.botId);return h('div',{key:m.botId,className:'nbc-person'},b&&h(Avatar,{bot:b,staticPreview:true}),h('strong',null,label(m.botId)),m.botId===room.defaultBotId&&h('span',null,'默认接话'));}))
   ),
   h(NativeComposer,{room,native,busy:replies.some(r=>['queued','starting','sent'].includes(r.state)),onSubmit:send,onCancel:stopReply,accessory})
  );
 }
 return function UnifiedConversation({native}){const state=useSyncExternalStore(groups.subscribe,groups.getSnapshot,groups.getSnapshot),people=useSyncExternalStore(catalog.subscribe,catalog.getSnapshot,catalog.getSnapshot),room=state.rooms.find(r=>r.id===state.selected),bots=people.bots;
  return h('main',{className:'nbc-surface'},room?h(Conversation,{key:room.id,room,bots,native}):h('div',{className:'nbc-empty'},state.status==='loading'?'载入中…':h('img',{src:'/naumi/assets/symbol.svg',width:56,height:56,alt:'Naumi'}),['error','forbidden'].includes(state.status)&&h('button',{type:'button',onClick:()=>groups.refresh()},'重试')),state.creating&&h(CreateRoom,{bots:bots.filter(b=>b.status==='active'),onCancel:()=>{groups.select(ctx,state.selected);}}));
 };
}
