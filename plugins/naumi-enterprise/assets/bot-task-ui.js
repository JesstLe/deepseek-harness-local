import {taskActivity,taskDockRows,taskLabel,ACTIVE_TASKS,SETTLED_TASKS,filePreviewAddress,readTaskCardDismissals,dismissTaskCard,TASK_CARD_DISMISSALS_KEY} from './bot-task-model.js';
import {botCatalog} from './bot-sidebar-model.js';

export function createBotTaskCard(scope,React,activity=taskActivity()){
  const h=React.createElement,{useState,useEffect,useRef}=React;
  function TaskCard({task,bots,onDismiss,onExpanded}){
    const [expanded,setExpanded]=useState(false),[detail,setDetail]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[accepted,setAccepted]=useState(false),request=useRef(null);
    useEffect(()=>{
      if(!expanded)return;const abort=new AbortController();setError('');
      void fetch('/naumi/bot-tasks?taskId='+encodeURIComponent(task.id),{credentials:'same-origin',cache:'no-store',signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const value=await r.json();if(!abort.signal.aborted)setDetail(value);}).catch(()=>{if(!abort.signal.aborted)setError('任务读取失败');});
      return()=>abort.abort();
    },[expanded,task.id,task.revision]);
    const target=bots.find(b=>b.id===task.targetBotId),open=()=>{try{scope.layout?.beginNavigation?.();scope.uiWorkspace.openSession(task.targetSessionId);}catch{setError('任务会话暂未就绪');}};
    const amend=async event=>{
      event.preventDefault();const text=note.trim();if(busy||!text)return;setBusy(true);setError('');setAccepted(false);
      if(request.current?.text!==text)request.current={text,key:'ui-continue-'+crypto.randomUUID()};
      try{
        const r=await fetch('/naumi/bot-tasks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bot-tasks':'1'},body:JSON.stringify({action:'continue',sourceSessionId:task.sourceSessionId,taskId:task.id,expectedRevision:task.revision,idempotencyKey:request.current.key,message:text})});
        if(!r.ok){await activity.refresh();setError(r.status===409?'任务状态已更新，请重试这条补充':'补充未确认受理，请重试');return;}
        setNote('');setAccepted(true);request.current=null;await activity.refresh();
      }catch{setError('补充未确认受理，请重试');}finally{setBusy(false);}
    };
    const openFile=async f=>{try{if(f.snapshot){const r=await fetch('/naumi/bot-file-version?'+new URLSearchParams({taskId:task.id,sessionId:f.sessionId,seq:String(f.seq),index:String(f.index)}),{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw Error('文件版本校验失败');}scope.sidebarRight.openResource(filePreviewAddress(f));}catch(e){setError(e.message);}};
    const cancel=async()=>{
      if(busy||!window.confirm('停止这项任务？'))return;setBusy(true);setError('');
      try{const r=await fetch('/naumi/bot-tasks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bot-tasks':'1'},body:JSON.stringify({action:'cancel',sourceSessionId:task.sourceSessionId,taskId:task.id,expectedRevision:task.revision})});if(!r.ok)throw Error();await activity.refresh();}
      catch{setError('操作未完成，请刷新任务后重试');}finally{setBusy(false);}
    };
    return h('article',{className:'naumi-background-task','data-task-id':task.id,'data-task-state':task.status},
      h('div',{className:'nbt-heading'},h('span',{className:'nbt-state','aria-live':'polite'},h('span',{'aria-hidden':true,className:'nbt-dot'}),target?.name??'员工',' · ',taskLabel(task)),h('div',{className:'nbt-actions'},h('button',{type:'button',onClick:open,disabled:task.status==='queued','aria-label':'查看'+(target?.name??'员工')+'的任务会话'},'查看任务'),h('button',{type:'button',onClick:()=>{setExpanded(!expanded);onExpanded?.(task.id,!expanded);},'aria-expanded':expanded},expanded?'收起':'详情'),onDismiss&&SETTLED_TASKS.has(task.status)&&h('button',{type:'button',className:'nbt-dismiss',onClick:()=>onDismiss(task),'aria-label':'收起任务卡片',title:'收起任务卡片'},'×'))),
      h('div',{className:'nbt-subject'},task.subject),
      expanded&&h('div',{className:'nbt-detail'},task.progress&&h('p',null,task.progress),detail?.result&&h('pre',null,detail.result),detail?.delivery?.files?.map(f=>h('button',{type:'button',className:'nbt-file',key:f.sessionId+':'+f.seq+':'+f.index,onClick:()=>openFile(f)},'↗ ',f.description??f.path.split(/[\\/]/).at(-1))),
        detail?.deliveryHistory?.slice().reverse().map(v=>h('section',{key:v.attempt,className:'nbt-version'},h('strong',null,'版本 '+v.attempt),...v.files.map(f=>h('button',{type:'button',className:'nbt-file',key:f.seq+':'+f.index,onClick:()=>openFile(f)},'↗ '+(f.description??f.path.split(/[\\/]/).at(-1)))))),
        (ACTIVE_TASKS.has(task.status)||task.status==='completed')&&h('form',{className:'nbt-amend',onSubmit:amend},h('textarea',{'aria-label':'补充这项任务',placeholder:'补充或修改这项任务…',value:note,onChange:e=>{setNote(e.target.value);setAccepted(false);},disabled:busy,maxLength:16000,rows:2}),h('button',{type:'submit',disabled:busy||!note.trim()},busy?'受理中…':task.status==='completed'?'继续修改':'补充要求'),accepted&&h('span',{role:'status'},'已受理')),
        ACTIVE_TASKS.has(task.status)&&h('button',{type:'button',className:'nbt-cancel',onClick:cancel,disabled:busy},busy?'处理中…':'停止任务')),
      error&&h('div',{className:'nbt-error',role:'alert'},error));
  }
  return TaskCard;
}

