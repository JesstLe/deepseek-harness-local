/** Native window seat only: no screenshots, image frames, wheel/keyboard forwarding or frame polling. */
export function nativeBrowserAvailable(){return window.__NAUMI_NATIVE_BROWSER__?.version===1&&typeof window.chrome?.webview?.postMessage==='function';}

export function createNativeBrowser(React){
  const {createElement:h,useEffect,useRef,useState}=React;
  return function NativeBrowser({sessionId,useTabInfo}){
    const {tab}=useTabInfo(),seat=useRef(null),[error,setError]=useState(null),[attached,setAttached]=useState(false);
    useEffect(()=>{
      const bridge=window.chrome.webview,controller=new AbortController();let frame=0,closed=false;
      const seatKey=sessionId+':'+tab.id;
      const post=(message)=>bridge.postMessage({channel:'naumi-native-browser-v1',seatKey,...message});
      const sync=()=>{
        frame=0;if(closed)return;
        if(!tab.visible||document.hidden){post({action:'hide'});return;}
        const rect=seat.current?.getBoundingClientRect();
        if(!rect||rect.width<100||rect.height<100){post({action:'hide'});return;}
        post({action:'bounds',sessionId,x:rect.x,y:rect.y,width:rect.width,height:rect.height});
      };
      const schedule=()=>{if(!frame)frame=requestAnimationFrame(sync);};
      const message=event=>{const data=event.data;if(data?.channel!=='naumi-native-browser-v1')return;
        if(data.status==='attached'){setAttached(true);setError(null);}
        if(data.status==='error')setError('原生浏览器窗口连接失败');
      };
      bridge.addEventListener('message',message);
      const observer=new ResizeObserver(schedule);if(seat.current)observer.observe(seat.current);
      window.addEventListener('resize',schedule);document.addEventListener('visibilitychange',schedule);schedule();
      // The agent must use the same named ego instance as this native seat, never a personal default window.
      if(tab.visible)void fetch('/naumi/browser',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Naumi-Browser':'1'},body:JSON.stringify({action:'native-bind',sessionId}),signal:controller.signal}).then(async r=>{if(!r.ok)throw Error('原生浏览器工具绑定失败');}).catch(e=>{if(e.name!=='AbortError'&&!closed)setError(e.message);});
      return()=>{closed=true;controller.abort();cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',schedule);document.removeEventListener('visibilitychange',schedule);bridge.removeEventListener('message',message);post({action:'hide'});};
    },[tab.visible,sessionId]);
    return h('section',{'data-naumi-native-browser':true,ref:seat,style:{height:'100%',width:'100%',minHeight:0,position:'relative',background:'#fff'}},!attached&&h('div',{style:{padding:20,color:'#8591a4',fontSize:13}},error??'正在连接浏览器…'));
  };
}
