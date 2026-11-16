import {MODE_KEY,navigationMode,botActivity,botSummary,botTarget,botSessions,botTone,newBotTaskRequest,botCatalog,currentSessionId,botSelected} from './bot-sidebar-model.js';

export function installBotSidebar(ctx,React,Icon,createPortal){
  return ctx.inject(['remote.session'],scope=>installNavigation(scope,React,Icon,createPortal));
}
function installNavigation(ctx,React,Icon,createPortal){
  const h=React.createElement,{useState,useEffect,useLayoutEffect,useRef,useSyncExternalStore}=React,source=botCatalog();
  function BotRow({bot,props}){
    const {useSessions,useSessionStatus,usePanelInfo,useWorkspaces}=props;
    const sessions=useSessions(s=>s),status=useSessionStatus(s=>s),workspaces=useWorkspaces(s=>s),panelId=usePanelInfo(s=>s.activePanelId),currentId=currentSessionId(sessions,panelId);
    const [history,setHistory]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(null),[unbound,setUnbound]=useState(null),alive=useRef(true),flight=useRef(false);
    useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
    const target=botTarget(bot,sessions,status,workspaces),state=botActivity(bot,sessions,status),rows=botSessions(bot,sessions,workspaces);
    const stateName={running:'工作中',waiting:'待你确认',idle:'待命',unknown:'待同步'}[state];
    const open=id=>{setError(null);try{ctx.uiWorkspace.openSession(id);}catch{setError('任务暂未就绪');}};
    const newTask=async()=>{
      if(flight.current)return;flight.current=true;setBusy(true);setError(null);let id=unbound;
      try{
        if(!id){const response=await ctx.remote.session.create(newBotTaskRequest(bot,workspaces));if(!response.ok)throw Error('BOT_CREATE_SESSION_FAILED');id=response.value.sessionId;if(alive.current)setUnbound(id);}
        await source.bind(bot,id);if(alive.current){setUnbound(null);open(id);setHistory(true);}
      }catch(error){if(alive.current)setError(error.message==='BOT_CONFLICT'?'Bot 已更新，请重试关联':error.message==='BOT_ARCHIVED'?'Bot 已归档':'任务关联失败，可重试或在线程模式查看');}
      finally{flight.current=false;if(alive.current)setBusy(false);}
    };
    return h('div',{className:'naumi-bot-entry','data-bot-id':bot.id,'data-selected':botSelected(bot,currentId,sessions),'data-bot-state':state},
      h('div',{className:'naumi-bot-row'},h('button',{type:'button',className:'naumi-bot-open',onClick:()=>target?open(target):setHistory(true),'aria-label':bot.name+'，'+stateName,title:bot.name},h('span',{className:'naumi-bot-avatar '+botTone(bot.id),'aria-hidden':true},h(Icon,{name:bot.kind==='team'?'layers':'spark',size:21})),h('span',{className:'naumi-bot-caption'},h('strong',null,bot.name),h('span',null,botSummary(bot,sessions))),h('span',{className:'naumi-bot-state',title:stateName,'aria-label':stateName})),
        h('button',{type:'button',className:'naumi-bot-history-toggle','aria-label':bot.name+'的任务记录','aria-expanded':history,onClick:()=>setHistory(v=>!v)},'⌄')),
      h('div',{className:'naumi-bot-history',hidden:!history},h('div',{className:'naumi-bot-history-head'},h('span',null,'任务记录'),h('button',{type:'button',className:'naumi-bot-link',disabled:busy,onClick:newTask},busy?'创建中…':unbound?'重试关联':'+ 新任务')),rows.length?rows.slice().reverse().map(row=>h('button',{type:'button',key:row.sessionId,className:'naumi-bot-task-link','aria-current':row.sessionId===currentId?'page':undefined,onClick:()=>open(row.sessionId)},h(Icon,{name:'chat',size:13}),h('span',null,sessions.projectionsBySession[row.sessionId]?.values.title??row.projections?.values?.title??'新任务'))):h('p',{className:'naumi-bot-empty'},'暂无可打开的任务')),
      error&&h('div',{className:'naumi-bot-error',role:'alert'},error,unbound&&h('button',{type:'button',className:'naumi-bot-link',disabled:busy,onClick:newTask},'重试关联')));
  }
  function Navigation(props){
      const [mode,setMode]=useState(()=>{try{return navigationMode(localStorage.getItem(MODE_KEY));}catch{return 'threads';}}),[search,setSearch]=useState(''),[error,setError]=useState(null);
      const [surface,setSurface]=useState(null),[wide,setWide]=useState(true);
      const catalog=useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);
      useLayoutEffect(()=>{
        let target=null,resize=null,children=null,disposed=false;
        const detach=()=>{resize?.disconnect();children?.disconnect();if(target){target.classList.remove('naumi-navigation');delete target.dataset.naumiNavSurface;delete target.dataset.navigationMode;delete target.dataset.wide;for(const child of target.children)delete child.dataset.naumiThreadContent;}};
        const find=()=>{
          if(disposed||target?.isConnected)return;
          const next=document.querySelector('[data-slot="sidebar.workspaces"]');if(next===target)return;
          detach();target=next;setSurface(next);if(!target)return;
          target.classList.add('naumi-navigation');target.dataset.naumiNavSurface='true';
          const mark=()=>{for(const child of target.children)if(!child.hasAttribute('data-naumi-navigation-owned'))child.dataset.naumiThreadContent='true';};
          mark();children=new MutationObserver(mark);children.observe(target,{childList:true});
          const measure=()=>setWide(target.getBoundingClientRect().width>=100);resize=new ResizeObserver(measure);resize.observe(target);measure();
        };
        find();const observer=new MutationObserver(find);observer.observe(document.getElementById('root')??document.body,{childList:true,subtree:true});
        return()=>{disposed=true;observer.disconnect();detach();};
      },[]);
      useLayoutEffect(()=>{if(surface){surface.dataset.navigationMode=mode;surface.dataset.wide=String(wide);}},[surface,mode,wide]);
      useEffect(()=>{const change=e=>{if(e.key===MODE_KEY)setMode(navigationMode(e.newValue));};window.addEventListener('storage',change);return()=>window.removeEventListener('storage',change);},[]);
      const choose=value=>{setMode(value);try{localStorage.setItem(MODE_KEY,value);}catch{}};
      const bots=catalog.bots.filter(bot=>bot.status==='active'&&(!search||bot.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
      const create=()=>{setError(null);try{ctx.uiWorkspace.startSession(undefined,{prompt:'请根据我的需求创建一个可长期复用的 Bot（独立智能体或团队），由你自主确定名称与职责，并使用 bot_create 保存身份。不要预置固定岗位，也不要执行尚未确认的业务操作。\n\n我的需求：',whenDraftExists:'append'});}catch{setError('请先选择一个工作区');}};
      if(!surface)return null;
      return createPortal(h(React.Fragment,null,
        h('div',{className:'naumi-navigation-switch','data-naumi-navigation-owned':true,role:'group','aria-label':'导航模式'},h('button',{type:'button','aria-pressed':mode==='threads',onClick:()=>choose('threads'),title:'线程模式'},wide?'线程':h(Icon,{name:'chat',size:16})),h('button',{type:'button','aria-pressed':mode==='bot',onClick:()=>choose('bot'),title:'Bot 模式'},wide?'Bot':h(Icon,{name:'spark',size:16}))),
        h('div',{className:'naumi-bot-navigation','data-naumi-navigation-owned':true,hidden:mode!=='bot'},h('div',{className:'naumi-bot-toolbar'},wide&&h('label',{className:'naumi-bot-search'},h(Icon,{name:'search',size:14}),h('input',{'aria-label':'搜索 Bot',placeholder:'搜索',value:search,onChange:e=>setSearch(e.target.value)})),h('button',{type:'button',className:'naumi-bot-add','aria-label':'创建 Bot',title:'创建 Bot',onClick:create},'+')),
          catalog.status==='loading'&&catalog.bots.length===0&&h('p',{className:'naumi-bot-empty',role:'status'},wide?'读取中…':'…'),
          ['error','forbidden'].includes(catalog.status)&&h('div',{className:'naumi-bot-error',role:'alert'},wide?(catalog.status==='forbidden'?'请重新连接工作空间':'Bot 目录读取失败'):'!',h('button',{type:'button',className:'naumi-bot-link',onClick:()=>source.refresh()},'重试')),
          catalog.status==='ready'&&bots.length===0&&h('div',{className:'naumi-bot-empty',role:'status'},wide&&h('span',null,search?'没有匹配的 Bot':'暂无 Bot'),!search&&wide&&h('button',{type:'button',className:'naumi-bot-create',onClick:create},'创建 Bot')),
          bots.map(bot=>h(BotRow,{key:bot.id,bot,props})),error&&h('p',{className:'naumi-bot-error',role:'alert'},error))),surface);
  }
  // Additive overlay registration: the native workspace parent keeps sole ownership of all child slots.
  return ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'naumi-navigation-modes',order:90},Navigation));
}