export function installBotTaskUI(ctx,React){
  return ctx.inject(['uiWorkspace','sidebarRight'],scope=>{
    const h=React.createElement,{useState,useEffect,useSyncExternalStore}=React,activity=taskActivity(),directory=botCatalog();
    const TaskCard=createBotTaskCard(scope,React,activity);
    function TaskDock({sessionId,session}){
      const activeId=sessionId??session?.id;
      const state=useSyncExternalStore(activity.subscribe,activity.getSnapshot,activity.getSnapshot),catalog=useSyncExternalStore(directory.subscribe,directory.getSnapshot,directory.getSnapshot),[all,setAll]=useState(false),[showHistory,setShowHistory]=useState(false),[historyLimit,setHistoryLimit]=useState(10),[pinned,setPinned]=useState([]),[dismissed,setDismissed]=useState(()=>readTaskCardDismissals()),[,tick]=useState(0);
      useEffect(()=>{setAll(false);setShowHistory(false);setHistoryLimit(10);setPinned([]);},[activeId]);
      useEffect(()=>{const sync=e=>{if(e.key===TASK_CARD_DISMISSALS_KEY||e.key===null)setDismissed(readTaskCardDismissals());};window.addEventListener('storage',sync);return()=>window.removeEventListener('storage',sync);},[]);
      const view=taskDockRows(state.tasks,activeId,{dismissed,pinned});
      useEffect(()=>{if(view.nextExpiry===null)return;const timer=setTimeout(()=>tick(v=>v+1),Math.max(1,view.nextExpiry-Date.now()+10));return()=>clearTimeout(timer);},[view.nextExpiry,activeId]);
      const reading=(id,value)=>setPinned(current=>value?[...new Set([...current,id])]:current.filter(v=>v!==id));
      const dismiss=task=>{setDismissed(dismissTaskCard(task,dismissed));reading(task.id,false);};
      if(!view.current.length&&!view.history.length)return null;
      return h('section',{className:'naumi-task-dock','aria-label':'交办任务','data-task-sync':state.status},
        (all?view.current:view.current.slice(0,3)).map(t=>h(TaskCard,{key:t.id+':'+t.attempt,task:t,bots:catalog.bots,onDismiss:dismiss,onExpanded:reading})),
        view.current.length>3&&h('button',{type:'button',className:'nbt-more',onClick:()=>setAll(v=>!v)},all?'收起任务':'全部任务 · '+view.current.length),
        view.history.length>0&&h('button',{type:'button',className:'nbt-history-toggle','aria-expanded':showHistory,'aria-controls':'naumi-task-history-'+activeId,onClick:()=>{setShowHistory(v=>!v);setHistoryLimit(10);}},h('span',null,showHistory?'收起记录':'任务记录',' · ',view.history.length),view.errors>0&&h('span',{className:'nbt-history-errors'},'异常 ',view.errors),h('span',{'aria-hidden':true},showHistory?'⌃':'⌄')),
        showHistory&&view.history.length>0&&h('div',{className:'nbt-history',id:'naumi-task-history-'+activeId},view.history.slice(0,historyLimit).map(t=>h(TaskCard,{key:t.id+':'+t.attempt,task:t,bots:catalog.bots})),view.history.length>historyLimit&&h('button',{type:'button',className:'nbt-more',onClick:()=>setHistoryLimit(v=>v+10)},'更多记录')),
        state.status==='error'&&h('button',{type:'button',className:'nbt-more',onClick:()=>activity.refresh()},'重新连接任务状态'));
    }
    return scope.slots.inject('conversation.input.dock',()=>scope.slots.register({name:'conversation.input.dock',id:'naumi-background-tasks',order:10},TaskDock));
  });
}
