'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {atomic,exists}=require('./profile.cjs');
const {readConnection,connect,enterpriseOrigin}=require('./enterprise.cjs');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function directory(file){if(exists(file)&&(!fs.lstatSync(file).isDirectory()||fs.lstatSync(file).isSymbolicLink()))throw Error('WORKSPACE_DIRECTORY_UNMANAGED');fs.mkdirSync(file,{recursive:true});}
function homeFor(userData,id){if(id==='default')return path.join(userData,'harness');if(!uuid.test(id))throw Error('WORKSPACE_INDEX_INVALID');for(const p of[path.join(userData,'enterprise-workspaces'),path.join(userData,'enterprise-workspaces',id)])if(exists(p)&&(!fs.lstatSync(p).isDirectory()||fs.lstatSync(p).isSymbolicLink()))throw Error('WORKSPACE_DIRECTORY_UNMANAGED');return path.join(userData,'enterprise-workspaces',id,'harness');}
function readWorkspaces(userData){
 const file=path.join(userData,'desktop-workspaces.json');
 if(!exists(file)){const legacy=readConnection(homeFor(userData,'default'));return {version:1,active:'default',entries:legacy?[{id:'default',origin:legacy.origin}]:[]};}
 if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).size>1024*1024)throw Error('WORKSPACE_INDEX_INVALID');
 let value;try{value=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('WORKSPACE_INDEX_INVALID');}
 if(value.version!==1||!Array.isArray(value.entries)||typeof value.active!=='string')throw Error('WORKSPACE_INDEX_INVALID');
 const ids=new Set(),origins=new Set();for(const item of value.entries){if(!item||item.id!=='default'&&!uuid.test(item.id)||ids.has(item.id)||origins.has(item.origin)||enterpriseOrigin(item.origin)!==item.origin)throw Error('WORKSPACE_INDEX_INVALID');ids.add(item.id);origins.add(item.origin);}
 if(value.entries.length?!ids.has(value.active):value.active!=='default')throw Error('WORKSPACE_INDEX_INVALID');return value;
}
function currentWorkspace(userData){const index=readWorkspaces(userData),entry=index.entries.find(e=>e.id===index.active),home=homeFor(userData,index.active);if(entry&&readConnection(home)?.origin!==entry.origin)throw Error('WORKSPACE_CONFIGURATION_MISMATCH');return {id:index.active,home,origin:entry?.origin??null};}
function workspaceSummary(userData){const index=readWorkspaces(userData);return {configured:!!index.entries.length,origin:index.entries.find(e=>e.id===index.active)?.origin??'',entries:index.entries.map(e=>({id:e.id,origin:e.origin,active:e.id===index.active}))};}
function selectWorkspace(userData,origin,{fault=()=>{}}={}){
 origin=enterpriseOrigin(origin);directory(userData);const index=readWorkspaces(userData);let entry=index.entries.find(e=>e.origin===origin),created=false;
 if(!entry){
  const id=index.entries.length?randomUUID():'default',home=homeFor(userData,id);
  if(id!=='default'){directory(path.join(userData,'enterprise-workspaces'));directory(path.dirname(home));}directory(home);
  connect(home,origin);entry={id,origin};index.entries.push(entry);created=true;
 }else if(readConnection(homeFor(userData,entry.id))?.origin!==origin)throw Error('WORKSPACE_CONFIGURATION_MISMATCH');
 // Prepare the owned home first, then commit the single active pointer. A failed write never
 // points to half-written employee data. Unreferenced prepared homes are retained, not erased.
 fault('prepared');atomic(path.join(userData,'desktop-workspaces.json'),{...index,active:entry.id});fault('committed');
 return {id:entry.id,home:homeFor(userData,entry.id),origin,created};
}
async function verifyConnection(origin,request,{signal,timeoutMs=8000}={}){
 origin=enterpriseOrigin(origin);let response;
 try{response=await request(origin+'/api/workspace',{method:'GET',credentials:'omit',redirect:'error',cache:'no-store',headers:{Accept:'application/json'},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(timeoutMs)])});}
 catch(error){throw Error(signal?.aborted?'ENTERPRISE_CONNECTION_CANCELLED':'ENTERPRISE_CONNECTION_UNAVAILABLE');}
 if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error('ENTERPRISE_CONNECTION_INCOMPATIBLE');
 const reader=response.body?.getReader();if(!reader)throw Error('ENTERPRISE_CONNECTION_INCOMPATIBLE');const chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>65536)throw Error('ENTERPRISE_CONNECTION_INCOMPATIBLE');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw Error('ENTERPRISE_CONNECTION_INCOMPATIBLE');}
 const login=response.status===401&&value.code==='UNAUTHENTICATED',pending=response.status===403&&['ACCESS_PENDING','FORBIDDEN','MEMBER_INACTIVE','TENANT_INACTIVE'].includes(value.code),workspace=response.ok&&value.actor?.id&&Array.isArray(value.tasks);
 if(!login&&!pending&&!workspace)throw Error('ENTERPRISE_CONNECTION_INCOMPATIBLE');return {origin,status:response.status};
}
async function assertWorkspaceIdle(settings,request){
 const response=await request(settings.url+'/api/session/list',{method:'POST',credentials:'include',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:randomUUID(),method:'session/list',payload:{args:{_request:{}}}}),signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('WORKSPACE_ACTIVITY_UNKNOWN');let body;try{body=await response.json();}catch{throw Error('WORKSPACE_ACTIVITY_UNKNOWN');}const result=body.result;
 if(!result?.ok||!Array.isArray(result.value?.items))throw Error('WORKSPACE_ACTIVITY_UNKNOWN');if(result.value.items.some(s=>s.running===true))throw Error('WORKSPACE_RUNNING_TASKS');
}
module.exports={readWorkspaces,currentWorkspace,workspaceSummary,selectWorkspace,verifyConnection,assertWorkspaceIdle,homeFor};
