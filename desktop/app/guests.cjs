'use strict';
// Lease/attachment policy adapted from DeepSeek Harness, MIT. See ../upstream/NOTICE.md.
const {randomUUID}=require('node:crypto');
const {session}=require('electron');
const {partitionFor,browserURL,isAppHost,binding}=require('./policy.cjs');
class Guests {
  constructor({hostURL,account='local',timeout=30000}){this.hostURL=hostURL;this.account=account;this.timeout=timeout;this.leases=new Map();this.partitions=new Set();this.sequence=0;}
  acquire(owner,workspace){
    const partition=partitionFor(this.account,workspace);
    if(!this.partitions.has(partition)){this.configureSession(session.fromPartition(partition));this.partitions.add(partition);}
    const lease=randomUUID();this.leases.set(lease,{lease,owner,partition,attached:false,label:'p'+(++this.sequence)});return {lease,partition};
  }
  async release(owner,id){const entry=this.leases.get(id);if(!entry)return;if(entry.owner!==owner)throw Error('BROWSER_OWNER_MISMATCH');clearTimeout(entry.timer);this.leases.delete(id);if(entry.guest&&!entry.guest.isDestroyed())entry.guest.close({waitForBeforeUnload:false});}
  bind(owner,value){const data=binding(value),entry=this.leases.get(data.lease);if(!entry||entry.owner!==owner)throw Error('BROWSER_OWNER_MISMATCH');Object.assign(entry,data);if(data.visible)entry.selectedAt=Date.now();return {bound:true};}
  issue(entry,error){entry.error=error;if(!entry.owner.isDestroyed())entry.owner.send('naumi:browser-issue',{lease:entry.lease,error});}
  attach(window){
    const owner=window.webContents;
    owner.on('will-attach-webview',(event,preferences,params)=>{
      const id=typeof params.src==='string'&&params.src.startsWith('about:blank#')?params.src.slice(12):'';
      const entry=this.leases.get(id);
      if(!entry||entry.owner!==owner||entry.attached||entry.partition!==params.partition){event.preventDefault();return;}
      entry.attached=true;
      for(const key of Object.keys(preferences))if(key!=='disablePopups')delete preferences[key];
      Object.assign(preferences,{partition:entry.partition,nodeIntegration:false,nodeIntegrationInWorker:false,nodeIntegrationInSubFrames:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false,plugins:false,navigateOnDragDrop:false,disableDialogs:true,backgroundThrottling:false});
      params.httpreferrer='';
    });
    owner.on('did-attach-webview',(_event,guest)=>{
      let entry;
      guest.once('dom-ready',()=>{
        const url=guest.getURL();entry=this.leases.get(url.startsWith('about:blank#')?url.slice(12):'');
        if(!entry||entry.owner!==owner||entry.guest){guest.close({waitForBeforeUnload:false});return;}
        entry.guest=guest;
        guest.once('destroyed',()=>{clearTimeout(entry.timer);this.leases.delete(entry.lease);});
        guest.on('did-start-navigation',(_event,url,_inPlace,mainFrame)=>{
          if(!mainFrame)return;this.issue(entry,null);clearTimeout(entry.timer);
          entry.timer=setTimeout(()=>{if(guest.isDestroyed())return;guest.stop();this.issue(entry,'页面加载超时，请重试');},this.timeout);
        });
        guest.on('did-stop-loading',()=>clearTimeout(entry.timer));
        guest.on('did-fail-load',(_event,code,description,_url,mainFrame)=>{if(mainFrame&&code!==-3){clearTimeout(entry.timer);this.issue(entry,description+' ('+code+')');}});
        guest.on('render-process-gone',()=>{clearTimeout(entry.timer);this.issue(entry,'页面进程已退出，请刷新');});
        guest.on('before-input-event',(_event,input)=>{if(input.type==='keyDown'&&input.key==='F5'){guest.reload();_event.preventDefault();}});
      });
      guest.setWindowOpenHandler(({url,postBody})=>{try{browserURL(url,this.hostURL);if(entry&&postBody===undefined&&!owner.isDestroyed())owner.send('naumi:browser-open',{lease:entry.lease,url});}catch{}return {action:'deny'};});
      guest.on('will-frame-navigate',event=>{if(event.isMainFrame&&!this.allowed(event.url))event.preventDefault();});
      guest.on('will-redirect',(event,url,_inPlace,mainFrame)=>{if(mainFrame&&!this.allowed(url))event.preventDefault();});
      guest.on('will-attach-webview',event=>event.preventDefault());
      guest.on('login',(event,_details,_auth,callback)=>{event.preventDefault();callback();});
    });
    const release=()=>{for(const entry of this.leases.values())if(entry.owner===owner)void this.release(owner,entry.lease);};
    owner.on('did-start-navigation',(_e,_u,inPlace,main)=>{if(main&&!inPlace)release();});owner.on('render-process-gone',release);owner.once('destroyed',release);
  }
  allowed(url){try{browserURL(url,this.hostURL);return true;}catch{return false;}}
  configureSession(s){
    s.setPermissionRequestHandler((_c,_p,cb)=>cb(false));s.setPermissionCheckHandler(()=>false);s.setDevicePermissionHandler(()=>false);s.setDisplayMediaRequestHandler((_r,cb)=>cb({}));
    s.on('will-download',event=>event.preventDefault());
    s.webRequest.onBeforeRequest((details,cb)=>{let cancel=true;try{const u=new URL(details.url);cancel=['http:','https:','ws:','wss:'].includes(u.protocol)?!!(u.username||u.password||isAppHost(u,this.hostURL)):!['about:','data:','blob:'].includes(u.protocol);}catch{}cb({cancel});});
  }
  entries(sessionId){return [...this.leases.values()].filter(e=>e.sessionId===sessionId&&e.guest&&!e.guest.isDestroyed());}
  selected(sessionId){return this.entries(sessionId).sort((a,b)=>(b.selectedAt??0)-(a.selectedAt??0))[0];}
  async flush(){for(const partition of this.partitions)await session.fromPartition(partition).cookies.flushStore();}
  async reset({hostURL,account}){await this.flush();for(const entry of [...this.leases.values()])await this.release(entry.owner,entry.lease);this.hostURL=hostURL;this.account=account;}
}
module.exports={Guests};
