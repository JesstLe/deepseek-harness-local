'use strict';
const path=require('node:path');
const fs=require('node:fs');
const {app,BrowserWindow,ipcMain,Menu,nativeTheme,shell}=require('electron');
const {Guests}=require('./guests.cjs');
const {startBridge}=require('./tools.cjs');
const {localSettings,ensureBackend,stopBackend,createQuitGate}=require('./backend.cjs');
app.setName('Naumi');app.setAppUserModelId('com.naumi.desktop');
if(process.env.NAUMI_USER_DATA)app.setPath('userData',path.resolve(process.env.NAUMI_USER_DATA));
if(process.env.NAUMI_TEST_HIDDEN==='1'){app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');}
const locked=app.requestSingleInstanceLock();
let window,primarySession,guests,bridge,backend,settings,booting=false;
if(!locked){app.quit();}else{
app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus();}});
app.whenReady().then(async()=>{
 nativeTheme.themeSource='light';Menu.setApplicationMenu(null);
 const icon=path.join(__dirname,'assets/naumi.ico');
 window=new BrowserWindow({width:1460,height:930,minWidth:1000,minHeight:640,show:false,title:'Naumi',backgroundColor:'#f7f9fc',icon,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webviewTag:true,partition:'persist:naumi-workbench',spellcheck:false,backgroundThrottling:false}});
 primarySession=window.webContents.session;
 window.on('page-title-updated',e=>{e.preventDefault();window.setTitle('Naumi');});
 window.webContents.on('will-navigate',(event,url)=>{if(settings&&new URL(url).origin!==settings.url)event.preventDefault();});
 window.webContents.setWindowOpenHandler(({url})=>{
  try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return {action:'deny'};
   if(u.origin==='http://127.0.0.1:3112'&&u.pathname.startsWith('/login')){
    const login=new BrowserWindow({parent:window,width:1040,height:780,title:'Naumi · 登录',icon,backgroundColor:'#fff',webPreferences:{session:window.webContents.session,sandbox:true,contextIsolation:true,nodeIntegration:false}});
    login.webContents.setWindowOpenHandler(()=>({action:'deny'}));login.webContents.on('will-navigate',(e,next)=>{if(new URL(next).origin!==u.origin)e.preventDefault();});void login.loadURL(url);
    login.on('closed',()=>{if(!window.isDestroyed())window.webContents.reload();});
   }else void shell.openExternal(u.href);
  }catch{}return {action:'deny'};
 });
 window.webContents.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3&&!booting)void showStartup(description+' ('+code+')');});
 const trusted=event=>{if(event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');if(!settings||new URL(event.senderFrame.url).origin!==settings.url)throw Error('INVALID_DESKTOP_ORIGIN');};
 ipcMain.handle('naumi:browser-acquire',(e,workspace)=>{trusted(e);return guests.acquire(e.sender,workspace);});
 ipcMain.handle('naumi:browser-release',(e,lease)=>{trusted(e);return guests.release(e.sender,lease);});
 ipcMain.handle('naumi:browser-bind',(e,value)=>{trusted(e);return guests.bind(e.sender,value);});
 ipcMain.handle('naumi:retry',e=>{if(e.sender!==window.webContents||e.senderFrame!==window.webContents.mainFrame)throw Error('INVALID_DESKTOP_SENDER');void boot();});
 await showStartup();
 if(process.env.NAUMI_TEST_HIDDEN!=='1')window.show();
 await boot();
 if(process.env.NAUMI_TEST==='1')globalThis.__naumiTest={window,guests,bridge,settings,backend};
}).catch(error=>{console.error('NAUMI_DESKTOP_START_FAILED',error.message);app.quit();});
const quitGate=createQuitGate({shutdown:async()=>{try{await guests?.flush();await primarySession?.cookies.flushStore();}finally{await bridge?.close();await stopBackend(backend);}},onReady:()=>app.quit(),onError:()=>app.exit(1)});
app.on('before-quit',event=>quitGate.beforeQuit(event));
app.on('window-all-closed',()=>app.quit());
}
async function showStartup(error=''){
 if(!window||window.isDestroyed())return;
 await window.loadFile(path.join(__dirname,'startup.html'),{query:error?{error}:{}});
}
async function boot(){
 if(booting)return;booting=true;
 try{
  settings??=localSettings(app);
  const nextBackend=await ensureBackend(settings);
  backend=backend?.owned&&!nextBackend.owned&&backend.child.exitCode===null&&backend.child.signalCode===null?{...nextBackend,owned:true,child:backend.child}:nextBackend;
  if(!guests){guests=new Guests({hostURL:settings.url,account:'local',timeout:process.env.NAUMI_TEST==='1'?Number(process.env.NAUMI_TEST_TIMEOUT??30000):30000});guests.attach(window);}
  if(!bridge)bridge=await startBridge({home:settings.home,guests,window});
  await window.loadURL(backend.launchURL);
 }catch(error){await showStartup(error.message);}
 finally{booting=false;}
}
