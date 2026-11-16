/** Reuse the official Electron BrowserBody and keep its stores, navigation and docking lifecycle. */
export function installNativeBrowserUI(ctx,React,Icon){
  const {createElement:h,useEffect,useRef,useState}=React,bridge=window.naumiDesktop;
  const key='@deepseek-ai/dsh-client-ui-sidebar-browser',slot='sidebar.right.pane.tab',disposers=[],wrapped=new WeakSet();
  let current,undo;
  function wrap(){
    const entry=ctx.slots.entries(slot).find(e=>e.options.key===key&&!wrapped.has(e.component));
    if(!entry||entry===current)return;current=entry;undo?.();
    function NativeBody(props){
      const {tab}=props.useTabInfo(),root=useRef(null),[error,setError]=useState(null);
      useEffect(()=>{
        const box=root.current;if(!box)return;
        let closed=false;const watched=new WeakSet();
        const bind=()=>{for(const view of box.querySelectorAll('webview')){
          const lease=view.getAttribute('name');if(!lease)continue;
          void bridge.bindBrowser({lease,sessionId:props.sessionId,tabId:tab.id,visible:tab.visible}).catch(e=>{if(!closed)setError(e.message);});
          if(!watched.has(view)){watched.add(view);view.addEventListener('dom-ready',bind,{once:true});}
        }};
        const observe=new MutationObserver(bind);observe.observe(box,{childList:true,subtree:true});bind();
        const off=bridge.onBrowserIssue(value=>{if(box.querySelector('webview')?.getAttribute('name')===value.lease)setError(value.error);});
        return()=>{closed=true;observe.disconnect();off();};
      },[props.sessionId,tab.id,tab.visible]);
      return h('section',{ref:root,className:'naumi-native-browser','data-naumi-native-browser':true,'data-session-id':props.sessionId,'data-tab-id':tab.id},
        error&&h('div',{role:'alert',className:'naumi-native-error'},h('span',null,error),h('button',{onClick:()=>{setError(null);const address=root.current?.querySelector('input')?.value;if(address)props.loadUrl(tab.id,address);else props.reload(tab.id);}},'重试')),
        h(entry.component,props));
    }
    wrapped.add(NativeBody);
    undo=ctx.slots.register({...entry.options,name:slot,priority:-1000,inject:entry.inject,locale:entry.locale,...(entry.store?{store:entry.store}:{})},NativeBody);
  }
  disposers.push(ctx.slots.inject(slot,()=>{wrap();const off=ctx.slots.subscribe(slot,wrap);return()=>{off();undo?.();};}));
  function OpenButton(){return h('button',{className:'naumi-browser-open','aria-label':'打开内置浏览器',title:'浏览器',onClick:()=>ctx.sidebarRight.openTab('browser')},h(Icon,{name:'link',size:16}),'浏览器');}
  disposers.push(ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'naumi-browser-open',order:79},OpenButton)));
  disposers.push(bridge.onToolRequest(request=>{
    if(ctx.sidebarRight.mounted.getSnapshot()!==request.sessionId)return;
    if(request.action==='open')ctx.sidebarRight.openTab('browser',{params:{url:request.url}});
    if(request.action==='select')ctx.sidebarRight.focus(request.tabId);
  }));
  document.documentElement.dataset.naumiDesktop='true';
  return()=>{delete document.documentElement.dataset.naumiDesktop;for(const dispose of disposers.reverse())dispose();};
}
