'use strict';
// Desktop auto-update client. The default feed is a generic provider over the
// repository's GitHub Releases "latest" assets: a measured CN mirror first and
// GitHub direct as automatic fallback. NAUMI_UPDATE_URL replaces the list with
// one https static feed; loopback http is allowed for local staging.
const GITHUB_LATEST='https://github.com/JesstLe/deepseek-harness-local/releases/latest/download';
const DEFAULT_FEED_BASES=['https://gh.ddlc.top/'+GITHUB_LATEST,GITHUB_LATEST];
function feedOverride(){
 const url=process.env.NAUMI_UPDATE_URL;
 if(!url)return null;
 try{
  const target=new URL(url);
  if(target.username||target.password)return {error:'UPDATE_FEED_CREDENTIALS_FORBIDDEN'};
  const loopback=['localhost','127.0.0.1','[::1]'].includes(target.hostname.toLowerCase());
  if(target.protocol==='https:'||(target.protocol==='http:'&&(loopback||process.env.NAUMI_UPDATE_ALLOW_INSECURE_HTTP==='1')))return {url};
  return {error:'UPDATE_FEED_INSECURE'};
 }catch{return {error:'UPDATE_FEED_INVALID'};}
}
function normalizeNotes(notes){
 const raw=typeof notes==='string'?notes:notes&&typeof notes==='object'&&typeof notes.note==='string'?notes.note:'';
 return raw.replace(/\r/g,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|div|li|h[1-6]|tr)>/gi,'\n').replace(/<[^>]*>/g,'').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim().slice(0,4000);
}
function createDesktopUpdates({app,updater,notify,canInstall=()=>({ok:true}),broadcast=()=>{},log=()=>{},startupDelayMs=15000,intervalMs=24*60*60*1000,fetcher=fetch,feedTimeoutMs=8000}){
 if(!app||typeof app.getVersion!=='function'||!updater||typeof notify!=='function')throw Error('UPDATE_MODULE_INVALID');
 const state={enabled:false,status:'disabled',currentVersion:app.getVersion(),version:null,notes:'',progress:null,error:null};
 const listeners=new Set();let started=false,timer=null,interval=null,retryTimer=null,feedBase=null,appliedFeedBase=null,candidateIndex=0;
 const candidates=()=>{const override=feedOverride();return override?.url?[override.url]:DEFAULT_FEED_BASES;};
 async function resolveFeedBase(){
  const list=candidates(),total=list.length;
  for(let attempt=0;attempt<total;attempt++){
   const index=(candidateIndex+attempt)%total,base=list[index];
   try{
    const response=await fetcher(base+'/latest.yml',{redirect:'follow',signal:AbortSignal.timeout(feedTimeoutMs)});
    const body=response.ok?await response.text():'';
    if(/^version:\s*\d+\.\d+\.\d+$/m.test(body)&&/^sha512:\s*\S+/m.test(body)){candidateIndex=index;feedBase=base;return base;}
   }catch{}
  }
  return null;
 }
 const snapshot=()=>({enabled:state.enabled,status:state.status,currentVersion:state.currentVersion,version:state.version,notes:state.notes,progress:state.progress?{...state.progress}:null,error:state.error});
 const publish=patch=>{Object.assign(state,patch);const value=snapshot();for(const listener of listeners)try{listener(value)}catch{}broadcast(value);return value;};
 async function announce(){
  const value=snapshot();let choice;
  try{choice=await notify(value);}catch(error){log('notify failed',error);return;}
  if(choice!==0)return;
  const gate=canInstall();if(!gate?.ok){log('install deferred',gate);return;}
  try{updater.quitAndInstall(true,true);}catch(error){log('install failed',error);publish({error:'UPDATE_INSTALL_FAILED'});}
 }
 function start(){
  if(started)return {ok:true};
  const override=feedOverride();if(override?.error)return {ok:false,error:override.error};
  started=true;updater.autoDownload=false;updater.autoInstallOnAppQuit=true;
  updater.on('checking-for-update',()=>publish({status:'checking',error:null}));
  updater.on('update-available',info=>{
   publish({status:'downloading',version:typeof info?.version==='string'?info.version:null,notes:normalizeNotes(info?.releaseNotes),progress:null,error:null});
   Promise.resolve(updater.downloadUpdate()).catch(error=>{log('download failed',error);publish({status:'idle',error:'UPDATE_DOWNLOAD_FAILED'});});
  });
  updater.on('update-not-available',()=>publish({status:'idle',version:null,notes:'',progress:null,error:null}));
  updater.on('download-progress',progress=>publish({progress:{percent:Math.max(0,Math.min(100,Number(progress?.percent)||0)),transferred:Number(progress?.transferred)||0,total:Number(progress?.total)||0,bytesPerSecond:Number(progress?.bytesPerSecond)||0}}));
  updater.on('update-downloaded',()=>{publish({status:'ready',error:null});void announce();});
  updater.on('error',error=>{
   log('updater error',error);
   publish({status:state.status==='ready'||state.status==='downloading'?state.status:'idle',error:'UPDATE_CHECK_FAILED'});
   if(!feedOverride()&&!retryTimer){retryTimer=setTimeout(()=>{retryTimer=null;feedBase=null;void check();},10000);if(retryTimer.unref)retryTimer.unref();}
  });
  publish({enabled:true,status:'idle',error:null});
  timer=setTimeout(()=>{timer=null;void check();},startupDelayMs);if(timer.unref)timer.unref();
  if(intervalMs>0){interval=setInterval(()=>void check(),intervalMs);if(interval.unref)interval.unref();}
  return {ok:true};
 }
 async function check(){
  if(!started){const result=start();if(!result.ok)return result;}
  if(state.status==='checking'||state.status==='downloading')return {ok:true,status:state.status};
  if(!feedBase){
   const base=await resolveFeedBase();
   if(!base)return {ok:false,error:'UPDATE_FEED_UNREACHABLE'};
   if(base!==appliedFeedBase){updater.setFeedURL({provider:'generic',url:base});appliedFeedBase=base;}
  }
  try{await updater.checkForUpdates();return {ok:true,status:state.status};}
  catch(error){log('check failed',error);feedBase=null;const value=publish({status:'idle',error:'UPDATE_CHECK_FAILED'});return {ok:false,error:value.error};}
 }
 function stop(){
  if(timer)clearTimeout(timer);if(interval)clearInterval(interval);if(retryTimer)clearTimeout(retryTimer);timer=interval=retryTimer=null;started=false;feedBase=appliedFeedBase=null;
  updater.removeAllListeners();publish({enabled:false,status:'disabled',version:null,notes:'',progress:null,error:null});
 }
 return {start,check,snapshot,stop,onState(listener){listeners.add(listener);return ()=>listeners.delete(listener);}};
}
module.exports={createDesktopUpdates,feedOverride,normalizeNotes,defaultFeedBases:DEFAULT_FEED_BASES};
