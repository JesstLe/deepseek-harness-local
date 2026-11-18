/** Desktop-only presentation over the native updater; no network/update logic in the renderer. */
export function createUpdateStore(api) {
  let state={enabled:false,status:'loading',currentVersion:'',version:null,notes:'',progress:null,error:null},revision=0,closed=false,pending=null;
  const listeners=new Set();
  const publish=value=>{if(closed)return;state={...state,...value};revision++;for(const fn of listeners)fn();};
  const off=api.onUpdateState(publish),initialRevision=revision;
  Promise.resolve().then(()=>api.updateState()).then(value=>{if(revision===initialRevision)publish(value);}).catch(()=>{if(revision===initialRevision)publish({status:'idle',error:'UPDATE_STATE_FAILED'});});
  const run=method=>{
    if(pending)return pending;
    pending=Promise.resolve().then(()=>api[method]()).then(result=>{if(!result?.ok)publish({status:state.status==='ready'?'ready':'idle',error:result?.error||'UPDATE_CHECK_FAILED'});return result;}).catch(()=>{publish({status:state.status==='ready'?'ready':'idle',error:'UPDATE_CONNECTION_FAILED'});return {ok:false};}).finally(()=>{pending=null;});
    return pending;
  };
  return {getSnapshot:()=>state,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},check:()=>run('checkUpdates'),install:()=>run('installUpdate'),dispose(){closed=true;off?.();listeners.clear();}};
}

export function updateView(state) {
  const status=state.status;
  let title=status==='loading'?'正在读取版本':!state.enabled?'安装版支持更新':status==='checking'?'正在检查更新':status==='downloading'?'正在下载更新':status==='ready'?'更新已就绪':state.lastChecked?'已是最新版本':'检查更新';
  if(state.error)title=state.error==='UPDATE_INSTALL_BUSY'?'任务运行中，稍后更新':state.error==='UPDATE_FEED_UNCONFIGURED'?'安装版支持更新':state.error==='UPDATE_INSTALL_FAILED'?'安装未完成，请重试':state.error==='UPDATE_DOWNLOAD_FAILED'?'下载失败，请重试':'检查失败，请重试';
  return {title,busy:['loading','checking','downloading'].includes(status),percent:Math.round(Math.max(0,Math.min(100,Number(state.progress?.percent)||0))),ready:status==='ready'};
}

export function installDesktopUpdatesUI(ctx,React,createPortal,api=globalThis.naumiDesktop) {
  if(!api?.updateState||!api?.checkUpdates||!api?.onUpdateState)return()=>{};
  const h=React.createElement,store=createUpdateStore(api);
  function Updates({wide}) {
    const state=React.useSyncExternalStore(store.subscribe,store.getSnapshot),view=updateView(state),[open,setOpen]=React.useState(false),[position,setPosition]=React.useState({left:16,bottom:60});
    const trigger=React.useRef(null),panel=React.useRef(null),id=React.useId();
    const close=()=>{setOpen(false);trigger.current?.focus();};
    React.useEffect(()=>{
      if(!open)return;
      const rect=trigger.current.getBoundingClientRect();setPosition({left:Math.max(12,Math.min(rect.left,innerWidth-344)),bottom:Math.max(12,innerHeight-rect.top+10)});
      panel.current?.querySelector('button')?.focus();
      const outside=e=>{if(!panel.current?.contains(e.target)&&!trigger.current?.contains(e.target))setOpen(false);};
      const key=e=>{if(e.key==='Escape'){e.preventDefault();close();}};
      const resize=close;
      document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);window.addEventListener('resize',resize);
      return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);window.removeEventListener('resize',resize);};
    },[open]);
    const icon=h('svg',{width:16,height:16,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6,strokeLinecap:'round',strokeLinejoin:'round','aria-hidden':true},h('path',{d:'M20 7v5h-5 M4 17v-5h5 M19 10a7 7 0 0 0-12-5L4 8 M5 14a7 7 0 0 0 12 5l3-3'}));
    return h(React.Fragment,null,h('button',{ref:trigger,type:'button',className:'nup-trigger','data-wide':String(wide),'aria-label':'检查更新',title:'检查更新','aria-haspopup':'dialog','aria-expanded':open,'aria-controls':open?id:undefined,onClick:()=>{if(open){close();return;}setOpen(true);if(!view.ready)void store.check();}},icon,wide&&h('span',null,'检查更新'),view.ready&&h('i',{className:'nup-dot'})),open&&createPortal(h('section',{ref:panel,id,role:'dialog','aria-label':'Naumi 更新',className:'nup-panel',style:position},h('header',null,h('strong',null,'Naumi'),h('button',{type:'button',className:'nup-close','aria-label':'关闭更新面板',onClick:close},'×')),h('div',{className:'nup-status',role:'status','aria-live':'polite'},view.title),h('div',{className:'nup-version'},state.currentVersion?'v'+state.currentVersion:'',state.version&&h('span',null,'→ v'+state.version)),state.status==='downloading'&&h('div',{className:'nup-download'},h('progress',{max:100,value:view.percent,'aria-label':'更新下载进度'}),h('span',null,view.percent+'%')),state.notes&&h('pre',{className:'nup-notes'},state.notes),h('footer',null,h('button',{type:'button',className:'nup-action',disabled:view.busy||!state.enabled||(!api.installUpdate&&view.ready),onClick:()=>void(view.ready?store.install():store.check())},view.ready?'重启并更新':view.busy?'检查中…':'重新检查'))),document.body));
  }
  const off=ctx.slots.inject('sidebar.footer.action',()=>ctx.slots.register({name:'sidebar.footer.action',id:'naumi-updates',order:100},Updates));
  return()=>{off?.();store.dispose();};
}
