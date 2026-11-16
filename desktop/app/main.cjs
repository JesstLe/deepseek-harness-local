'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {app,BrowserWindow,ipcMain,Menu,nativeTheme,shell,session}=require('electron');
const {readConnection,connect,EnterpriseSession}=require('./enterprise.cjs');
const {Guests}=require('./guests.cjs');
const {startBridge}=require('./tools.cjs');
const {localSettings,ensureBackend,stopBackend,createQuitGate}=require('./backend.cjs');
app.setName('Naumi');app.setAppUserModelId('com.naumi.desktop');
if(process.env.NAUMI_USER_DATA)app.setPath('userData',path.resolve(process.env.NAUMI_USER_DATA));
if(process.env.NAUMI_TEST_HIDDEN==='1'){app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');}
const locked=app.requestSingleInstanceLock();
let window,primarySession,guests,bridge,backend,settings,enterprise,login,loginAfterBoot=false,booting=false,closing=false;
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
 const trusted=event=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');if(!settings||new URL(event.senderFrame.url).origin!==settings.url)throw Error('INVALID_DESKTOP_ORIGIN');};
 ipcMain.handle('naumi:browser-acquire',(e,workspace)=>{trusted(e);return guests.acquire(e.sender,workspace);});
 ipcMain.handle('naumi:browser-release',(e,lease)=>{trusted(e);return guests.release(e.sender,lease);});
 ipcMain.handle('naumi:browser-bind',(e,value)=>{trusted(e);return guests.bind(e.sender,value);});
 ipcMain.handle('naumi:retry',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');void boot();});
 ipcMain.handle('naumi:enterprise-connect',(e,origin)=>{
  if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame||new URL(e.senderFrame.url).protocol!=='file:'||new URL(e.senderFrame.url).pathname!==new URL(require('node:url').pathToFileURL(path.join(__dirname,'connect.html')).href).pathname||!settings?.isolated)throw Error('INVALID_DESKTOP_SENDER');
  try{connect(settings.home,origin);loginAfterBoot=true;void boot();return {ok:true};}catch(error){return {ok:false,error:/^ENTERPRISE_[A-Z_]+$/.test(error.message)?error.message:'ENTERPRISE_CONFIG_INVALID'};}
 });
 ipcMain.handle('naumi:enterprise-login',e=>{trusted(e);openEnterpriseLogin();return {ok:true};});
 await showStartup();
 if(process.env.NAUMI_TEST_HIDDEN!=='1')window.show();
 await boot();
}).catch(error=>{console.error('NAUMI_DESKTOP_START_FAILED',error.message);app.quit();});
const quitGate=createQuitGate({shutdown:async()=>{try{if(login&&!login.isDestroyed()){login.webContents.stop();login.destroy();}await guests?.flush();await primarySession?.cookies.flushStore();await enterprise?.session.cookies.flushStore();}finally{await bridge?.close();await stopBackend(backend);}},onReady:()=>app.quit(),onError:()=>app.exit(1)});
app.on('before-quit',event=>{closing=true;quitGate.beforeQuit(event);});
app.on('window-all-closed',()=>app.quit());
}
async function showStartup(error=''){
 if(closing||!window||window.isDestroyed())return;
 await window.loadFile(path.join(__dirname,'startup.html'),{query:error?{error}:{}});
}
async function boot(){
 if(booting||closing)return;booting=true;
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
  if(!guests){guests=new Guests({hostURL:settings.url,account:'local',timeout:process.env.NAUMI_TEST==='1'?Number(process.env.NAUMI_TEST_TIMEOUT??30000):30000});guests.attach(window);}
  if(!bridge)bridge=await startBridge({home:settings.home,guests,window,enterprise});
  await window.loadURL(backend.launchURL);
  if(loginAfterBoot){loginAfterBoot=false;openEnterpriseLogin();}
 }catch(error){await showStartup(error.message);}
 finally{booting=false;if(process.env.NAUMI_TEST==='1')globalThis.__naumiTest={window,guests,bridge,settings,backend,enterprise,get login(){return login;}};}
}
function openEnterpriseLogin(){
 if(closing||!enterprise||!settings?.enterpriseOrigin)return;
 if(login&&!login.isDestroyed()){if(process.env.NAUMI_TEST_HIDDEN!=='1')login.focus();return;}
 login=new BrowserWindow({parent:window,width:1040,height:780,show:process.env.NAUMI_TEST_HIDDEN!=='1',title:'Naumi · 登录',icon:path.join(__dirname,'assets/naumi.ico'),backgroundColor:'#fff',webPreferences:{session:enterprise.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
 const origin=settings.enterpriseOrigin,allowed=url=>{try{return new URL(url).origin===origin;}catch{return false;}};
 login.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 for(const event of ['will-navigate','will-redirect'])login.webContents.on(event,(e,url)=>{if(!allowed(url))e.preventDefault();});
 void login.loadURL(origin+'/login').catch(()=>{});
 login.on('closed',()=>{login=null;if(!closing&&window&&!window.isDestroyed()&&new URL(window.webContents.getURL()).origin===settings.url)window.webContents.reload();});
}
