import {naumiMonitorReadings,naumiPortalOptions,teamTaskGroups,teamSchedules,scheduleTime,scheduleToggleRequest,memberState,teamInitials,readEnvironment} from './team-panel-model.js';
import {botCatalog,botForSession,botTone} from './bot-sidebar-model.js';

/** A presentation adapter over native Team, Schedule and resource actions. */
export function installTeamPanel(ctx,React,createPortal,Icon){
  const h=React.createElement,{useState,useEffect,useLayoutEffect,useMemo,useRef,useSyncExternalStore}=React;
  const docks=new Map(),listeners=new Map(),relocated=new WeakSet(),originals=new Map(),disposers=[];
  const register=dispose=>{if(typeof dispose==='function')disposers.push(dispose);};
  const getDock=(id,key)=>docks.get(id)?.[key]??null;
  const listen=(id,fn)=>{let set=listeners.get(id);if(!set)listeners.set(id,set=new Set());set.add(fn);return()=>{set.delete(fn);if(!set.size)listeners.delete(id);};};
  const setDock=(id,key,node)=>{const record=docks.get(id)??{};if(record[key]===node)return;record[key]=node;docks.set(id,record);if(!Object.values(record).some(Boolean))docks.delete(id);for(const fn of listeners.get(id)??[])fn();};
  const moves=[['conversation.session.header.actions','agent-team','team'],['conversation.session.header.actions','subagent-catalog','children'],['conversation.session.header.actions','agent-preset','preset'],['conversation.composer.dock','activity','activity'],['conversation.composer.dock','usage','usage']];
  for(const [slot,id,dock]of moves)register(ctx.slots.inject(slot,()=>{
    let disposed=false,current=null,undo=null;
    const bind=()=>{
      if(disposed)return;
      const entry=ctx.slots.entries(slot).find(e=>e.options.id===id&&!relocated.has(e.component));
      if(!entry||entry===current)return;
      undo?.();current=entry;originals.set(id,entry);
      function NativePortal(props){const target=useSyncExternalStore(fn=>listen(props.sessionId,fn),()=>getDock(props.sessionId,dock),()=>null);const native=h(entry.component,props);return target?createPortal(native,target):native;}
      relocated.add(NativePortal);undo=ctx.slots.register(naumiPortalOptions(entry,slot),NativePortal);
    };
    bind();const unsubscribe=ctx.slots.subscribe(slot,bind);
    return()=>{disposed=true;unsubscribe();undo?.();if(originals.get(id)===current)originals.delete(id);};
  }));
  const emptyCatalog={records:[],status:'loading',settled:false},noop=()=>()=>{};
  const short=value=>value===null?'—':new Intl.NumberFormat('en-US',{notation:value>=1000?'compact':'standard',maximumFractionDigits:1}).format(value);
  const runLabel=status=>status?.pendingInteraction?'等待操作':status?.running===true?'运行中':status?.running===false?'未运行':'状态待同步';
  function useNativeEntry(slot,id){
    const subscribe=useMemo(()=>fn=>ctx.slots.subscribe(slot,fn),[slot]);
    return useSyncExternalStore(subscribe,()=>ctx.slots.entries(slot).find(e=>e.options.id===id||e.options.key===id)??null,()=>null);
  }
  function Member({member,sessionId,useSessions,useSessionStatus,onError}){
    const summary=useSessions(s=>s.byId[member.id]),status=useSessionStatus(s=>s.get(member.id));
    const state=memberState(member,status,summary),names={running:'运行中',inactive:'未运行',waiting:'等待操作',provisioning:'准备中',failed:'失败',unknown:'待同步'};
    const disabled=member.id===sessionId||state==='failed'||state==='provisioning';
    return h('button',{type:'button',className:'naumi-member',disabled,'data-member-state':state,title:member.error??member.name,onClick:()=>{try{const native=originals.get('agent-team')?.inject?.(sessionId);if(!native?.openTeammate)throw Error('团队入口尚未就绪');native.openTeammate(sessionId,member.id);}catch(e){onError(e.message);}}},
      h('span',{className:'naumi-member-icon','aria-hidden':true},teamInitials(member.name)),h('span',{className:'naumi-member-name'},member.name,member.id===sessionId&&h('small',null,'当前会话')),
      h('span',{className:'naumi-member-state'},h('i'),names[state]??'待同步'));
  }
  function Task({task,team,sessionId,onOpenMember}){
    const member=team.members.find(m=>m.name===task.ownerName),labels={in_progress:'进行中',pending:task.ready?'待开始':'等待依赖',completed:'已完成'};
    return h('details',{className:'naumi-team-task','data-task-id':task.id,'data-task-status':task.status},
      h('summary',null,h('span',{className:'naumi-task-mark','aria-hidden':true},task.status==='completed'?'✓':task.status==='in_progress'?'◉':'○'),h('span',{className:'naumi-task-summary'},h('strong',null,task.subject),h('span',null,task.ownerName??'未分配')),h('span',{className:'naumi-task-status'},labels[task.status])),
      h('div',{className:'naumi-task-body'},h('p',null,task.description),task.blockedBy?.length>0&&h('div',{className:'naumi-task-dependencies'},'依赖 ',task.blockedBy.join(' · ')),task.writeScopeWarnings?.map((warning,i)=>h('p',{className:'naumi-context-error',key:i},warning)),member&&member.id!==sessionId&&h('button',{type:'button',className:'naumi-text-action',disabled:member.phase!=='active',onClick:()=>onOpenMember(member)},'打开成员会话',h(Icon,{name:'arrow',size:13}))));
  }
  function Schedules({leadId,useAccess}){
    const source=useNativeEntry('conversation.session.header.utilities','schedule-catalog');
    const editorEntry=useNativeEntry('sidebar.right.pane.tab','@deepseek-ai/dsh-client-ui-schedule/task');
    const native=useMemo(()=>source?.inject?.(leadId),[source,leadId]),editor=useMemo(()=>editorEntry?.inject?.(),[editorEntry]);
    const catalog=native?.hooks?.catalog;
    const snapshot=useSyncExternalStore(catalog?.subscribe??noop,catalog?.getSnapshot??(()=>emptyCatalog),()=>emptyCatalog);
    const canRead=useAccess('schedule/catalog'),canEdit=useAccess('schedule/edit');
    const rows=useMemo(()=>teamSchedules(snapshot.records,leadId),[snapshot.records,leadId]);
    const [busy,setBusy]=useState(new Set()),[error,setError]=useState(null),pending=useRef(new Set()),alive=useRef(true);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    const toggle=async row=>{
      if(pending.current.has(row.id)||!canEdit||snapshot.status!=='ready'||!editor?.hostActions?.edit)return;
      pending.current.add(row.id);setBusy(new Set(pending.current));setError(null);
      try{
        const result=await editor.hostActions.edit(scheduleToggleRequest(row));
        if(alive.current&&result!=='saved')setError(result?.failed==='host.conflict'?'任务已被更新，请重新操作':result?.failed==='detail.missing'?'任务已移除':'更新失败，请打开任务详情重试');
      }catch{if(alive.current)setError('更新失败，请打开任务详情重试');}
      finally{pending.current.delete(row.id);if(alive.current)setBusy(new Set(pending.current));}
    };
    if(!source||!canRead)return null;
    return h('section',{className:'naumi-context-section naumi-schedules'},
      h('div',{className:'naumi-context-heading'},h('h3',null,'自动任务'),h('button',{type:'button',className:'naumi-text-action','aria-label':'管理自动任务',onClick:()=>ctx.layout.selectPanel('schedules')},'管理',h(Icon,{name:'arrow',size:13}))),
      snapshot.status==='error'&&h('div',{className:'naumi-context-error',role:'alert'},'自动任务读取失败',h('button',{type:'button',className:'naumi-text-action',onClick:()=>native.onRetry(snapshot.readRequest)},'重试')),
      !snapshot.settled&&snapshot.status!=='error'?h('p',{className:'naumi-context-empty',role:'status'},'读取中…'):rows.length===0&&snapshot.status!=='error'?h('div',{className:'naumi-schedule-empty'},h(Icon,{name:'clock',size:18}),h('span',null,'暂无自动任务')):null,
      rows.map(row=>h('div',{key:row.id,className:'naumi-schedule-card','data-schedule-id':row.id},h('button',{type:'button',className:'naumi-schedule-open',onClick:()=>native.openTaskDetail(row.id)},h(Icon,{name:'clock',size:17}),h('span',null,h('strong',null,row.title),h('small',null,row.executionActive?'执行中':row.status==='paused'?'已暂停':scheduleTime(row)?new Intl.DateTimeFormat('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(scheduleTime(row)):'时间待同步'))),h('button',{type:'button',role:'switch','aria-checked':row.status==='active','aria-label':(row.status==='active'?'暂停':'恢复')+'自动任务 '+row.title,className:'naumi-schedule-switch',disabled:!canEdit||!editor?.hostActions?.edit||snapshot.status!=='ready'||!!row.executionActive||busy.has(row.id),onClick:()=>toggle(row)},h('span')))),
      error&&h('p',{className:'naumi-context-error',role:'alert'},error));
  }
  function Environment({visible}){
    const [value,setValue]=useState(null),[refresh,setRefresh]=useState(0);
    useEffect(()=>{
      if(!visible)return;
      const controller=new AbortController();let disposed=false,last=0;
      const update=async()=>{last=Date.now();setValue(null);const result=await readEnvironment(fetch,AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])).catch(()=>null);if(!disposed)setValue(result??{desktop:{state:'error'},browser:{state:'error'}});};
      void update();const focus=()=>{if(document.visibilityState==='visible'&&Date.now()-last>30000)void update();};window.addEventListener('focus',focus);
      return()=>{disposed=true;controller.abort();window.removeEventListener('focus',focus);};
    },[visible,refresh]);
    const desktop=value?.desktop?.value,browser=value?.browser?.value;
    const desktopLabel=!value?'检测中':value.desktop.state!=='ready'?'读取失败':desktop.status==='ready'?'工具就绪':'未就绪';
    const browserLabel=!value?'检测中':value.browser.state!=='ready'?'读取失败':browser.presentation==='native-webview'&&browser.status==='connected'?'原生模式':browser.status==='installed'?'已安装':browser.status==='disconnected'?'连接异常':'未安装';
    return h('section',{className:'naumi-context-section naumi-environment'},h('div',{className:'naumi-context-heading'},h('h3',null,'工作环境'),h('button',{type:'button',className:'naumi-text-action','aria-label':'刷新工作环境',disabled:!value,onClick:()=>setRefresh(v=>v+1)},'刷新')),
      h('div',{className:'naumi-environment-card'},h('button',{type:'button',className:'naumi-resource-row',onClick:()=>ctx.layout.selectPanel('plugins')},h('span',{className:'naumi-environment-icon'},h(Icon,{name:'grid',size:18})),h('span',{className:'naumi-environment-name'},'本机电脑'),h('span',{className:'naumi-environment-status'},desktopLabel)),
        h('button',{type:'button',className:'naumi-resource-row',disabled:!['installed','connected'].includes(browser?.status),onClick:()=>ctx.get('sidebarRight').openTab('browser')},h('span',{className:'naumi-environment-icon'},h(Icon,{name:'link',size:18})),h('span',{className:'naumi-environment-name'},'浏览器'),h('span',{className:'naumi-environment-status'},browserLabel))));
  }
  function ContextPanel({sessionId,useSession,useSessions,useSessionStatus,useProjection,useInput,useAccess}){
    const leadId=useSession(s=>s.subagent?.address.parentSessionId)??sessionId;
    const team=useSessions(s=>s.projectionsBySession[leadId]?.values.agentTeam);
    const profile=useSessions(s=>s.projectionsBySession[leadId]?.values.naumiTeamProfile);
    const catalogSource=botCatalog(),catalog=useSyncExternalStore(catalogSource.subscribe,catalogSource.getSnapshot,catalogSource.getSnapshot),bot=botForSession(catalog.bots,leadId);
    const status=useSessionStatus(s=>s.get(sessionId));
    const input=useInput(s=>s),stats=useProjection('sessionStats'),usage=useProjection('tokenUsage'),pressure=useProjection('contextPressure');
    const readings=naumiMonitorReadings(stats,usage,pressure),groups=useMemo(()=>teamTaskGroups(team),[team]);
    const [geometry,setGeometry]=useState(null),[preference,setPreference]=useState(null),[files,setFiles]=useState([]),[error,setError]=useState(null),[tab,setTab]=useState('activity');
    const rootRef=useRef(null),toggleRef=useRef(null);
    const refs=useMemo(()=>Object.fromEntries(['team','children','preset','activity','usage'].map(key=>[key,node=>setDock(sessionId,key,node)])),[sessionId]);
    const room=(geometry?.width??0)>=780,open=preference??room,width=Math.min(344,Math.max(260,(geometry?.width??344)-20));
    useEffect(()=>{setTab('activity');setError(null);},[leadId]);
    useLayoutEffect(()=>{
      const root=document.querySelector('[data-slot="main.conversation"] > div');if(!root)return;
      rootRef.current=root;root.dataset.naumiContextRoot='true';let scheduled=false,disposed=false;
      const measure=()=>{const r=root.getBoundingClientRect();setGeometry(old=>old&&old.left===r.left&&old.top===r.top&&old.width===r.width&&old.height===r.height?old:{left:r.left,top:r.top,width:r.width,height:r.height});};
      const update=()=>{if(scheduled||disposed)return;scheduled=true;queueMicrotask(()=>{scheduled=false;if(disposed)return;
        const list=[...root.querySelectorAll('[data-presented-file="true"] button[title]')].map(button=>({path:button.title,name:button.title.split(/[\\/]/).pop(),button}));
        const seen=new Set(),unique=list.filter(x=>x.path&&!seen.has(x.path)&&seen.add(x.path));setFiles(old=>old.length===unique.length&&old.every((f,i)=>f.path===unique[i].path&&f.button===unique[i].button)?old:unique);
        for(const tabs of root.querySelectorAll('[data-conversation-tabs]')){for(const button of tabs.querySelectorAll('[role="tab"]'))if(button.textContent.trim()==='轨迹'&&button.getAttribute('data-naumi-hidden')!=='true')button.setAttribute('data-naumi-hidden','true');const row=tabs.parentElement;if(row&&!row.hasAttribute('data-naumi-view-strip'))row.setAttribute('data-naumi-view-strip','true');}
      });};
      const resize=new ResizeObserver(measure);resize.observe(root);window.addEventListener('resize',measure);measure();
      const observer=new MutationObserver(update);observer.observe(root,{childList:true,subtree:true});update();
      return()=>{disposed=true;resize.disconnect();observer.disconnect();window.removeEventListener('resize',measure);delete root.dataset.naumiContextRoot;delete root.dataset.naumiContextOpen;root.style.removeProperty('--naumi-context-reserve');for(const e of root.querySelectorAll('[data-naumi-hidden],[data-naumi-view-strip]')){e.removeAttribute('data-naumi-hidden');e.removeAttribute('data-naumi-view-strip');}rootRef.current=null;};
    },[sessionId]);
    useLayoutEffect(()=>{const root=rootRef.current;if(!root)return;root.dataset.naumiContextOpen=String(open);root.style.setProperty('--naumi-context-reserve',open&&room?`${width}px`:'0px');},[open,room,width]);
    const act=fn=>()=>{setError(null);try{fn();}catch(e){setError(e.message??String(e));}};
    const openMember=member=>act(()=>{const native=originals.get('agent-team')?.inject?.(sessionId);if(!native?.openTeammate)throw Error('团队入口尚未就绪');native.openTeammate(sessionId,member.id);})();
    const close=()=>{setPreference(false);toggleRef.current?.focus();};
    const focusInput=()=>rootRef.current?.querySelector('[contenteditable="true"]')?.focus();
    const name=bot?.name||profile?.name||'智能体团队',members=team?.members??[],tabId=kind=>`naumi-${sessionId}-${kind}`;
    const side=geometry&&h('aside',{className:'naumi-context-panel'+(!room?' drawer':''),hidden:!open,'aria-label':'智能体团队','data-naumi-context-session':sessionId,'data-team-id':leadId,onKeyDown:e=>{if(e.key==='Escape'&&!room&&!e.defaultPrevented){e.preventDefault();close();}},style:{left:geometry.left+geometry.width-width,top:geometry.top,width,height:geometry.height}},
      h('header',{className:'naumi-context-head'},h('span',null,'团队'),h('button',{type:'button',className:'naumi-context-icon','aria-label':'收起智能体团队',onClick:close},'×')),
      h('div',{className:'naumi-context-scroll'},
        h('section',{className:'naumi-team-identity'},h('div',{className:'naumi-team-avatar'+(bot?' naumi-bot-avatar '+botTone(bot.id):''),'aria-hidden':true},bot?h(Icon,{name:bot.kind==='team'?'layers':'spark',size:30}):profile?.name?teamInitials(profile.name):h('img',{src:'/naumi/assets/symbol.svg',alt:'',width:32,height:32})),h('h2',{'data-team-name':true},name),
          h('details',{className:'naumi-team-roster',key:leadId},h('summary',null,h('span',{className:'naumi-team-faces','aria-hidden':true},members.slice(0,4).map(m=>h('span',{key:m.id},teamInitials(m.name)))),h('span',null,team?`${members.length} 位成员`:'成员待同步'),h('span',{className:'naumi-roster-chevron','aria-hidden':true},'⌄')),
            members.map(member=>h(Member,{key:member.id,member,sessionId,useSessions,useSessionStatus,onError:setError})),h('div',{className:'naumi-roster-actions'},h('div',{className:'naumi-team-native',ref:refs.team}),h('div',{className:'naumi-child-native',ref:refs.children})))),
        (team?.failure||profile?.failure)&&h('p',{className:'naumi-context-error',role:'alert'},team?.failure??profile.failure),
        h('div',{className:'naumi-team-tabs',role:'tablist','aria-label':'团队信息',onKeyDown:e=>{const kinds=['activity','library'],index=kinds.indexOf(tab);let next;if(e.key==='ArrowRight')next=kinds[(index+1)%2];if(e.key==='ArrowLeft')next=kinds[(index+1)%2];if(e.key==='Home')next=kinds[0];if(e.key==='End')next=kinds[1];if(next){e.preventDefault();setTab(next);document.getElementById(tabId(next))?.focus();}}},...['activity','library'].map(kind=>h('button',{key:kind,type:'button',role:'tab',id:tabId(kind),'aria-selected':tab===kind,'aria-controls':tabId(kind+'-panel'),tabIndex:tab===kind?0:-1,onClick:()=>setTab(kind)},kind==='activity'?'动态':'资料'))),
        h('div',{role:'tabpanel',id:tabId('activity-panel'),'aria-labelledby':tabId('activity'),hidden:tab!=='activity'},
          h('section',{className:'naumi-context-section naumi-team-tasks'},h('div',{className:'naumi-context-heading'},h('h3',null,'当前任务'),groups.active.length>0&&h('span',{className:'naumi-count'},groups.active.length)),
            groups.active.length?groups.active.map(task=>h(Task,{key:task.id,task,team,sessionId,onOpenMember:openMember})):h('p',{className:'naumi-context-empty'},team?'暂无进行中的任务':'读取中…')),
          groups.completed.length>0&&h('details',{className:'naumi-completed-tasks'},h('summary',null,h('span',null,'已完成'),h('span',null,groups.completed.length),h('span',{'aria-hidden':true},'⌄')),groups.completed.map(task=>h(Task,{key:task.id,task,team,sessionId,onOpenMember:openMember}))),
          h(Schedules,{key:leadId,leadId,useAccess}),h(Environment,{visible:open&&tab==='activity'})),
        h('div',{role:'tabpanel',id:tabId('library-panel'),'aria-labelledby':tabId('library'),hidden:tab!=='library'},
          h('section',{className:'naumi-context-section'},h('div',{className:'naumi-context-heading'},h('h3',null,'交付文件'),h('span',{className:'naumi-count'},files.length)),files.length===0&&h('p',{className:'naumi-context-empty'},'暂无交付文件'),h('div',{className:'naumi-context-files'},files.map(file=>h('button',{type:'button',key:file.path,title:file.path,onClick:act(()=>{if(!file.button.isConnected)throw Error('文件列表已更新，请重新打开');file.button.click();})},h('span',{className:'naumi-file-icon'},h(Icon,{name:'layers',size:17})),h('span',null,file.name),h(Icon,{name:'arrow',size:13}))))),
          h('section',{className:'naumi-context-section'},h('div',{className:'naumi-context-heading'},h('h3',null,'工作资料')),h('button',{type:'button',className:'naumi-resource-row',onClick:act(()=>ctx.get('sidebarRight').openTab('files'))},h(Icon,{name:'grid',size:17}),'工作区文件',h(Icon,{name:'arrow',size:13})),h('button',{type:'button',className:'naumi-resource-row',onClick:focusInput},h(Icon,{name:'link',size:17}),'本次引用',h('span',null,(input?.occurrences?.length??0)+(input?.attachmentIds?.length??0)))),
          h('section',{className:'naumi-context-section'},h('div',{className:'naumi-context-heading'},h('h3',null,'技能与工具')),h('button',{type:'button',className:'naumi-resource-row',onClick:()=>ctx.layout.selectPanel('plugins')},h(Icon,{name:'layers',size:17}),'插件与 MCP',h(Icon,{name:'arrow',size:13})))),
        error&&h('p',{className:'naumi-context-error',role:'alert'},error)),
      h('footer',{className:'naumi-context-monitor'},h('details',{className:'naumi-run-details'},h('summary',null,h(Icon,{name:'clock',size:15}),h('span',null,'运行详情'),h('span',{className:'naumi-run-state','data-running':!!status?.running},runLabel(status)),h('span',{'aria-hidden':true},'⌄')),
        h('div',{className:'naumi-run-body'},h('div',{className:'naumi-metrics'},...[[readings.speed===null?'—':Math.round(readings.speed),'tok/s','输出速度'],[short(readings.total),'tok','累计用量'],[readings.cache===null?'—':readings.cache<100&&Math.round(readings.cache)===100?'99.9':Math.round(readings.cache),'%','缓存命中']].map(([value,unit,label])=>h('div',{key:label},h('strong',null,value,value!=='—'&&h('small',null,unit)),h('span',null,label)))),
          h('div',{className:'naumi-context-capacity'},h('div',null,h('span',null,'上下文占用'),h('button',{type:'button',title:'查看原生上下文详情',onClick:act(()=>{const button=rootRef.current?.querySelector('.JObwrW_trigger');if(button)button.click();else throw Error('上下文详情尚未就绪');})},readings.context===null?'—':readings.context+'%')),h('div',{className:'naumi-capacity-track'},h('i',{style:{width:(readings.context??0)+'%'}}))),
          h('details',{className:'naumi-native-stat-details'},h('summary',null,'详细用量'),h('div',{ref:refs.activity}),h('div',{ref:refs.usage})),h('details',{className:'naumi-advanced'},h('summary',null,'运行设置'),h('div',{className:'naumi-preset-native',ref:refs.preset}))))));
    return h(React.Fragment,null,h('button',{type:'button',className:'naumi-context-toggle',ref:toggleRef,'aria-label':open?'收起智能体团队':'打开智能体团队','aria-expanded':!!open,onClick:()=>setPreference(!open)},h(Icon,{name:'layers',size:16}),'团队'),side&&createPortal(side,document.body));
  }
  register(ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'naumi-context-ui',order:80},ContextPanel)));
  return()=>{for(const dispose of disposers.reverse())dispose();docks.clear();listeners.clear();originals.clear();};
}
