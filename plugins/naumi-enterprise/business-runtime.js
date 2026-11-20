import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {DesktopEnterpriseTransport} from './desktop-enterprise.js';
import contract from './business-contract.cjs';
const {actorKey,collections,commands,uuid,selectContext}=contract;
const hash=v=>createHash('sha256').update(v).digest('hex');
const fields={
 projects:['id','name','description','status','ownerId','teamIds','revision','startDate','endDate'],products:['id','name','sku','brand','category','status','revision','description'],
 requests:['id','title','brief','productId','priority','deadline','status','projectId','ownerId','acceptorId','targetTeamId','specialty','requestType','deliveryPlan','referenceSnapshot','revision'],
 tasks:['id','requestId','title','assigneeId','reviewerId','status','dueDate','skill','estimatedHours','grade','targetTeamId','revision','actualStartedAt','archiveAssetId','progress'],
 deliverables:['id','taskId','name','status','latestSubmissionId','weight'],submissions:['id','taskId','deliverableId','version','createdAt','createdBy','assetId','description'],
 assets:['id','taskId','productId','name','mimeType','size','url','createdBy','createdAt','purpose'],members:['id','name','roles','teamId','active','grade','skills','dailyCapacity','centralTitle'],
 teams:['id','name','kind','status','revision'],comments:['id','taskId','submissionId','authorId','body','text','createdAt','resolved'],decisions:['id','submissionId','taskId','reviewerId','outcome','reason','createdAt'],
};
const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]]));
export function projectBusinessWorkspace(data){actorKey(data?.actor);if(!Array.isArray(data.tasks))throw Error('BUSINESS_WORKSPACE_INVALID');return {actor:pick(data.actor,['id','name','tenantId','tenantName','roles','teamId','centralManaged','centralTitle']),revision:data.revision,today:data.today,...Object.fromEntries(collections.map(k=>[k,(data[k]||[]).map(x=>pick(x,fields[k]))]))};}
export class BusinessTransport extends DesktopEnterpriseTransport{
 async perform(input,{signal}={}){
  const d=this.descriptor();if(!d)throw Error('BUSINESS_DESKTOP_LOGIN_REQUIRED');if(d.enterprise.business?.protocolVersion!==1)throw Error('BUSINESS_DESKTOP_UPGRADE_REQUIRED');
  let response;try{response=await this.request(`http://127.0.0.1:${d.port}${contract.ENDPOINT}`,{method:'POST',headers:{Authorization:'Bearer '+d.token,'Content-Type':'application/json'},body:JSON.stringify(input),redirect:'error',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(45000)])});}catch{throw Error('BUSINESS_CONNECTION_LOST_NO_REPLAY');}
  const text=await response.text();if(text.length>9*1024*1024)throw Error('BUSINESS_RESPONSE_TOO_LARGE');let result;try{result=JSON.parse(text);}catch{throw Error('BUSINESS_RESPONSE_INVALID');}
  if(!response.ok||!result.ok)throw Error(/^BUSINESS_[A-Z_]+$/.test(result.error||'')?result.error:'BUSINESS_CONNECTION_LOST_NO_REPLAY');return result.data;
 }
}
export class BusinessRuntime{
 constructor({transport,creation,workingDirectory}){Object.assign(this,{transport,creation,workingDirectory});}
 async workspace(sessionId,signal){const data=await this.transport.perform({action:'workspace',sessionId},{signal});return {...projectBusinessWorkspace(data.workspace),operationStoreReady:data.operationStoreReady===true};}
 async status(sessionId,{agent,signal}={}){
  let enterprise,creation={configured:false,ready:false};try{const w=await this.workspace(sessionId,signal);enterprise={ready:true,operationStoreReady:w.operationStoreReady,actor:w.actor,revision:w.revision,counts:Object.fromEntries(collections.map(k=>[k,w[k].length])),commands:Object.entries(commands).map(([name,s])=>({name,fields:s.fields,required:s.required,roleEligible:contract.mayCommand(w.actor,name)})),authorization:'server rechecks each command; role eligibility is not object access',uploadRecovery:'manual_if_unknown'};}catch(e){enterprise={ready:false,error:e.message};}
  if(agent&&this.creation?.())try{creation=await this.creation().health(agent);}catch{creation={configured:true,ready:false,error:'CREATION_NOT_READY'};}
  else if(this.creation?.())try{creation={configured:!!this.creation().readBinding(),ready:false,requiresSession:true};}catch{creation={configured:false,ready:false,error:'CREATION_BINDING_NOT_READY'};}
  return {enterprise,creation};
 }
 async read(sessionId,{collection,id,query='',offset=0,limit=20,projectId,requestId,taskId}={},signal){
  if(!collections.includes(collection)||!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>50||typeof query!=='string'||query.length>200)throw Error('BUSINESS_QUERY_INVALID');
  for(const v of [id,projectId,requestId,taskId])if(v&&!uuid.test(v))throw Error('BUSINESS_OBJECT_ID_INVALID');
  const w=await this.workspace(sessionId,signal),refs=selectContext(w,{...(projectId?{projectId}:{}),...(requestId?{requestId}:{}),...(taskId?{taskId}:{})});let items=w[collection];
  const reqs=new Set(w.requests.filter(x=>!refs.projectId||x.projectId===refs.projectId).filter(x=>!refs.requestId||x.id===refs.requestId).map(x=>x.id));
  const tasks=new Set(w.tasks.filter(x=>reqs.has(x.requestId)).filter(x=>!refs.taskId||x.id===refs.taskId).map(x=>x.id));
  if(refs.projectId||refs.requestId||refs.taskId){
   if(collection==='projects')items=items.filter(x=>x.id===refs.projectId);
   if(collection==='requests')items=items.filter(x=>reqs.has(x.id));
   if(collection==='tasks')items=items.filter(x=>tasks.has(x.id));
   if(['deliverables','submissions','assets','comments','decisions'].includes(collection))items=items.filter(x=>tasks.has(x.taskId)||x.submissionId&&w.submissions.some(s=>s.id===x.submissionId&&tasks.has(s.taskId)));
  }
  if(id){items=items.filter(x=>x.id===id);if(!items.length)throw Error('BUSINESS_OBJECT_NOT_VISIBLE');}
  const q=query.trim().toLocaleLowerCase();if(q)items=items.filter(x=>[x.title,x.name,x.brief,x.description,x.sku].some(v=>typeof v==='string'&&v.toLocaleLowerCase().includes(q)));
  return {actor:actorKey(w.actor),revision:w.revision,collection,total:items.length,offset,items:items.slice(offset,offset+limit),nextOffset:offset+limit<items.length?offset+limit:null};
 }
 async context(sessionId,args,signal){const action=args.action||'read';if(!['read','select','clear'].includes(action))throw Error('BUSINESS_CONTEXT_ACTION_INVALID');return this.transport.perform({action:'context.'+action,sessionId,...action==='read'?{}:{expectedContextVersion:args.expectedVersion,selection:args.selection}},{signal});}
 async command(sessionId,args,signal){const w=await this.workspace(sessionId,signal);return this.transport.perform({action:'command',sessionId,expectedActor:actorKey(w.actor),command:args.command,input:args.input,operationId:args.operationId,...args.contextVersion===undefined?{}:{expectedContextVersion:args.contextVersion}},{signal});}
 async operation(sessionId,args,signal){if(!['read','recover'].includes(args.action))throw Error('BUSINESS_OPERATION_ACTION_INVALID');return this.transport.perform({action:'operation.'+args.action,sessionId,operationId:args.operationId},{signal});}
 async upload(sessionId,args,agent,signal){
  const cwd=await this.workingDirectory(agent,signal);if(!cwd)throw Error('BUSINESS_FILE_WORKSPACE_REQUIRED');const root=fs.realpathSync(cwd),file=fs.realpathSync(path.resolve(root,args.path)),relative=path.relative(root,file);if(!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw Error('BUSINESS_FILE_OUTSIDE_WORKSPACE');
  const fd=fs.openSync(file,'r');let bytes;try{const s=fs.fstatSync(fd);if(!s.isFile()||s.size<1||s.size>contract.MAX_FILE)throw Error('BUSINESS_FILE_INVALID');bytes=fs.readFileSync(fd);const after=fs.fstatSync(fd),current=fs.statSync(file);if(after.size!==s.size||after.mtimeMs!==s.mtimeMs||current.ino!==s.ino||current.dev!==s.dev||fs.realpathSync(file)!==file)throw Error('BUSINESS_FILE_CHANGED');}finally{fs.closeSync(fd);}
  const w=await this.workspace(sessionId,signal);return this.transport.perform({action:'asset.upload',sessionId,expectedActor:actorKey(w.actor),operationId:args.operationId,file:{name:path.basename(file),content:bytes.toString('base64'),sha256:hash(bytes),...(args.taskId?{taskId:args.taskId}:{}),...(args.productId?{productId:args.productId}:{}),purpose:args.purpose||'reference'},...args.contextVersion===undefined?{}:{expectedContextVersion:args.contextVersion}},{signal});
 }
}
