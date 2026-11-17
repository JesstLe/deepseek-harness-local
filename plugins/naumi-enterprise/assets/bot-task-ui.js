import {taskActivity,sessionTasks,taskLabel,ACTIVE_TASKS,filePreviewAddress} from './bot-task-model.js';
import {botCatalog} from './bot-sidebar-model.js';

export function installBotTaskUI(ctx,React){
  return ctx.inject(['uiWorkspace','sidebarRight'],scope=>{
    const h=React.createElement,{useState,useEffect,useSyncExternalStore}=React,activity=taskActivity(),directory=botCatalog();
    function TaskCard({task,bots}){
      const [expanded,setExpanded]=useState(false),[detail,setDetail]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
      useEffect(()=>{
        if(!expanded)return;const abort=new AbortController();setError('');
        void fetch('/naumi/bot-tasks?taskId='+encodeURIComponent(task.id),{credentials:'same-origin',cache:'no-store',signal:abort.signal}).then(async r=>{if(!r.ok)throw Error();const value=await r.json();if(!abort.signal.aborted)setDetail(value);}).catch(()=>{if(!abort.signal.aborted)setError('任务读取失败');});
        return()=>abort.abort();
      },[expanded,task.id,task.revision]);
      const target=bots.find(b=>b.id===task.targetBotId),open=()=>scope.uiWorkspace.openSession(task.targetSessionId);
      const cancel=async()=>{
        if(busy||!window.confirm('停止这项任务？'))return;setBusy(true);setError('');
        try{const r=await fetch('/naumi/bot-tasks',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bot-tasks':'1'},body:JSON.stringify({action:'cancel',sourceSessionId:task.sourceSessionId,taskId:task.id,expectedRevision:task.revision})});if(!r.ok)throw Error();await activity.refresh();}
        catch{setError('操作未完成，请刷新任务后重试');}finally{setBusy(false);}
      };
      return h('article',{className:'naumi-background-task','data-task-id':task.id,'data-task-state':task.status},
        h('div',{className:'nbt-heading'},h('span',{className:'nbt-state','aria-live':'polite'},h('span',{'aria-hidden':true,className:'nbt-dot'}),target?.name??'员工',' · ',taskLabel(task)),h('div',{className:'nbt-actions'},h('button',{type:'button',onClick:open,'aria-label':'查看'+(target?.name??'员工')+'的任务会话'},'查看任务'),h('button',{type:'button',onClick:()=>setExpanded(v=>!v),'aria-expanded':expanded},expanded?'收起':'详情'))),
        h('div',{className:'nbt-subject'},task.subject),
        expanded&&h('div',{className:'nbt-detail'},task.progress&&h('p',null,task.progress),detail?.result&&h('pre',null,detail.result),detail?.delivery?.files?.map(f=>h('button',{type:'button',className:'nbt-file',key:f.sessionId+':'+f.seq+':'+f.index,onClick:()=>scope.sidebarRight.openResource(filePreviewAddress(f))},'↗ ',f.description??f.path.split(/[\\/]/).at(-1))),ACTIVE_TASKS.has(task.status)&&h('button',{type:'button',className:'nbt-cancel',onClick:cancel,disabled:busy},busy?'处理中…':'停止任务')),
        error&&h('div',{className:'nbt-error',role:'alert'},error));
    }
    function TaskDock({sessionId,session}){
      const activeId=sessionId??session?.id;
      const state=useSyncExternalStore(activity.subscribe,activity.getSnapshot,activity.getSnapshot),catalog=useSyncExternalStore(directory.subscribe,directory.getSnapshot,directory.getSnapshot),[all,setAll]=useState(false);
      useEffect(()=>setAll(false),[activeId]);
      const rows=sessionTasks(state.tasks,activeId);if(!rows.length)return null;
      return h('section',{className:'naumi-task-dock','aria-label':'交办任务','data-task-sync':state.status},
        (all?rows:rows.slice(0,3)).map(t=>h(TaskCard,{key:t.id,task:t,bots:catalog.bots})),
        rows.length>3&&h('button',{type:'button',className:'nbt-more',onClick:()=>setAll(v=>!v)},all?'收起任务':'全部任务 · '+rows.length),
        state.status==='error'&&h('button',{type:'button',className:'nbt-more',onClick:()=>activity.refresh()},'重新连接任务状态'));
    }
    return scope.slots.inject('conversation.input.dock',()=>scope.slots.register({name:'conversation.input.dock',id:'naumi-background-tasks',order:10},TaskDock));
  });
}
