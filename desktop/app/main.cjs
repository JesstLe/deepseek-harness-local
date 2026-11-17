'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {app,BrowserWindow,ipcMain,Menu,nativeTheme,shell,session,dialog}=require('electron');
const {readConnection,connect,EnterpriseSession}=require('./enterprise.cjs');
const {workspaceSummary,selectWorkspace,verifyConnection,assertWorkspaceIdle}=require('./workspaces.cjs');
const {Guests}=require('./guests.cjs');
const {startBridge}=require('./tools.cjs');
const {localSettings,ensureBackend,stopBackend,createQuitGate,maintenanceRequest}=require('./backend.cjs');
const installerState=require('./installer-state.cjs');
const {createDesktopUpdates}=require('./updates.cjs');
const {IdentityRuntime}=require('./identity-runtime.cjs');
const {identityOrigin}=require('./identity.cjs');
const {randomUUID}=require('node:crypto');
app.setName('Naumi');app.setAppUserModelId('com.naumi.desktop');
if(process.env.NAUMI_USER_DATA)app.setPath('userData',path.resolve(process.env.NAUMI_USER_DATA));
if(process.env.NAUMI_TEST_HIDDEN==='1'){app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');}
const locked=app.requestSingleInstanceLock();
let identityRuntime=null,identityUserData=null;
let window,primarySession,guests,bridge,backend,settings,enterprise,login,loginAfterBoot=false,booting=false,closing=false,connecting=false,editingConnection=false,connectionFlight,maintenanceTicket=null,maintenanceUntil=0,updates=null;
if(!locked){app.quit();}else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 if(app.isPackaged){try{installerState.assertStartupAllowed(path.resolve(process.resourcesPath,'..'));}catch(error){if(error.message==='INSTALL_MAINTENANCE_ACTIVE'){app.exit(42);return;}throw error;}}
 nativeTheme.themeSource='light';Menu.setApplicationMenu(null);
 const icon=path.join(__dirname,'assets/naumi.ico');
 window=new BrowserWindow({width:1460,height:930,minWidth:1000,minHeight:640,show:false,title:'Naumi',backgroundColor:'#f7f9fc',icon,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true,partition:'persist:naumi-workbench',spellcheck:false,backgroundThrottling:false}});
 primarySession=window.webContents.session;
 if(app.isPackaged||process.env.NAUMI_UPDATE_DEV==='1'){
  try{
   const {autoUpdater}=require('electron-updater');
   if(process.env.NAUMI_UPDATE_DEV==='1')autoUpdater.forceDevUpdateConfig=true;
   updates=createDesktopUpdates({app,updater:autoUpdater,notify:showUpdateNotice,canInstall:canInstallUpdate,broadcast:snapshot=>{if(window&&!window.isDestroyed())window.webContents.send('naumi:update-state',snapshot);},log:(...args)=>{if(process.env.NAUMI_UPDATE_DEV==='1')console.warn('[updates]',...args);}});
   const started=updates.start();if(!started.ok)console.warn('[updates] disabled:',started.error);
  }catch(error){console.warn('[updates] unavailable:',error.message);}
 }
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
 const accountPage=event=>localPage(event,['identity.html']);
 const trusted=event=>{ownFrame(event);if(!settings||new URL(event.senderFrame.url).origin!==settings.url||connecting||maintenanceBlocked())throw Error('INVALID_DESKTOP_ORIGIN');};
 ipcMain.handle('naumi:browser-acquire',(e,workspace)=>{trusted(e);return guests.acquire(e.sender,workspace);});
 ipcMain.handle('naumi:browser-release',(e,lease)=>{trusted(e);return guests.release(e.sender,lease);});
 ipcMain.handle('naumi:browser-bind',(e,value)=>{trusted(e);return guests.bind(e.sender,value);});
 ipcMain.handle('naumi:retry',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');void boot();});
 ipcMain.handle('naumi:update-state',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');return updates?updates.snapshot():{enabled:false,status:'disabled',currentVersion:app.getVersion(),version:null,notes:'',progress:null,error:null};});
 ipcMain.handle('naumi:update-check',async e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');return updates?updates.check():{ok:false,error:'UPDATE_FEED_UNCONFIGURED'};});
 ipcMain.handle('naumi:connection-state',e=>{if(!localPage(e,['connect.html','startup.html']))trusted(e);if(!settings?.isolated)return {available:false};return {available:true,...workspaceSummary(identityUserData??app.getPath('userData'))};});
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
   const state=workspaceSummary(identityUserData??app.getPath('userData')),changed=state.configured&&state.origin!==checked.origin;
   if(changed){
    if((enterprise?.running??0)>0||(bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');
    if(backend?.owned){const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(!r||r.pid===null||isAlive(r.pid))await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));connectionFlight.signal.throwIfAborted();await stopBackend(backend);backend=null;}
    else {const r=require('./profile.cjs').runtimeReceipt(settings.home,settings.identity.id);if(r&&(r.pid===null||isAlive(r.pid)))throw Error('WORKSPACE_BACKEND_STOP_REQUIRED');}
    await bridge?.close();bridge=null;
   }
   connectionFlight.signal.throwIfAborted();selectWorkspace(identityUserData??app.getPath('userData'),checked.origin);
   if(changed){settings=localSettings(accountApp());enterprise=null;}
   loginAfterBoot=true;void showStartup().then(()=>boot());return {ok:true};
  }catch(error){return {ok:false,error:connectionFlight.signal.aborted?'ENTERPRISE_CONNECTION_CANCELLED':/^(ENTERPRISE|WORKSPACE)_[A-Z_]+$/.test(error.message)?error.message:'ENTERPRISE_CONNECTION_UNAVAILABLE'};}
  finally{connecting=false;connectionFlight=null;}
 });
 ipcMain.handle('naumi:identity-state',e=>{if(!accountPage(e))trusted(e);return identityRuntime?.status()??{available:false};});
 ipcMain.handle('naumi:identity-register',async(e,value)=>{
  if(!accountPage(e)||!identityRuntime)throw Error('INVALID_DESKTOP_SENDER');
  try{const origin=identityOrigin(value||identityRuntime.origin());if(identityRuntime.managedOrigin&&origin!==identityRuntime.managedOrigin)throw Error('IDENTITY_MANAGED_ORIGIN');await shell.openExternal(origin+'/');return {ok:true};}
  catch(error){return {ok:false,error:/^IDENTITY_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE'};}
 });
 ipcMain.handle('naumi:identity-login',async(e,input)=>{
  if(!accountPage(e)||!identityRuntime)throw Error('INVALID_DESKTOP_SENDER');
  if(booting||connecting||closing)return {ok:false,error:'IDENTITY_BUSY'};
  connecting=true;
  try{await identityRuntime.login(input);settings=null;identityUserData=identityRuntime.active.root;void showStartup().then(()=>boot());return {ok:true};}
  catch(error){return {ok:false,error:/^IDENTITY_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE'};}
  finally{connecting=false;}
 });
 ipcMain.handle('naumi:identity-open',async e=>{
  trusted(e);if(!identityRuntime)return {ok:false,error:'IDENTITY_UNAVAILABLE'};
  try{await assertAccountIdle();editingConnection=true;if(login&&!login.isDestroyed())login.destroy();await window.loadFile(path.join(__dirname,'identity.html'));return {ok:true};}
  catch(error){const code=/^(WORKSPACE|INSTALL)_[A-Z_]+$/.test(error.message)?error.message:'WORKSPACE_ACTIVITY_UNKNOWN';if(process.env.NAUMI_TEST_HIDDEN!=='1')await dialog.showMessageBox(window,{type:'info',buttons:['返回工作台'],message:'请先结束当前运行任务和操作，再管理账号'});return {ok:false,error:code};}
 });
 ipcMain.handle('naumi:identity-resume',e=>{if(!accountPage(e)||!identityRuntime?.active)throw Error('INVALID_DESKTOP_SENDER');void showStartup().then(()=>boot());return {ok:true};});
 ipcMain.handle('naumi:identity-logout',async e=>{
  if(!accountPage(e)||!identityRuntime)throw Error('INVALID_DESKTOP_SENDER');if(connecting||booting||closing)return {ok:false,error:'IDENTITY_BUSY'};
  connecting=true;let ticket=null;
  try{
   await assertAccountIdle();
   if(backend?.owned){ticket=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');await performMaintenance('quiesce',ticket,{accountTransition:true});await stopBackend(backend);backend=null;}
   await guests?.reset({hostURL:settings?.url??'http://127.0.0.1:3080',account:'signed-out-'+randomUUID()});await bridge?.close();bridge=null;
   await primarySession.clearStorageData();await primarySession.clearCache();const result=await identityRuntime.logout();
   enterprise=null;settings=null;identityUserData=null;maintenanceTicket=null;maintenanceUntil=0;return {ok:true,...result};
  }catch(error){if(ticket&&backend?.owned)await performMaintenance('resume',ticket).catch(()=>{});return {ok:false,error:/^(IDENTITY|WORKSPACE|INSTALL|BACKEND)_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE'};}
  finally{connecting=false;}
 });
 ipcMain.handle('naumi:enterprise-login',e=>{trusted(e);openEnterpriseLogin();return {ok:true};});
 await showStartup();
 if(process.env.NAUMI_TEST_HIDDEN!=='1')window.show();
 await boot();
}).catch(error=>{console.error('NAUMI_DESKTOP_START_FAILED',error.message);app.quit();});
const quitGate=createQuitGate({shutdown:async()=>{try{connectionFlight?.abort();if(login&&!login.isDestroyed()){login.webContents.stop();login.destroy();}await guests?.flush();await primarySession?.cookies.flushStore();await enterprise?.session.cookies.flushStore();await identityRuntime?.client?.session.cookies.flushStore();}finally{await bridge?.close();await stopBackend(backend);}},onReady:()=>app.quit(),onError:()=>app.exit(1)});
app.on('before-quit',event=>{closing=true;quitGate.beforeQuit(event);});
app.on('window-all-closed',()=>app.quit());
}
async function showStartup(error=''){
 if(closing||!window||window.isDestroyed())return;
 await window.loadFile(path.join(__dirname,'startup.html'),{query:error?{error}:{}});
}
async function boot(){
 if(booting||closing||connecting||maintenanceBlocked())return;booting=true;
 try{
  if(!settings){
   const candidate=localSettings(app);
   if(candidate.isolated){
    identityRuntime??=new IdentityRuntime({userData:app.getPath('userData'),sessionFor:name=>session.fromPartition(name),managedOrigin:process.env.NAUMI_IDENTITY_ORIGIN??''});
    const active=await identityRuntime.restore();
    if(!active){await window.loadFile(path.join(__dirname,'identity.html'));return;}
    identityUserData=active.root;settings=localSettings(accountApp());
   }else settings=candidate;
  }
  if(settings.isolated){
   installerState.registerProfile(path.resolve(process.resourcesPath,'..'),identityUserData??app.getPath('userData'));
   let connection=readConnection(settings.home);
   if(process.env.NAUMI_ENTERPRISE_ORIGIN)connection=connect(settings.home,process.env.NAUMI_ENTERPRISE_ORIGIN);
   if(!connection&&!identityRuntime?.active){await window.loadFile(path.join(__dirname,'connect.html'));return;}
   settings.enterpriseOrigin=connection?.origin??'';
   if(connection)enterprise??=new EnterpriseSession({origin:connection.origin,session:session.fromPartition('persist:naumi-enterprise-'+(identityRuntime?.active?.profileId??'legacy')+'-'+require('node:crypto').createHash('sha256').update(connection.origin).digest('hex'))});
  }
  const nextBackend=await ensureBackend(settings);
  backend=backend?.owned&&!nextBackend.owned&&backend.child.exitCode===null&&backend.child.signalCode===null?{...nextBackend,owned:true,child:backend.child}:nextBackend;
  const account=identityRuntime?.active?'identity-'+identityRuntime.active.profileId+'-'+settings.workspaceId:!settings.isolated||settings.workspaceId==='default'?'local':'enterprise-'+settings.workspaceId;
  if(!guests){guests=new Guests({hostURL:settings.url,account,timeout:process.env.NAUMI_TEST==='1'?Number(process.env.NAUMI_TEST_TIMEOUT??30000):30000});guests.attach(window);}
  else if(guests.hostURL!==settings.url||guests.account!==account)await guests.reset({hostURL:settings.url,account});
  if(!bridge)bridge=await startBridge({home:settings.home,guests,window,enterprise,maintenance:{blocked:maintenanceBlocked,perform:performMaintenance,quit:ticket=>{if(maintenanceBlocked()&&ticket===maintenanceTicket)app.quit();}}});
  editingConnection=false;await window.loadURL(backend.launchURL);
  if(loginAfterBoot){loginAfterBoot=false;openEnterpriseLogin();}
 }catch(error){await showStartup(error.message);}
 finally{booting=false;if(process.env.NAUMI_TEST==='1')globalThis.__naumiTest={window,guests,bridge,settings,backend,enterprise,get login(){return login;}};}
}
function accountApp(){return {isPackaged:app.isPackaged,getPath:name=>name==='userData'&&identityUserData?identityUserData:app.getPath(name)};}
async function assertAccountIdle(){
 if((enterprise?.running??0)>0||(bridge?.runtime.queues.size??0)>0)throw Error('WORKSPACE_OPERATIONS_IN_FLIGHT');
 if(backend&&!backend.owned)throw Error('WORKSPACE_BACKEND_STOP_REQUIRED');
 if(backend?.owned)await assertWorkspaceIdle(settings,(url,options)=>primarySession.fetch(url,options));
}
function maintenanceBlocked(){if(maintenanceTicket&&Date.now()>=maintenanceUntil){maintenanceTicket=null;}return !!maintenanceTicket;}
function canInstallUpdate(){
 if(closing||booting||connecting)return {ok:false,reason:'WORKSPACE_BUSY'};
 if(maintenanceBlocked())return {ok:false,reason:'INSTALL_MAINTENANCE_ACTIVE'};
 if((bridge?.runtime.queues.size??0)>0||(enterprise?.running??0)>0)return {ok:false,reason:'WORKSPACE_OPERATIONS_IN_FLIGHT'};
 return {ok:true};
}
async function showUpdateNotice(snapshot){
 if(!window||window.isDestroyed())return 1;
 const detail=(snapshot.notes||'（本次更新未提供更新日志）')+'\n\n当前版本 '+snapshot.currentVersion+' → 新版本 '+snapshot.version;
 const {response}=await dialog.showMessageBox(window,{type:'info',buttons:['立即重启更新','稍后'],defaultId:1,cancelId:1,noLink:true,title:'Naumi 更新',message:'新版本 '+snapshot.version+' 已下载完成',detail});
 return response;
}
async function performMaintenance(action,ticket,{accountTransition=false}={}){
 if(maintenanceBlocked()&&maintenanceTicket!==ticket)throw Error('INSTALL_MAINTENANCE_BUSY');
 if(action==='resume'){if(backend&&settings)await maintenanceRequest(settings,'resume',ticket);maintenanceTicket=null;return;}
 if(booting||(connecting&&!accountTransition)||closing||!settings?.isolated||!backend?.owned)throw Error('INSTALL_ACTIVITY_UNKNOWN');
 maintenanceTicket=ticket;maintenanceUntil=Date.now()+30000;
 try{if((bridge?.runtime.queues.size??0)>0||(enterprise?.running??0)>0)throw Error('INSTALL_OPERATIONS_IN_FLIGHT');await maintenanceRequest(settings,'quiesce',ticket);}
 catch(error){maintenanceTicket=null;throw error;}
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
