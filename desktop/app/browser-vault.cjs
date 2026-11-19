'use strict';
const fs=require('node:fs'),path=require('node:path');
const {randomUUID}=require('node:crypto');
const {protect}=require('./creation-vault.cjs');
function website(value){
 let u;try{u=new URL(value);}catch{throw Error('BROWSER_ACCOUNT_ORIGIN_INVALID');}
 if(u.username||u.password||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname)))throw Error('BROWSER_ACCOUNT_ORIGIN_INVALID');
 return u.origin;
}
class BrowserVault{
 constructor({root,safeStorage,protectPath=protect}){Object.assign(this,{root,safeStorage,protectPath});this.file=path.join(root,'accounts.vault');}
 crypto(){if(!this.safeStorage.isEncryptionAvailable()||this.safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('BROWSER_OS_VAULT_UNAVAILABLE');}
 read(){
  this.crypto();if(!fs.existsSync(this.file))return [];
  const s=fs.lstatSync(this.file);if(s.isSymbolicLink()||!s.isFile()||s.size>1024*1024)throw Error('BROWSER_VAULT_INVALID');
  this.protectPath(this.file);let data;try{data=JSON.parse(this.safeStorage.decryptString(fs.readFileSync(this.file)));}catch{throw Error('BROWSER_VAULT_INVALID');}
  if(data.version!==1||!Array.isArray(data.accounts)||data.accounts.length>200)throw Error('BROWSER_VAULT_INVALID');return data.accounts;
 }
 write(accounts){
  this.crypto();if(fs.existsSync(this.root)&&(!fs.lstatSync(this.root).isDirectory()||fs.lstatSync(this.root).isSymbolicLink()))throw Error('BROWSER_VAULT_INVALID');
  fs.mkdirSync(this.root,{recursive:true,mode:0o700});this.protectPath(this.root,{directory:true});
  const temp=this.file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,this.safeStorage.encryptString(JSON.stringify({version:1,accounts})),{flag:'wx',mode:0o600});this.protectPath(temp);fs.renameSync(temp,this.file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 }
 list(origin){return this.read().filter(x=>!origin||x.origin===website(origin)).map(({password,...publicValue})=>publicValue);}
 save(input){
  if(!input||typeof input.username!=='string'||!input.username.trim()||input.username.length>254||typeof input.password!=='string'||!input.password||input.password.length>4096||typeof input.allowAgent!=='boolean')throw Error('BROWSER_ACCOUNT_INPUT_INVALID');
  const accounts=this.read(),origin=website(input.origin);let index=input.id?accounts.findIndex(x=>x.id===input.id):-1;
  if(input.id&&index<0)throw Error('BROWSER_ACCOUNT_NOT_FOUND');if(index<0&&accounts.length>=200)throw Error('BROWSER_ACCOUNT_LIMIT');
  const value={id:index<0?randomUUID():accounts[index].id,origin,username:input.username.trim(),password:input.password,allowAgent:input.allowAgent};
  if(index<0)accounts.push(value);else accounts[index]=value;this.write(accounts);return {id:value.id,origin,username:value.username,allowAgent:value.allowAgent};
 }
 remove(id){const accounts=this.read();if(!accounts.some(x=>x.id===id))throw Error('BROWSER_ACCOUNT_NOT_FOUND');this.write(accounts.filter(x=>x.id!==id));return {removed:true};}
 credential(id,origin){const value=this.read().find(x=>x.id===id);if(!value||value.origin!==website(origin)||!value.allowAgent)throw Error('BROWSER_ACCOUNT_NOT_APPROVED');return value;}
}
// Evaluated only inside the selected, approved page. Nothing secret is returned.
function credentialScript({origin,username,password,usernameSelector,passwordSelector}){
 for(const s of [usernameSelector,passwordSelector])if(typeof s!=='string'||!s||s.length>4096)throw Error('BROWSER_LOGIN_SELECTOR_REQUIRED');
 return `(()=>{const data=${JSON.stringify({origin,username,password,usernameSelector,passwordSelector})};if(location.origin!==data.origin)throw Error('BROWSER_ACCOUNT_ORIGIN_CHANGED');const u=document.querySelector(data.usernameSelector),p=document.querySelector(data.passwordSelector);if(!u||!p||u===p||!u.matches('input:not([type=password]):not([type=file]):not([type=hidden])')||!p.matches('input[type=password]')||!u.getClientRects().length||!p.getClientRects().length||u.disabled||p.disabled||u.readOnly||p.readOnly)throw Error('BROWSER_LOGIN_FIELDS_INVALID');const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(u,data.username);u.dispatchEvent(new Event('input',{bubbles:true}));if(location.origin!==data.origin||!p.isConnected||p.ownerDocument!==document)throw Error('BROWSER_ACCOUNT_ORIGIN_CHANGED');set.call(p,data.password);p.dispatchEvent(new Event('input',{bubbles:true}));return {filled:true,submitted:false};})()`;
}
module.exports={BrowserVault,website,credentialScript};
