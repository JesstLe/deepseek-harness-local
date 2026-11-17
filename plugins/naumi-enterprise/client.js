/** Async presentation-only module; the original enterprise app below stays intact. */
function installNaumiContextUI(ctx,React,createPortal,Icon){
  ctx.effect(()=>{let dispose,closed=false;void import('/naumi/assets/bot-overview.js').then(module=>{if(!closed)dispose=module.installBotOverviewUI(ctx,React);});return()=>{closed=true;dispose?.();};});
  ctx.effect(()=>{let dispose,closed=false;void import('/naumi/assets/blender-settings.js').then(m=>{if(!closed)dispose=m.installBlenderUI(ctx,React);}).catch(e=>console.error('Naumi Blender:',e));return()=>{closed=true;dispose?.();};});
  ctx.effect(()=>{let dispose,closed=false;void import('/naumi/assets/plugin-market.js').then(module=>{if(!closed)dispose=module.installPluginMarketUI(ctx,React);}).catch(error=>console.error('Naumi plugin market:',error));return()=>{closed=true;dispose?.();};});
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/im-settings.js').then(module=>{if(!closed)dispose=module.installIMSettingsUI(ctx,React);}).catch(error=>console.error('Naumi IM settings:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/primary-bot.js').then(module=>{if(!closed)dispose=module.installPrimaryBotUI(ctx,React);}).catch(error=>console.error('Naumi primary Bot:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/desktop-updates.js').then(module=>{if(!closed)dispose=module.installDesktopUpdatesUI(ctx,React,createPortal);}).catch(error=>console.error('Naumi updates:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/product-identity.js').then(module=>{if(!closed)dispose=module.installProductIdentity(ctx,{version:window.__NAUMI__?.productVersion});}).catch(error=>console.error('Naumi product identity:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/model-connections.js').then(module=>{if(!closed)dispose=module.installModelConnectionsUI(ctx,React);}).catch(error=>console.error('Naumi model connections:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.effect(()=>{
    let moduleScope,closed=false;
    void import('/naumi/assets/bot-task-ui.js').then(module=>{if(!closed)moduleScope=module.installBotTaskUI(ctx,React);}).catch(error=>console.error('Naumi background tasks:',error));
    return()=>{closed=true;if(typeof moduleScope==='function')moduleScope();else moduleScope?.dispose?.();};
  });
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/employee-experience.js').then(module=>{if(!closed)dispose=module.installEmployeeExperience(ctx,React,createPortal);}).catch(error=>console.error('Naumi employee experience:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/team-panel.js').then(module=>{if(!closed)dispose=module.installTeamPanel(ctx,React,createPortal,Icon);}).catch(error=>console.error('Naumi team panel:',error));
    return()=>{closed=true;dispose?.();};
  });
  ctx.inject(['remote'],scope=>scope.effect(()=>{
    let dispose,closed=false;
    void import('/naumi/assets/bot-sidebar.js').then(module=>{if(!closed)dispose=module.installBotSidebar(scope,React,Icon,createPortal);}).catch(error=>console.error('Naumi navigation:',error));
    return()=>{closed=true;dispose?.();};
  }));
}
window.__ModuleLoader__.load({id:'@naumi/dsh-enterprise',factory(require){
  const React=require('react');
  const h=React.createElement;
  const {useEffect,useState,useSyncExternalStore,useRef}=React;
  const STATUS={draft:'草稿',unassigned:'待分配',assigned:'待领取',in_progress:'制作中',quality_review:'专业审核',changes_requested:'待修改',business_acceptance:'业务验收',accepted:'已验收',paused:'已暂停',cancelled:'已取消'};
  const PANELS=[['naumi-workbench','工作台','grid'],['naumi-projects','项目与需求','layers'],['naumi-delivery','交付中心','check'],['naumi-design','设计中心','spark'],['naumi-connections','系统连接','link']];
  const PATHS={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',layers:'m12 3 10 6-10 6L2 9z M2 13l10 6 10-6 M2 17l10 6 10-6',check:'M9 12l2 2 4-4 M20 12a8 8 0 1 1-8-8 M16 3h5v5',spark:'m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6z',link:'m10 13 4-4 M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0',arrow:'M7 17 17 7 M7 7h10v10',refresh:'M20 7v5h-5 M4 17v-5h5 M19 10a7 7 0 0 0-12-5L4 8 M5 14a7 7 0 0 0 12 5l3-3',search:'M21 21l-6-6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',chat:'M21 11a9 9 0 0 1-9 9H4l-3 2V11a10 10 0 0 1 20 0z M7 10h10 M7 14h6',calendar:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 10h16',box:'m3 7 9-5 9 5v11l-9 5-9-5z M3 7l9 5 9-5 M12 12v11',film:'M3 4h18v16H3z M7 4v16 M17 4v16 M3 9h4 M3 15h4 M17 9h4 M17 15h4',image:'M3 3h18v18H3z m0 14 5-5 5 5 4-4 4 4 M7 7h.01',clock:'M12 4a8 8 0 1 1-8 8 8 8 0 0 1 8-8z M12 8v5l3 2',logout:'M10 4H3v16h7 M14 8l4 4-4 4 M8 12h12'};
  function Icon({name,size=19}){return h('svg',{width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:PATHS[name]??PATHS.grid}));}
  function apply(ctx){
    const config=window.__NAUMI__;
    if(!config)throw Error('Naumi host configuration missing');
    const BotGroups=React.lazy(()=>import('/naumi/assets/bot-groups.js').then(module=>({default:module.createBotGroupsPage(ctx,React)}))
      .catch(()=>({default:()=>h('p',{className:'naumi-page',role:'alert'},'群聊界面加载失败，请刷新页面。')})));
    installNaumiContextUI(ctx,React,require('react-dom').createPortal,Icon);
    ctx.inject(['sidebarRight','sidebarRightTabs'],scope=>scope.effect(()=>{let dispose,closed=false;void import('/naumi/assets/browser-client.js').then(m=>{if(!closed)dispose=m.installBrowserUI(scope,React,Icon);}).catch(e=>console.error('Naumi browser UI:',e));return()=>{closed=true;dispose?.();};}));
    ctx.effect(()=>{
      const language=ctx.locale.addLanguage({id:'zh-Naumi',label:'简体中文 · Naumi',fallback:'zh'});
      const dictionary=ctx.locale.register('conversation','zh-Naumi',{'hero.headline':'AI 协作','hero.preview':''});
      return()=>{dictionary();language();};
    });
    const listeners=new Set();let snapshot={status:'loading',data:null,error:null};let pending=null,controller=null,disposed=false,lastLoad=0;
    const publish=next=>{if(disposed)return;snapshot=next;for(const cb of listeners)cb();};
    const refresh=()=>{
      if(pending)return pending;
      controller=new AbortController();publish({status:'loading',data:null,error:null});
      pending=(async()=>{
        try{
          const response=await fetch('/naumi/workspace',{credentials:'same-origin',cache:'no-store',signal:controller.signal});
          const data=await response.json();
          if(response.ok)publish({status:'ready',data,error:null});
          else publish({status:response.status===401?'login':response.status===403?'forbidden':'error',data:null,error:data.error});
        }catch(error){if(error.name!=='AbortError')publish({status:'error',data:null,error:'COLLABORATION_UNAVAILABLE'});}
        finally{pending=null;lastLoad=Date.now();}
      })();return pending;
    };
    const subscribe=callback=>{listeners.add(callback);return()=>listeners.delete(callback);};
    function useBusiness(){return useSyncExternalStore(subscribe,()=>snapshot,()=>snapshot);}
    function openAI(prompt){
      if(prompt&&ctx.workspaces.list.getSnapshot().items.length===0)throw Error('请先在左侧选择一个本地工作区，再放入草稿');
      // startSession owns the navigation; selecting a panel here would cancel its async workspace connection.
      ctx.uiWorkspace.startSession(undefined,prompt?{prompt,whenDraftExists:'append'}:undefined);
    }
    function external(url,label,icon='arrow',className=''){return h('a',{href:url,target:'_blank',rel:'noopener noreferrer',className},label,h(Icon,{name:icon,size:16}));}
    function Mark({size=28,className}){return h('img',{src:'/naumi/assets/symbol.svg',width:size,height:size,alt:'Naumi',className});}
    function Wordmark(){return h('img',{src:'/naumi/assets/wordmark.svg',alt:'Naumi',width:95,height:24,className:'naumi-wordmark'});}
    function Badge({status}){return h('span',{className:'naumi-badge '+(['accepted'].includes(status)?'success':['changes_requested','paused'].includes(status)?'warning':['quality_review','business_acceptance'].includes(status)?'purple':'')},STATUS[status]??status??'—');}
    function TaskContext({task,data,onClose}){
      const returnFocus=useRef(document.activeElement);
      useEffect(()=>{const escape=e=>{if(e.key==='Escape')onClose();};document.addEventListener('keydown',escape);return()=>{document.removeEventListener('keydown',escape);if(returnFocus.current?.isConnected)returnFocus.current.focus();};},[]);
      const request=data.requests.find(x=>x.id===task.requestId);
      const product=data.products.find(x=>x.id===request?.productId);
      const [draftError,setDraftError]=useState(null);
      const [prompt,setPrompt]=useState(()=>[
        '请基于以下 Naumi 企业协作任务整理执行方案。仅起草建议，不进行派单、审批、提交或验收。',
        `企业：${data.actor.tenantName}`,`任务：${task.title}`,`任务ID：${task.id}`,`状态：${STATUS[task.status]??task.status}`,
        product?`商品：${product.name}（${product.sku}）`:'',`截止：${task.dueDate??'未指定'}`,
        request?.brief?`需求：${request.brief}`:'',`业务入口：${config.collaborationOrigin}/details/${encodeURIComponent(task.id)}`,
      ].filter(Boolean).join('\n'));
      return h('div',{className:'naumi-modal-mask',onClick:e=>{if(e.target===e.currentTarget)onClose();}},h('section',{role:'dialog','aria-modal':true,'aria-labelledby':'naumi-context-title',className:'naumi-modal',onKeyDown:e=>{if(e.key!=='Tab')return;const controls=[...e.currentTarget.querySelectorAll('button,textarea')];const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}},
        h('div',{className:'naumi-section-head'},h('h2',{id:'naumi-context-title'},'任务上下文'),h('button',{className:'naumi-icon-btn','aria-label':'关闭',onClick:onClose},'×')),
        h('textarea',{'aria-label':'协作上下文草稿',value:prompt,onChange:e=>setPrompt(e.target.value),autoFocus:true}),
        draftError&&h('p',{role:'alert',className:'naumi-draft-error'},draftError),
        h('div',{className:'naumi-modal-actions'},h('button',{className:'naumi-btn',onClick:onClose},'取消'),h('button',{className:'naumi-btn primary',onClick:()=>{try{openAI(prompt);onClose();}catch(error){setDraftError(error.message);}}},'放入会话草稿'))));
    }
    function ConnectionState({state}){
      const titles={loading:'正在连接企业协作',login:'连接企业工作空间',forbidden:'业务权限待分配',error:'企业协作暂未连接'};
      return h('div',{className:'naumi-connection-state','data-connection-state':state.status},h('div',{className:'naumi-connect-symbol'},h(Icon,{name:'link',size:24})),h('h2',null,titles[state.status]),
        h('div',{className:'naumi-actions'},state.status!=='loading'&&external(config.collaborationOrigin+'/login','打开企业协作','arrow','naumi-btn primary'),state.status!=='loading'&&h('button',{className:'naumi-btn',onClick:refresh},'重新连接')));
    }
    function Header({title,state}){
      return h('header',{className:'naumi-page-head'},h('div',null,h('div',{className:'naumi-breadcrumb'},state.data?.actor.tenantName??'Naumi'),h('h1',null,title)),h('div',{className:'naumi-actions'},h('span',{className:'naumi-connection-pill '+(state.status==='ready'?'connected':'')},h('i'),state.status==='ready'?'已连接':state.status==='loading'?'连接中':'未连接'),h('button',{className:'naumi-icon-btn',onClick:refresh,'aria-label':'刷新企业数据',disabled:state.status==='loading'},h(Icon,{name:'refresh'})),h('button',{className:'naumi-btn primary',onClick:()=>openAI()},h(Icon,{name:'chat',size:17}),'AI 协作')));
    }
    function TaskTable({tasks,data,onContext}){
      const rows=tasks.map(task=>h('tr',{key:task.id},
        h('td',null,h('a',{href:config.collaborationOrigin+'/details/'+encodeURIComponent(task.id),target:'_blank',rel:'noopener noreferrer',className:'naumi-task-title'},task.title),h('span',{className:'naumi-task-meta'},data.requests.find(x=>x.id===task.requestId)?.title??'')),
        h('td',null,data.members.find(x=>x.id===task.assigneeId)?.name??'待分配'),
        h('td',null,task.dueDate?.slice(0,10)??'—'),
        h('td',null,h(Badge,{status:task.status})),
        h('td',null,h('button',{className:'naumi-text-btn',onClick:()=>onContext(task),'aria-label':`协作 ${task.title}`},h(Icon,{name:'spark',size:15}),'协作'))
      ));
      return h('div',{className:'naumi-table-scroll'},
        h('table',{className:'naumi-table'},h('thead',null,h('tr',null,...['任务','负责人','截止','状态',''].map((t,i)=>h('th',{key:i},t)))),h('tbody',null,...rows)),
        tasks.length===0&&h('div',{className:'naumi-empty'},'暂无任务'));
    }
    const designTools=[['创作画布','canvas','grid'],['参考工作台','batchshot','image'],['视频工作台','video','film'],['产品精修','retouch','spark'],['一键套图','suite','layers'],['AI 抠图','cutout','image'],['A+ 详情页','aplus','layers'],['3D 工作台','studio3d','box']];
    function IdentityAccount(){
      const [identity,setIdentity]=useState(null);
      useEffect(()=>{let closed=false;globalThis.naumiDesktop?.identityState?.().then(value=>{if(!closed&&value.available)setIdentity(value);}).catch(()=>{});return()=>{closed=true;};},[]);
      if(!identity)return null;
      return h('div',{className:'naumi-connection-row'},h(Icon,{name:'logout'}),h('div',null,h('strong',null,identity.user?.name??'Naumi 账号'),identity.user?.email&&h('span',null,identity.user.email)),h('button',{className:'naumi-btn',onClick:()=>globalThis.naumiDesktop.openIdentity()},'管理账号'));
    }
    function DesignGrid(){return h('div',{className:'naumi-design-grid'},designTools.map(([label,url,icon],i)=>h('a',{key:url,href:config.designOrigin+'/'+url,target:'_blank',rel:'noopener noreferrer',className:'naumi-design-tool'},h('span',{className:'naumi-tool-icon tone-'+i%4},h(Icon,{name:icon,size:25})),h('strong',null,label),h(Icon,{name:'arrow',size:16}))));}
    function Page({page}){
      const state=useBusiness(),data=state.data;
      const [query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[selected,setSelected]=useState(null);
      const title=PANELS.find(x=>x[0]===page)?.[1];
      const tasks=data?.tasks??[];
      const pendingTasks=tasks.filter(t=>!['accepted','cancelled','draft'].includes(t.status));
      const visible=tasks.filter(t=>(!query||t.title.toLowerCase().includes(query.toLowerCase()))&&(filter==='all'||t.status===filter));
      return h('main',{className:'naumi-page','data-naumi-page':page},h(Header,{title,state}),
        page==='naumi-workbench'&&h(React.Fragment,null,
          h('section',{className:'naumi-stats'},...[[pendingTasks.length,'进行中任务','clock'],[tasks.filter(t=>['quality_review','business_acceptance'].includes(t.status)).length,'待审核与验收','check'],[data?.projects.length??0,'协作项目','layers'],[data?.products.length??0,'商品资料','box']].map(([count,label,icon])=>h('div',{className:'naumi-stat',key:label},h('div',null,h('span',null,label),h('strong',null,data?count:'—')),h('span',{className:'naumi-stat-icon'},h(Icon,{name:icon,size:20}))))),
          h('div',{className:'naumi-dashboard-grid'},h('section',{className:'naumi-card naumi-task-card'},h('div',{className:'naumi-section-head'},h('h2',null,'协作任务'),h('button',{className:'naumi-text-btn',onClick:()=>ctx.layout.selectPanel('naumi-projects')},'查看全部',h(Icon,{name:'arrow',size:15}))),data?h(TaskTable,{tasks:pendingTasks.slice(0,6),data,onContext:setSelected}):h(ConnectionState,{state})),
            h('section',{className:'naumi-card naumi-quick'},h('h2',null,'快捷入口'),...[[config.collaborationOrigin+'/workbench','企业协作','grid'],[config.collaborationOrigin+'/schedule','任务排期','calendar'],[config.collaborationOrigin+'/reviews','审核与交付','check'],[config.designOrigin+'/dashboard','设计中心','spark']].map(([url,label,icon])=>h('a',{key:url,href:url,target:'_blank',rel:'noopener noreferrer',className:'naumi-quick-row'},h(Icon,{name:icon,size:18}),h('span',null,label),h(Icon,{name:'arrow',size:15}))))),
          h('section',{className:'naumi-design-section'},h('div',{className:'naumi-section-head'},h('h2',null,'设计工具'),external(config.designOrigin+'/dashboard','进入设计中心')),h(DesignGrid))),
        page==='naumi-projects'&&h(React.Fragment,null,data&&h('div',{className:'naumi-project-strip'},data.projects.map(p=>h('a',{key:p.id,href:config.collaborationOrigin+'/management/projects?id='+encodeURIComponent(p.id),target:'_blank',rel:'noopener noreferrer',className:'naumi-project-card'},h(Icon,{name:'layers'}),h('strong',null,p.name),h(Icon,{name:'arrow',size:15})))),
          h('section',{className:'naumi-card'},h('div',{className:'naumi-section-head'},h('h2',null,'项目任务'),h('div',{className:'naumi-search'},h(Icon,{name:'search',size:16}),h('input',{'aria-label':'搜索协作任务',placeholder:'搜索任务',value:query,onChange:e=>setQuery(e.target.value)}))),
            h('div',{className:'naumi-filterbar'},...['all','unassigned','in_progress','quality_review','business_acceptance','accepted'].map(s=>h('button',{key:s,className:filter===s?'selected':'',onClick:()=>setFilter(s)},s==='all'?'全部':STATUS[s]))),data?h(TaskTable,{tasks:visible,data,onContext:setSelected}):h(ConnectionState,{state}))),
        page==='naumi-delivery'&&h('section',{className:'naumi-card'},h('div',{className:'naumi-section-head'},h('h2',null,'交付与验收'),external(config.collaborationOrigin+'/reviews','打开交付中心')),data?h('div',{className:'naumi-deliveries'},data.deliverables.length?data.deliverables.map(d=>{const task=tasks.find(t=>t.id===d.taskId),versions=data.submissions.filter(s=>s.deliverableId===d.id);return h('article',{key:d.id,className:'naumi-delivery-item'},h('div',{className:'naumi-delivery-icon'},h(Icon,{name:'image',size:25})),h('div',{className:'naumi-delivery-info'},h('strong',null,d.name),h('span',null,task?.title??'')),h('span',{className:'naumi-version'},versions.length?'V'+Math.max(...versions.map(s=>s.version)):'尚未提交'),h(Badge,{status:d.status}),external(config.collaborationOrigin+'/review/'+encodeURIComponent(d.taskId),'打开审阅'));}):h('div',{className:'naumi-empty'},'暂无交付物')):h(ConnectionState,{state})),
        page==='naumi-design'&&h(React.Fragment,null,h('div',{className:'naumi-design-top'},h('img',{src:'/naumi/assets/wordmark.svg',alt:'Naumi',width:136,height:34}),external(config.designOrigin+'/dashboard','打开设计中心','arrow','naumi-btn primary')),h(DesignGrid),h('div',{className:'naumi-design-links'},external(config.designOrigin+'/works','我的作品'),external(config.designOrigin+'/templates','模板中心'),external(config.designOrigin+'/tools','全部创作工具'))),
        page==='naumi-connections'&&h('section',{className:'naumi-card naumi-connections'},h('h2',null,'工作空间连接'),h(IdentityAccount),h('div',{className:'naumi-connection-row'},h(Icon,{name:'grid'}),h('div',null,h('strong',null,'企业协作'),h('code',null,config.collaborationOrigin)),h('span',{className:'naumi-badge '+(state.status==='ready'?'success':'')},state.status==='ready'?'已连接':'需要登录'),external(config.collaborationOrigin+'/login','打开'),globalThis.naumiDesktop?.connectionSettings&&h('button',{className:'naumi-btn',onClick:()=>globalThis.naumiDesktop.connectionSettings()},'连接设置')),h('div',{className:'naumi-connection-row'},h(Icon,{name:'spark'}),h('div',null,h('strong',null,'设计中心'),h('code',null,config.designOrigin)),external(config.designOrigin+'/dashboard','打开')),h('div',{className:'naumi-connection-row'},h(Icon,{name:'chat'}),h('div',null,h('strong',null,'AI 协作'),h('span',null,'会话 · 模型 · 文件 · 工具')),h('button',{className:'naumi-btn',onClick:()=>openAI()},'打开会话'))),
        selected&&data&&h(TaskContext,{task:selected,data,onClose:()=>setSelected(null)}));
    }
    ctx.effect(()=>{
      const previous=document.body.getAttribute('data-naumi');document.body.setAttribute('data-naumi','enterprise');
      const focus=()=>{if(Date.now()-lastLoad>2000)void refresh();};window.addEventListener('focus',focus);void refresh();
      return()=>{disposed=true;controller?.abort();listeners.clear();window.removeEventListener('focus',focus);if(previous===null)document.body.removeAttribute('data-naumi');else document.body.setAttribute('data-naumi',previous);};
    });
    for(const name of ['sidebar.brand.mark','conversation.hero.brand.mark'])ctx.slots.inject(name,()=>ctx.slots.register({name},Mark));
    ctx.slots.inject('sidebar.brand.name',()=>ctx.slots.register({name:'sidebar.brand.name'},Wordmark));
    ctx.slots.inject('conversation.header.leading',()=>ctx.slots.register({name:'conversation.header.leading'},()=>h('button',{className:'naumi-back',onClick:()=>ctx.layout.selectPanel('naumi-workbench')},h(Icon,{name:'grid',size:15}),'工作台')));
    ctx.slots.inject('main',function*(){
      for(const [id]of PANELS)yield ctx.slots.register({name:'main',key:id},()=>h(Page,{page:id}));
      yield ctx.slots.register({name:'main',key:'naumi-conversation',children:{'naumi.group.controls':{kind:'single',scope:'session'}}},props=>h(React.Suspense,{fallback:null},h(BotGroups,{native:props})));
      yield ctx.slots.inject('sidebar.panellist',function*(){for(const [id,label,icon]of PANELS)yield ctx.slots.register({name:'sidebar.panellist',id,order:-100+PANELS.findIndex(x=>x[0]===id),label:()=>label},()=>h(Icon,{name:icon}));});
      const known=new Set([...PANELS.map(x=>x[0]),'naumi-conversation','naumi-bot-overview']);
      const previous=sessionStorage.getItem('naumi.activePanel');
      const saved=previous==='naumi-bot-groups'?'naumi-conversation':previous;
      const hash=new URLSearchParams(location.hash.slice(1));
      if(!hash.has('session')&&!new URLSearchParams(location.search).has('session'))ctx.layout.selectPanel(saved==='conversation'?null:known.has(saved)?saved:'naumi-workbench');
      yield ctx.layout.panelInfo.subscribe(()=>{const active=ctx.layout.panelInfo.getSnapshot().activePanelId;sessionStorage.setItem('naumi.activePanel',active??'conversation');});
    });
  }
  return {inject:['slots','layout','uiWorkspace','workspaces','locale'],apply};
}});
