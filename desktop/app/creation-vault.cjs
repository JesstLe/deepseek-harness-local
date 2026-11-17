'use strict';
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{randomUUID,createHash}=require('node:crypto');
const {atomic}=require('./profile.cjs');
const inside=(root,file)=>{const r=path.relative(root,file);return r&&!r.startsWith('..'+path.sep)&&r!=='..'&&!path.isAbsolute(r);};
function protect(file,{directory=false}={}){
 if(fs.lstatSync(file).isSymbolicLink())throw Error('CREATION_PRIVATE_PATH_INVALID');
 if(process.platform!=='win32'){fs.chmodSync(file,directory?0o700:0o600);return;}
 const script="$ErrorActionPreference='Stop';$p=$env:NAUMI_PRIVATE_TARGET;$dir=$env:NAUMI_PRIVATE_DIRECTORY -eq '1';$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=if($dir){[System.Security.AccessControl.DirectorySecurity]::new()}else{[System.Security.AccessControl.FileSecurity]::new()};$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($sid);$rule=if($dir){[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')}else{[System.Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow')};$acl.AddAccessRule($rule);$a=if($dir){[System.IO.Directory]::SetAccessControl($p,$acl);[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::SetAccessControl($p,$acl);[System.IO.File]::GetAccessControl($p)};if(!$a.AreAccessRulesProtected){throw 'ACL_INHERITANCE'};foreach($r in $a.Access){if($r.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value -ne $sid.Value){throw 'ACL_FOREIGN_PRINCIPAL'}}";
 // No token is passed to a shell, command line, environment or logging surface.
 execFileSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{windowsHide:true,stdio:'pipe',timeout:20000,env:{...process.env,NAUMI_PRIVATE_TARGET:file,NAUMI_PRIVATE_DIRECTORY:directory?'1':'0'}});
}
function directory(file){if(fs.existsSync(file)&&(!fs.lstatSync(file).isDirectory()||fs.lstatSync(file).isSymbolicLink()))throw Error('CREATION_PRIVATE_PATH_INVALID');fs.mkdirSync(file,{recursive:true,mode:0o700});protect(file,{directory:true});}
function strictJSON(file){const s=fs.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>32768)throw Error('CREATION_PRIVATE_PATH_INVALID');return JSON.parse(fs.readFileSync(file,'utf8'));}
class CreationVault{
 constructor({identity,safeStorage,fetch:request=globalThis.fetch}){Object.assign(this,{identity,safeStorage,request});this.runtime=null;this.running=0;}
 owner(){const active=this.identity()?.active;if(!active)throw Error('CREATION_LOGIN_REQUIRED');return active;}
 storage(active=this.owner()){return path.join(active.root,'creation-private');}
 checkCrypto(){if(!this.safeStorage.isEncryptionAvailable()||this.safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('CREATION_OS_VAULT_UNAVAILABLE');}
 async me(token,workspace,active=this.owner()){
  let response;try{response=await this.request(active.origin+'/api/agent-gateway/v1/me',{headers:{authorization:'Bearer '+token,'x-naumi-workspace':workspace},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw Error('CREATION_CONNECTION_UNAVAILABLE');}
  if(!response.ok){await response.body?.cancel();throw Error(response.status===401||response.status===403?'CREATION_AUTH_REJECTED':'CREATION_CONNECTION_UNAVAILABLE');}
  const body=await response.text();if(Buffer.byteLength(body)>65536)throw Error('CREATION_RESPONSE_INVALID');let me;try{me=JSON.parse(body);}catch{throw Error('CREATION_RESPONSE_INVALID');}
  if(me.account?.email?.toLowerCase()!==active.user.email.toLowerCase()||typeof me.token?.id!=='string'||!me.token.id||me.token.id.length>200)throw Error('CREATION_ACCOUNT_MISMATCH');
  if(this.owner()!==active)throw Error('CREATION_ACCOUNT_CHANGED');return me;
 }
 async save(input){
  if(!input||Object.keys(input).some(k=>!['token','workspace'].includes(k))||!/^nmk_[A-Za-z0-9_-]{43}$/.test(input.token??'')||!/^[-\w]{0,128}$/.test(input.workspace??''))throw Error('CREATION_INPUT_INVALID');
  this.checkCrypto();const active=this.owner(),workspace=input.workspace??'',me=await this.me(input.token,workspace,active),dir=this.storage(active);directory(dir);
  const file=path.join(dir,'grant.vault'),encrypted=this.safeStorage.encryptString(JSON.stringify({version:1,site:active.origin,account:active.user.email.toLowerCase(),workspace,token:input.token,tokenId:me.token.id})),temp=file+'.'+randomUUID()+'.tmp';
  try{fs.writeFileSync(temp,encrypted,{flag:'wx',mode:0o600});protect(temp);if(this.owner()!==active)throw Error('CREATION_ACCOUNT_CHANGED');fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return {authorized:true,account:active.user.email,workspace,tokenId:me.token.id};
 }
 grant(){const active=this.owner(),dir=this.storage(active);if(fs.existsSync(dir)&&(!fs.lstatSync(dir).isDirectory()||fs.lstatSync(dir).isSymbolicLink()))throw Error('CREATION_PRIVATE_PATH_INVALID');const file=path.join(dir,'grant.vault');if(!fs.existsSync(file))return null;this.checkCrypto();protect(file);const s=fs.lstatSync(file);if(!s.isFile()||s.size>32768)throw Error('CREATION_PRIVATE_PATH_INVALID');let value;try{value=JSON.parse(this.safeStorage.decryptString(fs.readFileSync(file)));}catch{throw Error('CREATION_VAULT_INVALID');}
  if(value.version!==1||value.site!==active.origin||value.account!==active.user.email.toLowerCase()||!/^nmk_[A-Za-z0-9_-]{43}$/.test(value.token??''))throw Error('CREATION_ACCOUNT_MISMATCH');return value;
 }
 state(){const active=this.owner(),grant=this.grant();return {account:active.user.email,site:active.origin,authorized:!!grant,workspace:grant?.workspace??'',tokenId:grant?.tokenId??null};}
 snapshot(){this.grant();const active=this.owner(),file=path.join(this.storage(active),'grant.vault');return {active,bytes:fs.existsSync(file)?fs.readFileSync(file):null};}
 async restore(snapshot){if(this.owner()!==snapshot.active)throw Error('CREATION_ACCOUNT_CHANGED');await this.release();const dir=this.storage(),file=path.join(dir,'grant.vault');if(snapshot.bytes){directory(dir);fs.writeFileSync(file,snapshot.bytes,{mode:0o600});protect(file);}else if(fs.existsSync(file))fs.unlinkSync(file);}
 async activate(home){
  const active=this.owner();if(this.runtime?.home===home&&this.runtime.active===active)return;
  await this.release();const grant=this.grant();if(!grant)return;
  if(!inside(fs.realpathSync(active.root),path.resolve(home)))throw Error('CREATION_ACCOUNT_HOME_REQUIRED');fs.mkdirSync(home,{recursive:true});if(!inside(fs.realpathSync(active.root),fs.realpathSync(home)))throw Error('CREATION_ACCOUNT_HOME_REQUIRED');
  const dir=this.storage(active);directory(dir);const file=path.join(dir,'runtime-'+randomUUID()+'.token');
  fs.writeFileSync(file,grant.token,{flag:'wx',mode:0o600});try{protect(file);const folder=path.join(home,'naumi','creation');fs.mkdirSync(folder,{recursive:true});const descriptor=path.join(folder,'connection.json');atomic(descriptor,{version:1,bindingId:randomUUID(),site:grant.site,account:grant.account,workspace:grant.workspace,tokenId:grant.tokenId,tokenFile:file,tokenFileSha256:createHash('sha256').update(grant.token).digest('hex'),ownerRoot:active.root});this.runtime={home,active,file,descriptor};}catch(e){fs.unlinkSync(file);throw e;}
 }
 async release(){const r=this.runtime;if(!r)return;this.runtime=null;if(fs.existsSync(r.descriptor)){const v=strictJSON(r.descriptor);if(v.tokenFile===r.file)fs.unlinkSync(r.descriptor);}if(fs.existsSync(r.file))fs.unlinkSync(r.file);}
 async disconnect(){await this.release();const file=path.join(this.storage(),'grant.vault');if(fs.existsSync(file))fs.unlinkSync(file);return {authorized:false,remoteTasksCancelled:false,remoteTokenRevoked:false};}
}
module.exports={CreationVault,protect,inside};
