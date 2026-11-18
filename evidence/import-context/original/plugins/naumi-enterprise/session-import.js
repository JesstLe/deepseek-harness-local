import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {Session,SessionId} from '@deepseek-ai/dsh-session';
import {createUserMessage,createAssistantMessage} from '@deepseek-ai/dsh-llm';
import {ImportSources,readImportSnapshot,digest,importError} from './session-import-source.js';

async function readJSON(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
/** Durable no-clobber publication; an interrupted temporary file is never a committed plan. */
async function publish(file,value,{exclusive=false}={}){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp',h=await fs.open(tmp,'wx',0o600);try{await h.writeFile(JSON.stringify(value));await h.sync();}finally{await h.close();}try{if(exclusive)await fs.link(tmp,file);else await fs.rename(tmp,file);}finally{await fs.unlink(tmp).catch(()=>{});}}
const toolText=b=>b.kind==='tool-call'?'[历史工具调用 '+b.name+' / '+b.id+']\n'+b.text:b.kind==='tool-result'?'[历史工具结果 '+b.id+(b.isError?' / error':'')+']\n'+b.text:b.text;
export function importSessionPlan(snapshot,sessionId,cwd){
 const minimal=Session.create(SessionId(sessionId)),session=Session.create(SessionId(sessionId),undefined,{...minimal.header,cwd}),events=[],mapping=[];const append=(...args)=>{const e=session.append(...args);events.push(e);return e;};
 append('session/title',{title:snapshot.title,messageSeqs:[],source:{kind:'user'}});
 append('user/message',createUserMessage({source:{kind:'naumi-session-import',form:'recall'},content:[{type:'text',text:`[${snapshot.provider} 历史会话；历史工具仅为记录，不代表当前工具、权限或待执行请求。来源 ${snapshot.sourceSessionId}，快照 ${snapshot.fingerprint}。]`}]}),{surfaceOp:'append'});
 let turn=0;
 for(const m of snapshot.messages){const content=[{type:'text',text:m.blocks.map(toolText).join('\n\n')}];let e;
  if(m.role==='user')e=append('user/message',createUserMessage({source:{kind:'naumi-session-import',form:'recall'},content}),{surfaceOp:'append'});
  else{turn++;append('turn/start',{turn});append('step/start',{turn,step:1});e=append('assistant/message',{turn,step:1,message:createAssistantMessage({source:{provider:'imported-'+snapshot.provider,model:'transcript'},content}),stream:[]},{surfaceOp:'append'});append('step/end',{turn,step:1});append('turn/end',{turn,reason:{kind:'completed'}});}
  mapping.push({sourceId:m.sourceId,line:m.line,time:m.time,seq:e.seq,messageId:m.role==='user'?e.data.id:e.data.message.id});
 }
 return{version:1,sessionId,header:session.header,events,mapping,snapshot,snapshotDigest:digest(JSON.stringify(snapshot)),eventsDigest:digest(JSON.stringify(events))};
}
export class SessionImporter{
 constructor({ctx,home=process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),sources=new ImportSources(),fault=()=>{}}){this.ctx=ctx;this.sources=sources;this.root=path.join(home,'naumi','session-import');this.tail=Promise.resolve();this.fault=fault;}
 async discover({offset=0,limit=40}={}){if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)importError('INVALID_PAGE');const {items,warnings}=await this.sources.scan();return{items:await Promise.all(items.slice(offset,offset+limit).map(x=>this.sources.metadata(x))),total:items.length,offset,nextOffset:offset+limit<items.length?offset+limit:null,warnings};}
 workspace(workspaceId){const w=this.ctx.workspaceRegistry.get(workspaceId);if(!w)importError('WORKSPACE_NOT_FOUND',404);return w;}
 key(sourceId,workspace){if(!/^[a-f0-9]{64}$/.test(sourceId??''))importError('SOURCE_NOT_FOUND',404);return digest(sourceId+'\0'+workspace.path);}
 validate(plan,key,workspaceId,workspace){if(plan.key!==key||plan.workspaceId!==workspaceId||plan.header.cwd!==workspace.path||plan.eventsDigest!==digest(JSON.stringify(plan.events))||plan.snapshotDigest!==digest(JSON.stringify(plan.snapshot)))importError('PLAN_INTEGRITY',409);}
 async preview({sourceId,workspaceId,offset=0,limit=80}){if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)importError('INVALID_PAGE');let s,status='source',sourceStatus='unchanged';
  if(workspaceId){const w=this.workspace(workspaceId),key=this.key(sourceId,w),dir=path.join(this.root,key),plan=await readJSON(path.join(dir,'plan.json'));if(plan){this.validate(plan,key,workspaceId,w);s=plan.snapshot;status=await readJSON(path.join(dir,'receipt.json'))?'imported':'pending';}}
  if(!s)s=await readImportSnapshot(await this.sources.resolve(sourceId));else{try{const current=await readImportSnapshot(await this.sources.resolve(sourceId));if(current.fingerprint!==s.fingerprint)sourceStatus='changed';}catch{sourceStatus='unavailable';}}
  const messages=s.messages.slice(offset,offset+limit).map(m=>({...m,blocks:m.blocks.map(b=>b.text?.length>16000?{...b,text:b.text.slice(0,16000),previewTruncated:true,sourceChars:b.text.length}:b)}));
  return{...s,snapshotStatus:status,sourceStatus,messages,messageCount:s.messages.length,offset,nextOffset:offset+limit<s.messages.length?offset+limit:null};}
 perform(input){const run=this.tail.then(()=>this.import(input));this.tail=run.catch(()=>{});return run;}
 async import({sourceId,fingerprint,workspaceId,acknowledgePartial=false}){
  if(!/^[a-f0-9]{64}$/.test(fingerprint??''))importError('PREVIEW_REQUIRED');const workspace=this.workspace(workspaceId),key=this.key(sourceId,workspace),dir=path.join(this.root,key),planFile=path.join(dir,'plan.json'),receiptFile=path.join(dir,'receipt.json');
  let plan=await readJSON(planFile);const receipt=await readJSON(receiptFile);
  if(receipt){if(!plan)importError('PLAN_INTEGRITY',409);this.validate(plan,key,workspaceId,workspace);if(receipt.sessionId!==plan.sessionId||receipt.fingerprint!==plan.snapshot.fingerprint)importError('PLAN_INTEGRITY',409);if(!await this.ctx.sessionPersistence.stat(SessionId(receipt.sessionId)))importError('SESSION_MISSING',409);return{...receipt,existing:true,sourceChanged:fingerprint!==receipt.fingerprint};}
  if(!plan){const snapshot=await readImportSnapshot(await this.sources.resolve(sourceId));if(snapshot.fingerprint!==fingerprint)importError('SOURCE_CHANGED',409);if((snapshot.incompleteTailBytes||snapshot.stats.attachments||snapshot.stats.unsupported||snapshot.stats.offBranch)&&acknowledgePartial!==true)importError('ACKNOWLEDGEMENT_REQUIRED',409);
   plan=importSessionPlan(snapshot,'naumi-import-'+key.slice(0,40),workspace.path);plan.key=key;plan.workspaceId=workspaceId;try{await publish(planFile,plan,{exclusive:true});}catch(e){if(e.code!=='EEXIST')throw e;plan=await readJSON(planFile);}
  }
  this.validate(plan,key,workspaceId,workspace);
  if(plan.snapshot.fingerprint!==fingerprint)importError('PENDING_SNAPSHOT_CHANGED',409);await this.fault('after-plan',plan);
  const sid=SessionId(plan.sessionId);let h;
  try{const stored=await this.ctx.sessionPersistence.stat(sid);h=stored?await this.ctx.sessionPersistence.open(sid,'write'):await this.ctx.sessionPersistence.create(plan.header);
   if(h.header.cwd!==workspace.path)importError('SESSION_CONFLICT',409);const read=await h.read(),prefix=read.events;
   if(prefix.length>plan.events.length||prefix.some((e,i)=>JSON.stringify(e)!==JSON.stringify(plan.events[i])))importError('SESSION_CONFLICT',409);
   if(prefix.length<plan.events.length)await h.append(plan.events.slice(prefix.length));await h.flush();await this.fault('after-flush',plan);
  }finally{await h?.close();}
  await this.workspace(workspaceId).attachSession(sid);await this.fault('after-attach',plan);
  const result={version:1,sessionId:sid,workspaceId,sourceId,provider:plan.snapshot.provider,sourceSessionId:plan.snapshot.sourceSessionId,fingerprint:plan.snapshot.fingerprint,messageCount:plan.snapshot.messages.length,importedAt:new Date().toISOString()};await publish(receiptFile,result);return{...result,existing:false,sourceChanged:false};
 }
}
export function installSessionImport(ctx,options={}){return ctx.inject(['sessionPersistence','workspaceRegistry'],scope=>{
 const importer=new SessionImporter({ctx:scope,...options});scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/session-import',handler:async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Naumi-Session-Import','1');const send=(status,body)=>res.writeHead(status).end(JSON.stringify(body));
  try{const a=scope.connection.admit(req);if('rejection'in a){send(a.rejection,{error:'IMPORT_OWNER_REQUIRED'});return;}if(a.peer.principal.kind!=='owner')importError('OWNER_REQUIRED',403);
   if(req.method!=='POST'){res.setHeader('Allow','POST');importError('METHOD',405);}if(req.headers['x-naumi-import']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))importError('SAME_ORIGIN_REQUIRED',403);
   let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>8192)importError('REQUEST_TOO_LARGE',413);chunks.push(b);}let v;try{v=JSON.parse(Buffer.concat(chunks));}catch{importError('INVALID_REQUEST');}
   if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['action','sourceId','fingerprint','workspaceId','acknowledgePartial','offset','limit'].includes(k)))importError('INVALID_REQUEST');
   if(v.action==='discover')send(200,await importer.discover(v));else if(v.action==='preview')send(200,await importer.preview(v));else if(v.action==='import')send(200,await importer.perform(v));else importError('INVALID_ACTION');
  }catch(e){if(!res.headersSent)send(e.status??500,{error:/^IMPORT_[A-Z_0-9]+$/.test(e.message)?e.message:'IMPORT_UNAVAILABLE'});}
 }}));scope.effect(()=>async()=>{await importer.tail;});
});}
