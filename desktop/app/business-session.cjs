'use strict';
const fs=require('node:fs'),path=require('node:path');
const {randomUUID,createHash}=require('node:crypto');
const {protect}=require('./creation-vault.cjs');
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
/** Main-process-only HTTP. Freeze the real business cookie for the whole action.
 * Chromium can transparently resend a POST after a connection reset. Commands have
 * receipts, but /api/assets does not. Use one non-retrying Node request for writes;
 * still take its only authentication cookie from the real Electron Session.
 */
function chromiumRequest({session,url,method='GET',headers={},body,signal,max=8*1024*1024}){
 return new Promise((resolve,reject)=>{
  const request=method==='GET'?require('electron').net.request({url,method,session,useSessionCookies:false,redirect:'error'}):require(new URL(url).protocol==='https:'?'node:https':'node:http').request(url,{method,agent:false});let done=false;
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(value);};
  const abort=()=>{request.abort();finish(Error('BUSINESS_RESULT_UNKNOWN'));};const timer=setTimeout(abort,20000);
  request.on('error',()=>finish(Error('BUSINESS_RESULT_UNKNOWN')));request.on('redirect',abort);
  request.on('login',(_auth,callback)=>callback());
  for(const [key,value]of Object.entries(headers))request.setHeader(key,value);
  request.on('response',response=>{let size=0;const chunks=[];
   response.on('data',chunk=>{size+=chunk.length;if(size>max){request.abort();finish(Error('BUSINESS_RESPONSE_TOO_LARGE'));}else chunks.push(chunk);});
   response.on('error',()=>finish(Error('BUSINESS_RESULT_UNKNOWN')));response.on('end',()=>{
    const contentType=response.headers['content-type'];if(!String(Array.isArray(contentType)?contentType[0]:contentType).toLowerCase().includes('application/json')){finish(Error('BUSINESS_RESPONSE_INVALID'));return;}
    let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{finish(Error('BUSINESS_RESPONSE_INVALID'));return;}finish(null,{status:response.statusCode,data});
   });
  });
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});if(body!==undefined)request.write(body);request.end();
 });
}
class EncryptedBusinessStore{
 constructor({root,safeStorage,protectPath=protect}){Object.assign(this,{root,safeStorage,protectPath});}
 crypto(){if(!this.safeStorage.isEncryptionAvailable()||this.safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('BUSINESS_OS_VAULT_UNAVAILABLE');}
 file(key){return path.join(this.root,hash(key)+'.vault');}
 read(key){this.crypto();const file=this.file(key);if(!fs.existsSync(file))return null;const s=fs.lstatSync(file);if(s.isSymbolicLink()||!s.isFile()||s.size>32*1024*1024)throw Error('BUSINESS_STORE_INVALID');this.protectPath(file);try{return JSON.parse(this.safeStorage.decryptString(fs.readFileSync(file)));}catch{throw Error('BUSINESS_STORE_INVALID');}}
 write(key,value){this.crypto();if(fs.existsSync(this.root)&&(!fs.lstatSync(this.root).isDirectory()||fs.lstatSync(this.root).isSymbolicLink()))throw Error('BUSINESS_STORE_INVALID');fs.mkdirSync(this.root,{recursive:true,mode:0o700});this.protectPath(this.root,{directory:true});const file=this.file(key),temp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,this.safeStorage.encryptString(JSON.stringify(value)),{flag:'wx',mode:0o600});this.protectPath(temp);fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
}
class BusinessSession{
 constructor({origin,session,root,safeStorage,contract,request=chromiumRequest,protectPath}){Object.assign(this,{origin,session,contract,request});this.store=new EncryptedBusinessStore({root,safeStorage,protectPath});this.flights=new Map();this.running=0;}
 descriptor(){let operationStoreReady=true;try{this.store.crypto();}catch{operationStoreReady=false;}return {protocolVersion:1,commands:Object.keys(this.contract.commands),operationStoreReady,uploadRecovery:'manual_if_unknown'};}
 async cookie(){const cookies=(await this.session.cookies.get({url:this.origin})).filter(x=>x.name==='design_ops_session');if(cookies.length!==1||!/^[A-Za-z0-9_-]{20,512}$/.test(cookies[0].value))throw Error('BUSINESS_LOGIN_REQUIRED');return 'design_ops_session='+cookies[0].value;}
 async http(cookie,endpoint,{method='GET',body,contentType,signal}={}){return this.request({session:this.session,url:this.origin+endpoint,method,headers:{Cookie:cookie,Accept:'application/json',...(method==='POST'?{Origin:this.origin,'Content-Type':contentType||'application/json'}:{})},body,signal});}
 async workspace(cookie,signal){const r=await this.http(cookie,'/api/workspace',{signal});if(r.status!==200)throw Error(r.status===401?'BUSINESS_LOGIN_REQUIRED':r.status===403?'BUSINESS_ACCESS_DENIED':'BUSINESS_UNAVAILABLE');this.contract.actorKey(r.data.actor);if(!Array.isArray(r.data.tasks))throw Error('BUSINESS_WORKSPACE_INVALID');return r.data;}
 context(workspace,sessionId){const value=this.store.read('context:'+sessionId);if(!value)return null;if(value.origin!==this.origin||!this.contract.sameActor(value.actor,workspace.actor))throw Error('BUSINESS_CONTEXT_ACCOUNT_CHANGED');this.contract.selectContext(workspace,value.refs);return value;}
 async perform(input,{signal}={}){
  const c=this.contract;c.only(input,['action','sessionId','expectedActor','selection','expectedContextVersion','command','input','operationId','file']);c.sessionId(input.sessionId);
  if(!['workspace','context.read','context.select','context.clear','command','operation.read','operation.recover','asset.upload'].includes(input.action))c.fail('BUSINESS_ACTION_UNSUPPORTED');
  if(this.running>=4)c.fail('BUSINESS_BUSY_NO_REPLAY');this.running++;
  try{
   const cookie=await this.cookie(),workspace=await this.workspace(cookie,signal),actor=c.actorKey(workspace.actor);
   if(input.expectedActor&&!c.sameActor(input.expectedActor,actor)||await this.cookie()!==cookie)c.fail('BUSINESS_ACCOUNT_CHANGED');
   if(input.action==='workspace')return {origin:this.origin,workspace,operationStoreReady:this.descriptor().operationStoreReady};
   if(input.action.startsWith('context.')){
    if(input.action==='context.read'){const old=this.store.read('context:'+input.sessionId);if(old&&(!c.sameActor(old.actor,actor)||old.origin!==this.origin))return {context:null,state:'account_changed',clearVersion:old.version,actor};return {context:this.context(workspace,input.sessionId),actor};}
    const old=this.store.read('context:'+input.sessionId);if(input.action!=='context.clear'&&old&&(!c.sameActor(old.actor,actor)||old.origin!==this.origin))c.fail('BUSINESS_CONTEXT_ACCOUNT_CHANGED');
    if(!Number.isSafeInteger(input.expectedContextVersion)||input.expectedContextVersion!==(old?.version??0))c.fail('BUSINESS_CONTEXT_CONFLICT');
    const value={origin:this.origin,actor,sessionId:input.sessionId,version:(old?.version??0)+1,refs:input.action==='context.clear'?{}:c.selectContext(workspace,input.selection)};this.store.write('context:'+input.sessionId,value);return {context:value,actor};
   }
   if(!c.uuid.test(input.operationId||''))c.fail('BUSINESS_OPERATION_ID_REQUIRED');
   const old=this.store.read('operation:'+input.operationId);
   if(old&&(old.origin!==this.origin||old.sessionId!==input.sessionId||!c.sameActor(old.actor,actor)))c.fail('BUSINESS_OPERATION_BINDING_CHANGED');
   if(input.action==='operation.read')return {operationId:input.operationId,status:old?.status??'not_found',result:old?.status==='acknowledged'?old.result:undefined,recoverable:old?.kind==='command'};
   if(input.action==='operation.recover'){
    if(!old)c.fail('BUSINESS_OPERATION_NOT_FOUND');if(old.status==='acknowledged')return {operationId:input.operationId,status:old.status,result:old.result};
    if(old.status==='rejected')return {operationId:input.operationId,status:'rejected',error:old.error};
    if(old.kind!=='command')return {operationId:input.operationId,status:'unknown',recoverable:false,reason:'UPLOAD_RECEIPT_RECONCILIATION_REQUIRED'};
    return await this.execute(old,cookie,workspace,signal);
   }
   const context=this.context(workspace,input.sessionId);
   if(input.expectedContextVersion!==undefined&&input.expectedContextVersion!==(context?.version??0))c.fail('BUSINESS_CONTEXT_CONFLICT');
   let payload,kind;
   if(input.action==='command'){
    payload=c.command(input.command,input.input);if(!c.mayCommand(workspace.actor,payload.name))c.fail('BUSINESS_ROLE_REQUIRED');c.contextAllows(workspace,context,payload.name,payload.input);kind='command';
   }else{
    c.only(input.file,['name','content','sha256','taskId','productId','purpose']);const f=input.file;
    if(typeof f.name!=='string'||!f.name||f.name.length>180||/[\\/\x00-\x1f]/.test(f.name)||typeof f.content!=='string'||f.content.length>28*1024*1024||!f.content||f.taskId&&f.productId)c.fail('BUSINESS_FILE_INVALID');
    const bytes=Buffer.from(f.content,'base64');if(!bytes.length||bytes.length>c.MAX_FILE||bytes.toString('base64')!==f.content||hash(bytes)!==f.sha256)c.fail('BUSINESS_FILE_HASH_INVALID');
    if(f.taskId){if(!c.uuid.test(f.taskId))c.fail('BUSINESS_FILE_INVALID');const task=workspace.tasks.find(x=>x.id===f.taskId);if(!workspace.actor.roles.includes('designer')||task?.assigneeId!==actor.id)c.fail('BUSINESS_ASSIGNEE_REQUIRED');c.contextAllows(workspace,context,'task.claim',{id:f.taskId});}
    else{if(!f.productId||!c.uuid.test(f.productId)||!workspace.products?.some(x=>x.id===f.productId)||!workspace.actor.roles.some(x=>['operations','operations_lead','owner'].includes(x)))c.fail('BUSINESS_PRODUCT_REQUIRED');if(context?.refs.taskId)c.fail('BUSINESS_CONTEXT_TARGET_MISMATCH');c.contextAllows(workspace,context,'product.save',{id:f.productId});}
    if(f.purpose&&!['reference','white-image'].includes(f.purpose))c.fail('BUSINESS_FILE_INVALID');payload={...f};kind='upload';
   }
   const digest=hash(c.stable(payload));if(old){if(old.digest!==digest||old.kind!==kind)c.fail('BUSINESS_IDEMPOTENCY_CONFLICT');return {operationId:input.operationId,status:old.status==='pending'?'unknown':old.status,result:old.status==='acknowledged'?old.result:undefined,recoverable:old.kind==='command'};}
   const intent={version:1,origin:this.origin,actor,sessionId:input.sessionId,operationId:input.operationId,kind,payload,digest,status:'pending',contextVersion:context?.version??0,context};
   this.store.write('operation:'+input.operationId,intent);return await this.execute(intent,cookie,workspace,signal);
  }finally{this.running--;}
 }
 async execute(intent,cookie,workspace,signal){
  const existing=this.flights.get(intent.operationId);if(existing)return existing;
  const run=this.send(intent,cookie,workspace,signal).finally(()=>this.flights.delete(intent.operationId));this.flights.set(intent.operationId,run);return run;
 }
 async send(intent,cookie,workspace,signal){
  const c=this.contract,context=intent.context;if(context)c.selectContext(workspace,context.refs);
  if(intent.kind==='command'){if(!c.mayCommand(workspace.actor,intent.payload.name))c.fail('BUSINESS_ROLE_REQUIRED');c.contextAllows(workspace,context,intent.payload.name,intent.payload.input);}
  let endpoint,body,contentType;
  if(intent.kind==='command'){endpoint='/api/commands';body=JSON.stringify({name:intent.payload.name,input:{...intent.payload.input,_idempotencyKey:intent.operationId}});}
  else{
   endpoint='/api/assets';const f=intent.payload,boundary='naumi-'+randomUUID(),parts=[];for(const field of ['taskId','productId','purpose'])if(f[field])parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${field}"\r\n\r\n${f[field]}\r\n`));
   parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${f.name.replace(/"/g,'_')}"\r\nContent-Type: application/octet-stream\r\n\r\n`),Buffer.from(f.content,'base64'),Buffer.from(`\r\n--${boundary}--\r\n`));body=Buffer.concat(parts);contentType='multipart/form-data; boundary='+boundary;
  }
  let result;
  try{
   const r=await this.http(cookie,endpoint,{method:'POST',body,contentType,signal});
   if(r.status>=200&&r.status<300){if(intent.kind==='command'&&r.data?.ok!==true||intent.kind==='upload'&&!c.uuid.test(r.data?.id||''))throw Error('BUSINESS_ACK_INVALID');intent.status='acknowledged';intent.result=intent.kind==='command'?r.data.result:r.data;}
   else{intent.status=r.status>=400&&r.status<500?'rejected':'unknown';intent.error={status:r.status,code:typeof r.data?.code==='string'?r.data.code:'BUSINESS_COMMAND_REJECTED'};}
  }catch{intent.status='unknown';intent.error={code:'BUSINESS_RESULT_UNKNOWN'};}
  // Successful upload stores only metadata, not the file body. It is never automatically uploaded again.
  if(intent.kind==='upload'){const {content,...metadata}=intent.payload;intent.payload=metadata;}
  this.store.write('operation:'+intent.operationId,intent);
  if(await this.cookie()!==cookie)c.fail('BUSINESS_ACCOUNT_CHANGED_NO_REPLAY');
  return {operationId:intent.operationId,status:intent.status,...intent.status==='acknowledged'?{result:intent.result}:{error:intent.error},recoverable:intent.kind==='command'};
 }
}
module.exports={BusinessSession,EncryptedBusinessStore,chromiumRequest};
