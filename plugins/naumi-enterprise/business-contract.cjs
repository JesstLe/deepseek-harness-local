'use strict';
// Shared by Desktop main and Host. Only domain actions, never arbitrary URLs/headers/SQL.
const ENDPOINT='/enterprise/business',MAX_FILE=20*1024*1024,MAX_BODY=29*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const commands={
 'project.save':{roles:['governance'],collection:'projects',fields:['id','revision','name','description','ownerId','teamIds','startDate','endDate'],required:['name','ownerId','teamIds']},
 'project.transition':{roles:['governance'],collection:'projects',fields:['id','revision','status','reason'],required:['id','revision','status','reason']},
 'product.save':{roles:['operations','owner'],collection:'products',fields:['id','revision','name','sku','brand','category','description','supplierIds','imageIds'],required:['name','sku']},
 'request.save':{roles:['operations','owner'],collection:'requests',fields:['id','revision','productId','brand','productName','sku','title','brief','priority','deadline','projectId','acceptorId','targetTeamId','deliverables','specialty','requestType','deliveryPlan','estimatedHours','grade','skill','imageIds'],required:['title','brief','deadline']},
 'request.publish':{roles:['operations','owner'],collection:'requests',fields:['id','revision'],required:['id','revision']},
 'task.assign':{roles:['design_admin','director','owner'],collection:'tasks',fields:['id','revision','assigneeId','reviewerId','startDate','endDate','hours','reason'],required:['id','revision','assigneeId','startDate','endDate','hours']},
 'task.claim':{roles:['designer'],collection:'tasks',fields:['id','revision'],required:['id','revision']},
 'task.start':{roles:['designer'],collection:'tasks',fields:['id','revision'],required:['id','revision']},
 'task.pause':{roles:['designer','design_admin','director','owner'],collection:'tasks',fields:['id','revision','reason'],required:['id','revision','reason']},
 'task.resume':{roles:['designer','design_admin','director','owner'],collection:'tasks',fields:['id','revision','reason'],required:['id','revision','reason']},
 'deliverable.submit':{roles:['designer'],collection:'deliverables',fields:['id','assetId','description'],required:['id','assetId']},
};
const collections=['projects','products','requests','tasks','deliverables','submissions','assets','members','teams','comments','decisions'];
function fail(code){throw Error(code);}
function object(v){return v&&typeof v==='object'&&!Array.isArray(v);}
function only(v,keys){if(!object(v)||Object.keys(v).some(k=>!keys.includes(k)))fail('BUSINESS_INPUT_INVALID');}
function sessionId(value){if(typeof value!=='string'||!value||value.length>200)fail('BUSINESS_SESSION_REQUIRED');return value;}
function actorKey(actor){if(!actor||!uuid.test(actor.id??'')||!uuid.test(actor.tenantId??''))fail('BUSINESS_ACTOR_INVALID');return {id:actor.id,tenantId:actor.tenantId};}
const sameActor=(a,b)=>a?.id===b?.id&&a?.tenantId===b?.tenantId;
function mayCommand(actor,name){const roles=actor.roles||[];return commands[name]?.roles.some(r=>r==='governance'?(actor.centralManaged?actor.centralTitle==='system_admin':roles.includes('owner')):roles.includes(r)||r==='operations'&&roles.includes('operations_lead'))??false;}
function command(name,input){
 const spec=commands[name];if(!spec)fail('BUSINESS_COMMAND_UNSUPPORTED');only(input,spec.fields);
 for(const key of spec.required)if(input[key]===undefined||input[key]===null||input[key]==='')fail('BUSINESS_COMMAND_FIELD_REQUIRED');
 for(const key of ['id','productId','projectId','assetId','ownerId','assigneeId','reviewerId','acceptorId'])if(input[key]!=null&&input[key]!==''&&!uuid.test(input[key]))fail('BUSINESS_OBJECT_ID_INVALID');
 if(input.id&&name!=='deliverable.submit'&&(!Number.isSafeInteger(input.revision)||input.revision<1))fail('BUSINESS_REVISION_REQUIRED');
 if(name==='request.save'&&!input.id&&!input.specialty&&(!Array.isArray(input.deliverables)||!input.deliverables.length))fail('BUSINESS_DELIVERY_SPEC_REQUIRED');
 if(Buffer.byteLength(JSON.stringify(input))>128*1024)fail('BUSINESS_COMMAND_TOO_LARGE');return {name,input};
}
function selectContext(workspace,input){
 only(input,['projectId','requestId','taskId']);const refs={};for(const [field,kind]of [['projectId','projects'],['requestId','requests'],['taskId','tasks']])if(input[field]){
  if(!uuid.test(input[field])||!(workspace[kind]||[]).some(x=>x.id===input[field]))fail('BUSINESS_CONTEXT_NOT_VISIBLE');refs[field]=input[field];
 }
 const task=workspace.tasks?.find(x=>x.id===refs.taskId),request=workspace.requests?.find(x=>x.id===(task?.requestId||refs.requestId));
 if(task&&refs.requestId&&task.requestId!==refs.requestId||request&&refs.projectId&&request.projectId!==refs.projectId)fail('BUSINESS_CONTEXT_RELATION_MISMATCH');
 if(task&&task.requestId)refs.requestId=task.requestId;if(request?.projectId)refs.projectId=request.projectId;
 // Reject an inferred parent hidden by an inconsistent/partial upstream projection.
 for(const [field,kind]of [['projectId','projects'],['requestId','requests']])if(refs[field]&&!(workspace[kind]||[]).some(x=>x.id===refs[field]))fail('BUSINESS_CONTEXT_PARENT_NOT_VISIBLE');
 return refs;
}
function contextAllows(workspace,context,name,input){
 if(!context)return;
 const refs=context.refs||{};let taskId,requestId,projectId;
 if(name==='request.save'&&!input.id&&(refs.requestId||refs.taskId||refs.projectId&&input.projectId!==refs.projectId))fail('BUSINESS_CONTEXT_TARGET_MISMATCH');
 if(name==='product.save'&&refs.requestId){const request=workspace.requests?.find(x=>x.id===refs.requestId);if(!request||request.productId!==input.id)fail('BUSINESS_CONTEXT_TARGET_MISMATCH');}
 if(name.startsWith('task.'))taskId=input.id;
 else if(name==='deliverable.submit'){const d=workspace.deliverables?.find(x=>x.id===input.id);if(!d)fail('BUSINESS_OBJECT_NOT_VISIBLE');taskId=d.taskId;}
 else if(name.startsWith('request.'))requestId=input.id;
 else if(name.startsWith('project.'))projectId=input.id;
 if(taskId){const task=workspace.tasks?.find(x=>x.id===taskId);if(!task)fail('BUSINESS_OBJECT_NOT_VISIBLE');requestId=task.requestId;}
 if(requestId){const request=workspace.requests?.find(x=>x.id===requestId);if(!request)fail('BUSINESS_OBJECT_NOT_VISIBLE');projectId=request.projectId;}
 if(refs.taskId&&taskId&&refs.taskId!==taskId||refs.requestId&&requestId&&refs.requestId!==requestId||refs.projectId&&projectId&&refs.projectId!==projectId)fail('BUSINESS_CONTEXT_TARGET_MISMATCH');
}
const stable=v=>Array.isArray(v)?v.map(stable):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
module.exports={ENDPOINT,MAX_FILE,MAX_BODY,uuid,commands,collections,fail,only,object,sessionId,actorKey,sameActor,mayCommand,command,selectContext,contextAllows,stable};
