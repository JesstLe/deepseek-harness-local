'use strict';
// Naumi Canvas owns accounts, password verification, bans and session revocation.
// This adapter owns only its Chromium session and local account namespace.
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {atomic,exists}=require('./profile.cjs');
const {enterpriseOrigin}=require('./enterprise.cjs');
const MAX_JSON=64*1024;
function identityOrigin(value){try{return enterpriseOrigin(value);}catch{throw Error('IDENTITY_ORIGIN_INVALID');}}
function plain(file){if(!exists(file))return null;if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>16384)throw Error('IDENTITY_CONFIG_INVALID');try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('IDENTITY_CONFIG_INVALID');}}
function readIdentityConfig(userData){const value=plain(path.join(userData,'naumi-identity.json'));if(!value)return null;if(value.version!==1||identityOrigin(value.origin)!==value.origin)throw Error('IDENTITY_CONFIG_INVALID');return {version:1,origin:value.origin};}
function publicUser(value){
 if(!value||typeof value.email!=='string'||value.email.length>254||!value.email.trim()||/[\s\x00-\x1f]/.test(value.email)||!value.email.includes('@'))throw Error('IDENTITY_RESPONSE_INVALID');
 const email=value.email.toLowerCase();
 // Existing Canvas account primary key is email. Do not fabricate an immutable UUID.
 return {subject:{type:'naumi-email-v1',value:email},email,name:typeof value.name==='string'?value.name.slice(0,160):email};
}
function namespace(origin,user){return createHash('sha256').update(JSON.stringify([identityOrigin(origin),publicUser(user).subject])).digest('hex');}
function accountRoot(userData,origin,user){
 const id=namespace(origin,user),base=path.join(userData,'identity-profiles'),root=path.join(base,id);
 for(const dir of [userData,base,root]){if(exists(dir)&&(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink()))throw Error('IDENTITY_DIRECTORY_UNMANAGED');}
 return {id,root};
}
function bindAccount(userData,origin,value){
 origin=identityOrigin(origin);const user=publicUser(value),profile=accountRoot(userData,origin,user);
 fs.mkdirSync(profile.root,{recursive:true});
 const file=path.join(profile.root,'identity-owner.json'),old=plain(file),owner={version:1,issuer:origin,subject:user.subject};
 if(old&&JSON.stringify(old)!==JSON.stringify(owner))throw Error('IDENTITY_OWNER_MISMATCH');
 if(!old)atomic(file,owner);
 atomic(path.join(userData,'naumi-identity.json'),{version:1,origin});
 return {origin,user,profileId:profile.id,root:profile.root};
}
function sessionPartition(origin){return 'persist:naumi-identity-'+createHash('sha256').update(identityOrigin(origin)).digest('hex');}
async function json(response){
 if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error('IDENTITY_RESPONSE_INVALID');
 const reader=response.body?.getReader();if(!reader)throw Error('IDENTITY_RESPONSE_INVALID');const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_JSON)throw Error('IDENTITY_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('IDENTITY_RESPONSE_INVALID');}
}
class IdentitySession{
 constructor({origin,session}){this.origin=identityOrigin(origin);this.session=session;this.running=false;}
 async request(endpoint,{method='GET',body}={}){
  try{return await this.session.fetch(this.origin+endpoint,{method,...(body?{body:JSON.stringify(body)}:{}),credentials:'include',redirect:'error',cache:'no-store',headers:{Accept:'application/json',...(method==='POST'?{'Content-Type':'application/json',Origin:this.origin}:{})},signal:AbortSignal.timeout(10000)});}catch{throw Error('IDENTITY_UNAVAILABLE');}
 }
 async inspect(){const response=await this.request('/api/auth/session');const value=await json(response);if(!response.ok)throw Error(response.status===401?'IDENTITY_LOGIN_REQUIRED':'IDENTITY_UNAVAILABLE');if(!value||!Object.hasOwn(value,'user'))throw Error('IDENTITY_RESPONSE_INVALID');return value.user===null?null:publicUser(value.user);}
 async login(input){
  if(this.running)throw Error('IDENTITY_BUSY');
  if(!input||typeof input.account!=='string'||!input.account.trim()||input.account.length>254||typeof input.password!=='string'||!input.password||input.password.length>1024||Object.keys(input).some(k=>!['account','password'].includes(k)))throw Error('IDENTITY_INPUT_INVALID');
  this.running=true;
  try{
   const response=await this.request('/api/auth/login',{method:'POST',body:{email:input.account.trim(),password:input.password}});
   await json(response); // Never surface the upstream body, cookies, role, credits or credentials.
   if(!response.ok)throw Error(({401:'IDENTITY_CREDENTIALS_INVALID',403:'IDENTITY_ACCOUNT_UNAVAILABLE',429:'IDENTITY_RATE_LIMITED'})[response.status]??'IDENTITY_UNAVAILABLE');
   const user=await this.inspect();if(!user)throw Error('IDENTITY_LOGIN_REQUIRED');return user;
  }finally{this.running=false;}
 }
 async logout(){
  if(this.running)throw Error('IDENTITY_BUSY');this.running=true;let remoteConfirmed=false;
  try{try{const response=await this.request('/api/auth/logout',{method:'POST'});remoteConfirmed=response.ok;(await json(response));}catch{}await this.session.clearStorageData({storages:['cookies','localstorage','indexdb','serviceworkers','cachestorage']});await this.session.cookies.flushStore();return {remoteConfirmed};}finally{this.running=false;}
 }
}
module.exports={identityOrigin,readIdentityConfig,publicUser,namespace,accountRoot,bindAccount,sessionPartition,IdentitySession,MAX_JSON};
