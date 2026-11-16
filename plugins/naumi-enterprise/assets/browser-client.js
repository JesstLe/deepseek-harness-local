import {BrowserScheduler,browserPoint} from './browser-scheduler.js';
import {installNativeBrowserUI} from './browser-native-client.js';
/** Ego page presentation inside the native Harness docking system. */
export function installBrowserUI(ctx,React,Icon){
  if(window.naumiDesktop?.version===1&&window.naumiDesktop?.browser)return installNativeBrowserUI(ctx,React,Icon);
  const {createElement:h,useState,useEffect,useRef}=React,id='@naumi/ego-browser';
  const disposers=[];
  function Browser({sessionId,useTabInfo}){
    const {tab}=useTabInfo(),[state,setState]=useState(null),[address,setAddress]=useState(''),[error,setError]=useState(null),[busy,setBusy]=useState(false),[pages,setPages]=useState([]);
    const surface=useRef(null),keyboard=useRef(null),composition=useRef(false),frame=useRef(null),scheduler=useRef(null);
    if(!scheduler.current)scheduler.current=new BrowserScheduler({
      request:async(args,signal)=>{const response=await fetch('/naumi/browser',{method:'POST',credentials:'same-origin',cache:'no-store',signal,headers:{'Content-Type':'application/json','X-Naumi-Browser':'1'},body:JSON.stringify({sessionId,...args})});const data=await response.json();if(!response.ok)throw Error(data.error??'EGO_OPERATION_FAILED');return data;},
      onState:data=>{if(surface.current)delete surface.current.dataset.resizing;setState(old=>({...old,...data}));frame.current={...frame.current,...data};if(data.tabs)setPages(data.tabs.filter(p=>p.label));setAddress(old=>document.activeElement?.getAttribute('aria-label')==='浏览器地址'?old:data.url==='chrome://new-tab-page/'?'':data.url??old);setError(null);},
      onError:e=>setError(e.message),onBusy:setBusy
    });
    const act=args=>scheduler.current.perform(args).catch(e=>{if(e.message!=='BROWSER_VIEW_CLOSED')setError(e.message);});
    const request=act;
    useEffect(()=>()=>scheduler.current.dispose(),[]);
    useEffect(()=>{const box=surface.current;if(box)scheduler.current.resize(box.clientWidth,box.clientHeight);scheduler.current.setActive(tab.visible);return()=>scheduler.current.setActive(false);},[tab.visible,sessionId]);
    useEffect(()=>{const box=surface.current;if(!box)return;const observer=new ResizeObserver(()=>{if(scheduler.current.resize(box.clientWidth,box.clientHeight))box.dataset.resizing='true';});observer.observe(box);return()=>observer.disconnect();},[]);
    useEffect(()=>{const down=e=>{if(e.target instanceof Element&&e.target.closest('[data-side="rightbar"],[data-side="sidebar"]'))scheduler.current.setDragging(true);},up=()=>scheduler.current.setDragging(false);window.addEventListener('pointerdown',down,true);window.addEventListener('pointerup',up,true);window.addEventListener('pointercancel',up,true);return()=>{window.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true);};},[]);
    useEffect(()=>tab.actions.bindCommands({refresh:()=>{void act({action:'reload'});}}),[tab.actions]);
    const point=e=>frame.current?browserPoint(e.currentTarget.getBoundingClientRect(),frame.current,e.clientX,e.clientY):null;
    const key=e=>{
      if(composition.current||e.isComposing)return;
      if(['Control','Meta','Alt','Shift','CapsLock'].includes(e.key))return;
      if(e.key==='Tab'||e.key==='Escape'||e.key==='Enter'||e.key==='Backspace'||e.key==='Delete'||e.key.startsWith('Arrow')||['Home','End','PageUp','PageDown'].includes(e.key)||e.ctrlKey||e.metaKey||e.altKey){
        e.preventDefault();const mods=[e.ctrlKey?'Control':null,e.metaKey?'Meta':null,e.altKey?'Alt':null,e.shiftKey?'Shift':null].filter(Boolean);void act({action:'press',key:[...mods,e.key===' '?'Space':e.key].join('+')});
      }else if(e.key.length===1){e.preventDefault();void act({action:'text',text:e.key});}
    };
    const button=(label,symbol,action,disabled=false)=>h('button',{type:'button',className:'naumi-browser-tool',title:label,'aria-label':label,disabled,onClick:()=>{void act({action});}},symbol);
    const errors={EGO_ONBOARDING_REQUIRED:'请完成浏览器首次引导',EGO_RUNTIME_NOT_INSTALLED:'浏览器组件未安装',EGO_CONNECTION_UNAVAILABLE:'浏览器暂未连接',EGO_OPERATION_TIMEOUT_NO_REPLAY:'操作超时，请检查页面后再继续',EGO_TASK_SPACE_NAME_IN_USE:'页面当前由浏览器用户控制'};
    return h('section',{className:'naumi-browser','data-naumi-browser':true},
      h('form',{className:'naumi-browser-toolbar',onSubmit:e=>{e.preventDefault();void act({action:'navigate',url:address});}},
        button('后退','←','back',busy||!state?.canGoBack),button('前进','→','forward',busy||!state?.canGoForward),button('刷新网页','↻','reload',busy),
        h('input',{'aria-label':'浏览器地址',placeholder:'输入网址',value:address,onChange:e=>setAddress(e.target.value),onFocus:e=>e.target.select(),spellCheck:false}),
        h('button',{type:'submit',className:'naumi-browser-go','aria-label':'前往',disabled:busy},'↵'),
        h('button',{type:'button',className:'naumi-browser-tool',title:'页面列表','aria-label':'页面列表',onClick:()=>{void request({action:'tabs'});}},h(Icon,{name:'layers',size:16}))),
      pages.length>0&&h('div',{className:'naumi-browser-pages'},...pages.map(p=>h('button',{key:p.label,className:p.label===state?.label?'selected':'',onClick:()=>{setPages([]);void act({action:'select',label:p.label});}},p.title||p.label))),
      error&&h('div',{role:'alert',className:'naumi-browser-error'},errors[error]??error,h('button',{onClick:()=>{void act({action:'state'});}},'重新连接')),
      h('div',{className:'naumi-browser-surface',ref:surface},state?.image?h('div',{className:'naumi-browser-screen',role:'application','aria-label':'浏览器页面',tabIndex:0,onClick:e=>{const p=point(e);if(!p)return;keyboard.current?.focus({preventScroll:true});void act({action:'click',...p});},onWheel:e=>{const p=point(e);if(p)void act({action:'wheel',...p,deltaX:e.deltaX,deltaY:e.deltaY});}},h('img',{src:'data:image/jpeg;base64,'+state.image,alt:'',draggable:false}),h('textarea',{ref:keyboard,className:'naumi-browser-keyboard','aria-label':'浏览器键盘输入',autoComplete:'off',spellCheck:false,onKeyDown:key,onCompositionStart:()=>{composition.current=true;},onCompositionEnd:e=>{composition.current=false;if(e.data)void act({action:'text',text:e.data});e.currentTarget.value='';},onInput:e=>{if(!composition.current&&e.currentTarget.value){void act({action:'text',text:e.currentTarget.value});e.currentTarget.value='';}},onPaste:e=>{e.preventDefault();const text=e.clipboardData.getData('text/plain');if(text)void act({action:'text',text});}})):h('div',{className:'naumi-browser-start'},busy?'正在连接…':'浏览器')),
      h('div',{className:'naumi-browser-status'},h('i',{'data-connected':!!state}),h('span',null,state?.title??'Naumi 浏览器'),busy&&h('span',{className:'naumi-browser-busy'},'•••')));
  }
  disposers.push(ctx.sidebarRightTabs.register({id,kind:'browser',priority:'extension',keepMounted:true,title:()=> '浏览器',guide:[{id:'new',order:25,title:()=> '浏览器'}]}));
  disposers.push(ctx.slots.inject('sidebar.right.pane.tab',()=>ctx.slots.register({name:'sidebar.right.pane.tab',key:id},Browser)));
  function OpenButton(){return h('button',{className:'naumi-browser-open','aria-label':'打开内置浏览器',title:'浏览器',onClick:()=>ctx.sidebarRight.openTab('browser')},h(Icon,{name:'link',size:16}),'浏览器');}
  disposers.push(ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'naumi-browser-open',order:79},OpenButton)));
  return()=>{for(const dispose of disposers.reverse())dispose();};
}
