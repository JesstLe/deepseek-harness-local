'use strict';
const fs=require('node:fs'),path=require('node:path');
const {createHash}=require('node:crypto');
const {ExternalBrowserHub}=require('./browser-external.cjs');
const {BrowserVault,credentialScript}=require('./browser-vault.cjs');
class BrowserConnections{
 constructor({root,hostURL,safeStorage,protectPath}){this.root=root;this.external=new ExternalBrowserHub({hostURL});this.vault=new BrowserVault({root:path.join(root,'vault'),safeStorage,protectPath});this.queues=new Map();this.modes=new Map();this.external.onAttach=sessionId=>this.modes.set(sessionId,'external');}
 async start(native){this.native=native;await this.external.start();return this;}
 externalSelected(sessionId){return this.modes.get(sessionId)==='external'||this.modes.get(sessionId)!=='native'&&!!this.external.selected(sessionId);}
 async perform(sessionId,input){
  if(typeof sessionId!=='string'||!sessionId||sessionId.length>200||!input)throw Error('BROWSER_SESSION_REQUIRED');
  const before=this.queues.get(sessionId)||Promise.resolve(),next=before.catch(()=>{}).then(()=>this.run(sessionId,input));this.queues.set(sessionId,next);
  try{return await next;}finally{if(this.queues.get(sessionId)===next)this.queues.delete(sessionId);}
 }
 async run(sessionId,input){
  if(this.closed)throw Error('BROWSER_CONNECTION_CLOSED_NO_REPLAY');
  if(input.action==='tabs'){const native=await this.native.perform(sessionId,input);return {...native,tabs:[...(native.tabs||[]),...this.external.entries(sessionId)]};}
  if(input.action==='select'){
   const ext=this.external.entries(sessionId).some(x=>x.label===input.label);
   const result=await (ext?this.external:this.native).perform(sessionId,input);this.modes.set(sessionId,ext?'external':'native');return result;
  }
  const external=this.externalSelected(sessionId),target=external?this.external:this.native;
  if(input.action==='accounts'||input.action==='login'){
   const current=external?await this.external.perform(sessionId,{action:'state'}):{url:this.native.guests.selected(sessionId)?.guest.getURL()};
   if(this.closed)throw Error('BROWSER_CONNECTION_CLOSED_NO_REPLAY');
   if(!current.url)throw Error('NATIVE_BROWSER_OPEN_CURRENT_SESSION');
   if(input.action==='accounts')return {accounts:this.vault.list(current.url).filter(x=>x.allowAgent)};
   const credential=this.vault.credential(input.accountId,current.url),expression=credentialScript({...credential,usernameSelector:input.usernameSelector,passwordSelector:input.passwordSelector});
   if(external)return this.external.perform(sessionId,{action:'login',expression});
   const guest=this.native.guests.selected(sessionId)?.guest;if(!guest)throw Error('NATIVE_BROWSER_OPEN_CURRENT_SESSION');
   try{const data=await guest.executeJavaScript(expression);if(data?.filled!==true)throw Error();return {filled:true,submitted:false,engine:'chromium'};}catch{throw Error('BROWSER_LOGIN_FAILED_NO_REPLAY');}
  }
  return target.perform(sessionId,input);
 }
 status(sessionId){let accounts=[],vaultAvailable=true;try{accounts=this.vault.list();}catch{vaultAvailable=false;}return {tabs:this.external.entries(sessionId),accounts,vaultAvailable,mode:this.externalSelected(sessionId)?'external':'native'};}
 exportExtension(){
  const source=path.join(__dirname,'browser-extension'),files=['manifest.json','worker.js','operations.js','popup.html','popup.js','popup.css'];
  const hash=createHash('sha256');for(const file of files)hash.update(fs.readFileSync(path.join(source,file)));
  const folder=path.join(this.root,'extensions',hash.digest('hex').slice(0,16));fs.mkdirSync(folder,{recursive:true});
  for(const file of files){const dest=path.join(folder,file),data=fs.readFileSync(path.join(source,file));if(fs.existsSync(dest)){if(!fs.readFileSync(dest).equals(data))throw Error('BROWSER_EXTENSION_COPY_CHANGED');}else fs.writeFileSync(dest,data,{flag:'wx'});}
  return folder;
 }
 disconnect(sessionId){this.modes.set(sessionId,'native');return this.external.disconnect(sessionId);}
 async close(){this.closed=true;await this.external.close();}
}
module.exports={BrowserConnections};
