'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {app,BrowserWindow,ipcMain,Menu,nativeTheme,shell,session,dialog}=require('electron');
const {readConnection,connect,EnterpriseSession}=require('./enterprise.cjs');
const {workspaceSummary,selectWorkspace,verifyConnection,assertWorkspaceIdle}=require('./workspaces.cjs');
const {Guests}=require('./guests.cjs');
const {startBridge}=require('./tools.cjs');
const {localSettings,ensureBackend,stopBackend,createQuitGate}=require('./backend.cjs');
app.setName('Naumi');app.setAppUserModelId('com.naumi.desktop');
if(process.env.NAUMI_USER_DATA)app.setPath('userData',path.resolve(process.env.NAUMI_USER_DATA));
if(process.env.NAUMI_TEST_HIDDEN==='1'){app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');}
const locked=app.requestSingleInstanceLock();
let window,primarySession,guests,bridge,backend,settings,enterprise,login,loginAfterBoot=false,booting=false,closing=false,connecting=false,editingConnection=false,connectionFlight;
if(!locked){app.quit();}else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 nativeTheme.themeSource='light';Menu.setApplicationMenu(null);
 const icon=path.join(__dirname,'assets/naumi.ico');
 window=new BrowserWindow({width:1460,height:930,minWidth:1000,minHeight:640,show:false,title:'Naumi',backgroundColor:'#f7f9fc',icon,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true,partition:'persist:naumi-workbench',spellcheck:false,backgroundThrottling:false}});
 primarySession=window.webContents.session;
 window.on('close',()=>{closing=true;});
 window.on('page-title-updated',e=>{e.preventDefault();window.setTitle('Naumi');});
 window.webContents.on('will-navigate',(event,url)=>{if(settings&&new URL(url).origin!==settings.url)event.preventDefault();});
 window.webContents.setWindowOpenHandler(({url})=>{
  try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return {action:'deny'};
   if(settings?.isolated&&u.origin===settings.enterpriseOrigin&&u.pathname==='/login'){openEnterpriseLogin();
   }else if(!settings?.isolated&&u.origin==='http://127.0.0.1:3112'&&u.pathname.startsWith('/login')){
    const login=new BrowserWindow({parent:window,width:1040,height:780,title:'Naumi · 登录',icon,backgroundColor:'#fff',webPreferences:{session:window.webContents.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    login.webContents.setWindowOpenHandler(()=>({action:'deny'}));login.webContents.on('will-navigate',(e,next)=>{if(new URL(next).origin!==u.origin)e.preventDefault();});void login.loadURL(url);
    login.on('closed',()=>{if(!closing&&!window.isDestroyed())window.webContents.reload();});
   }else void shell.openExternal(u.href);
  }catch{}return {action:'deny'};
 });
 window.webContents.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3&&!booting)void showStartup(description+' ('+code+')');});
 const ownFrame=event=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');};
 const localPage=(event,names)=>{ownFrame(event);const u=new URL(event.senderFrame.url);return u.protocol==='file:'&&names.some(name=>u.pathname===require('node:url').pathToFileURL(path.join(__dirname,name)).pathname);};
 const trusted=event=>{ownFrame(event);if(!settings||new URL(event.senderFrame.url).origin!==settings.url||connecting)throw Error('INVALID_DESKTOP_ORIGIN');};
 ipcMain.handle('naumi:browser-acquire',(e,workspace)=>{trusted(e);return guests.acquire(e.sender,workspace);});
 ipcMain.handle('naumi:browser-release',(e,lease)=>{trusted(e);return guests.release(e.sender,lease);});
 ipcMain.handle('naumi:browser-bind',(e,value)=>{trusted(e);return guests.bind(e.sender,value);});
 ipcMain.handle('naumi:retry',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');void boot();});
 ipcMain.handle('naumi:connection-state',e=>{if(!localPage(e,['connect.html','startup.html']))trusted(e);if(!settings?.isolated)return {available:false};return {available:true,...workspaceSummary(app.getPath('userData'))};});
 ipcMain.handle('naumi:connection-settings',async e=>{
  if(!localPage(e,['startup.html']))trusted(e);if(!settings?.isolated||booting||connecting)return {ok:false,error:'WORKSPACE_SETTINGS_BUSY'};
  try{if((bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');if(backend?.owned){const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(!r||r.pid===null||isAlive(r.pid))await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));}}
  catch(error){const code=/^WORKSPACE_[A-Z_]+$/.test(error.message)?error.message:'WORKSPACE_ACTIVITY_UNKNOWN';if(process.env.NAUMI_TEST_HIDDEN!=='1')await dialog.showMessageBox(window,{type:'info',buttons:['返回工作台'],message:code==='WORKSPACE_RUNNING_TASKS'?'请先停止当前工作区的运行任务':'当前操作状态未确认，请稍后重试'});return {ok:false,error:code};}
  editingConnection=true;if(login&&!login.isDestroyed())login.destroy();await window.loadFile(path.join(__dirname,'connect.html'));return {ok:true};
 });
 ipcMain.handle('naumi:connection-cancel',e=>{if(!localPage(e,['connect.html']))throw Error('INVALID_DESKTOP_SENDER');connectionFlight?.abort();return {ok:true};});
 ipcMain.handle('naumi:connection-resume',e=>{if(!localPage(e,['connect.html'])||!settings?.isolated)throw Error('INVALID_DESKTOP_SENDER');if(connecting||booting)return {ok:false,error:'WORKSPACE_SETTINGS_BUSY'};void boot();return {ok:true};});
 ipcMain.handle('naumi:enterprise-connect',async(e,origin)=>{
  if(!localPage(e,['connect.html'])||!settings?.isolated)throw Error('INVALID_DESKTOP_SENDER');
  if(connecting||booting)return {ok:false,error:'WORKSPACE_SETTINGS_BUSY'};connecting=true;connectionFlight=new AbortController();
  try{
   const checked=await verifyConnection(origin,(url,options)=>primarySession.fetch(url,options),{signal:connectionFlight.signal});
   const state=workspaceSummary(app.getPath('userData')),changed=state.configured&&state.origin!==checked.origin;
   if(changed){
    if((enterprise?.running??0)>0||(bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');
    if(backend?.owned){const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(!r||r.pid===null||isAlive(r.pid))await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));connectionFlight.signal.throwIfAborted();await stopBackend(backend);backend=null;}
    else {const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(r&&(r.pid===null||isAlive(r.pid)))throw Error('WORKSPACE_BACKEND_STOP_REQUIRED');}
    await bridge?.close();bridge=null;
   }
   connectionFlight.signal.throwIfAborted();selectWorkspace(app.getPath('userData'),checked.origin);
   if(changed){settings=localSettings(app);enterprise=null;}
   loginAfterBoot=true;void showStartup().then(()=>boot());return {ok:true};
  }catch(error){return {ok:false,error:connectionFlight.signal.aborted?'ENTERPRISE_CONNECTION_CANCELLED':/^(ENTERPRISE|WORKSPACE)_[A-Z_]+$/.test(error.message)?error.message:'ENTERPRISE_CONNECTION_UNAVAILABLE'};}
  finally{connecting=false;connectionFlight=null;}
 });
 ipcMain.handle('naumi:enterprise-login',e=>{trusted(e);openEnterpriseLogin();return {ok:true};});
 await showStartup();
 if(process.env.NAUMI_TEST_HIDDEN!=='1')window.show();
 await boot();
}).catch(error=>{console.error('NAUMI_DESKTOP_START_FAILED',error.message);app.quit();});
const quitGate=createQuitGate({shutdown:async()=>{try{connectionFlight?.abort();if(login&&!login.isDestroyed()){login.webContents.stop();login.destroy();}await guests?.flush();await primarySession?.cookies.flushStore();await enterprise?.session.cookies.flushStore();}finally{await bridge?.close();await stopBackend(backend);}},onReady:()=>app.quit(),onError:()=>app.exit(1)});
app.on('before-quit',event=>{closing=true;quitGate.beforeQuit(event);});
app.on('window-all-closed',()=>app.quit());
}
async function showStartup(error=''){
 if(closing||!window||window.isDestroyed())return;
 await window.loadFile(path.join(__dirname,'startup.html'),{query:error?{error}:{}});
}
async function boot(){
 if(booting||closing||connecting)return;booting=true;
 try{
  settings??=localSettings(app);
  if(settings.isolated){
   let connection=readConnection(settings.home);
   if(process.env.NAUMI_ENTERPRISE_ORIGIN)connection=connect(settings.home,process.env.NAUMI_ENTERPRISE_ORIGIN);
   if(!connection){await window.loadFile(path.join(__dirname,'connect.html'));return;}
   settings.enterpriseOrigin=connection.origin;
   enterprise??=new EnterpriseSession({origin:connection.origin,session:session.fromPartition('persist:naumi-enterprise-'+require('node:crypto').createHash('sha256').update(connection.origin).digest('hex'))});
  }
  const nextBackend=await ensureBackend(settings);
  backend=backend?.owned&&!nextBackend.owned&&backend.child.exitCode===null&&backend.child.signalCode===null?{...nextBackend,owned:true,child:backend.child}:nextBackend;
  const account=!settings.isolated||settings.workspaceId==='default'?'local':'enterprise-'+settings.workspaceId;
  if(!guests){guests=new Guests({hostURL:settings.url,account,timeout:process.env.NAUMI_TEST==='1'?Number(process.env.NAUMI_TEST_TIMEOUT??30000):30000});guests.attach(window);}
  else if(guests.hostURL!==settings.url||guests.account!==account)await guests.reset({hostURL:settings.url,account});
  if(!bridge)bridge=await startBridge({home:settings.home,guests,window,enterprise});
  editingConnection=false;await window.loadURL(backend.launchURL);
  if(loginAfterBoot){loginAfterBoot=false;openEnterpriseLogin();}
 }catch(error){await showStartup(error.message);}
 finally{booting=false;if(process.env.NAUMI_TEST==='1')globalThis.__naumiTest={window,guests,bridge,settings,backend,enterprise,get login(){return login;}};}
}
function isAlive(pid){try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}}
function openEnterpriseLogin(){
 if(closing||!enterprise||!settings?.enterpriseOrigin)return;
 if(login&&!login.isDestroyed()){if(process.env.NAUMI_TEST_HIDDEN!=='1')login.focus();return;}
 login=new BrowserWindow({parent:window,width:1040,height:780,show:process.env.NAUMI_TEST_HIDDEN!=='1',title:'Naumi · 登录',icon:path.join(__dirname,'assets/naumi.ico'),backgroundColor:'#fff',webPreferences:{session:enterprise.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const origin=settings.enterpriseOrigin,allowed=url=>{try{return new URL(url).origin===origin;}catch{return false;}};
 login.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 for(const event of ['will-navigate','will-redirect'])login.webContents.on(event,(e,url)=>{if(!allowed(url))e.preventDefault();});
 void login.loadURL(origin+'/login').catch(()=>{});
 login.on('closed',()=>{login=null;if(!closing&&!editingConnection&&window&&!window.isDestroyed()&&new URL(window.webContents.getURL()).origin===settings.url)window.webContents.reload();});
}
