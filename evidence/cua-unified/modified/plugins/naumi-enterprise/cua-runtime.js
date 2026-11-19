import {z} from 'zod';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {resolveDesktopRuntime,CUA_VERSION} from './desktop-runtime.js';

const actions=['click','double_click','right_click','type_text','press_key','hotkey','scroll','drag'];
const allowed=new Set(['check_permissions','list_windows','get_window_state','get_desktop_state','end_session',...actions]);
const argsSchema=z.object({action:z.enum(['status','list_windows','observe','release',...actions]),pid:z.number().int().positive().optional(),window_id:z.number().int().positive().optional(),app:z.string().max(300).optional(),observationId:z.string().max(100).optional(),x:z.number().finite().optional(),y:z.number().finite().optional(),from_x:z.number().finite().optional(),from_y:z.number().finite().optional(),to_x:z.number().finite().optional(),to_y:z.number().finite().optional(),text:z.string().max(20000).optional(),key:z.string().min(1).max(60).optional(),keys:z.array(z.string().min(1).max(60)).min(2).max(8).optional(),direction:z.enum(['up','down','left','right']).optional(),amount:z.number().int().min(1).max(50).optional(),button:z.enum(['left','right','middle']).optional(),count:z.number().int().min(1).max(3).optional(),duration_ms:z.number().int().min(0).max(10000).optional(),delivery_mode:z.enum(['background','foreground']).optional()}).strict();
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
const fail=code=>{throw Error(code);};
/** OS-wide lock. A live or partially written owner is never stolen. */
export class DesktopLease{
 constructor({directory=path.join(process.env.LOCALAPPDATA??os.tmpdir(),'Naumi','cua'),clock=Date.now,ttl=120000}={}){Object.assign(this,{directory,clock,ttl});this.file=path.join(directory,'input.lock');this.owner=null;this.inFlight=false;}
 acquire(owner){
  if(this.owner===owner){this.until=this.clock()+this.ttl;return;}
  if(this.owner){if(this.inFlight||this.blocked||this.until>this.clock())fail('CUA_DESKTOP_BUSY');this.release(this.owner);}
  fs.mkdirSync(this.directory,{recursive:true});
  const nonce=randomUUID(),record={pid:process.pid,nonce};
  const open=()=>{const fd=fs.openSync(this.file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(record));}finally{fs.closeSync(fd);}};
  try{open();}catch(e){
   if(e.code!=='EEXIST')throw e;
   let guard;try{guard=fs.openSync(this.file+'.recovery','wx',0o600);}catch{fail('CUA_DESKTOP_BUSY');}
   try{
   let old,raw;try{raw=fs.readFileSync(this.file,'utf8');old=JSON.parse(raw);}catch{fail('CUA_DESKTOP_BUSY');}
   if(!Number.isInteger(old.pid)||old.pid<=0)fail('CUA_DESKTOP_BUSY');
   try{process.kill(old.pid,0);fail('CUA_DESKTOP_BUSY');}catch(err){if(err.code!=='ESRCH')throw err;}
   if(fs.readFileSync(this.file,'utf8')!==raw)fail('CUA_DESKTOP_BUSY');
   fs.unlinkSync(this.file);try{open();}catch{fail('CUA_DESKTOP_BUSY');}
   }finally{fs.closeSync(guard);fs.unlinkSync(this.file+'.recovery');}
  }
  this.nonce=nonce;this.owner=owner;this.until=this.clock()+this.ttl;
 }
 release(owner){if(this.owner!==owner)return;if(this.inFlight)fail('CUA_ACTION_IN_FLIGHT');try{const v=JSON.parse(fs.readFileSync(this.file,'utf8'));if(v.nonce===this.nonce&&v.pid===process.pid)fs.unlinkSync(this.file);}catch(e){if(e.code!=='ENOENT')throw e;}this.owner=null;this.nonce=null;}
}
export async function openCuaClient(runtime=resolveDesktopRuntime()){
 const client=new Client({name:'naumi-cua',version:'1.0.0'});
 const env=Object.fromEntries(['SystemRoot','WINDIR','PATH','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
 const transport=new StdioClientTransport({command:runtime.command,args:runtime.args,cwd:path.dirname(runtime.command),env:{...env,...runtime.env},stderr:'pipe',maxBufferSize:32*1024*1024});
 transport.stderr?.on('data',()=>{}); // Do not copy window content into shared logs.
 try{await client.connect(transport);const list=await client.listTools();for(const name of allowed)if(!list.tools.some(t=>t.name===name))fail('CUA_DRIVER_SCHEMA_MISMATCH');}
 catch(e){await client.close();throw e;}
 return {call:async(name,args,signal)=>{if(!allowed.has(name))fail('CUA_TOOL_NOT_ALLOWED');return client.callTool({name,arguments:args},undefined,{signal,timeout:30000});},close:()=>client.close(),pid:transport.pid};
}
/** A single CUA engine; real Session identity, one-use observations, no write replay. */
export class CuaRuntime{
 constructor({open=openCuaClient,lease=new DesktopLease(),clock=Date.now}={}){Object.assign(this,{open,lease,clock});this.observations=new Map();this.unknown=new Set();this.removed=new Set();this.closed=false;this.connected=false;}
 async client(){if(this.closed)fail('CUA_CLOSED');if(!this.flight)this.flight=this.open().then(c=>{this.connected=true;return c;}).catch(e=>{this.flight=null;throw e;});return this.flight;}
 session(id){return 'naumi-'+createHash('sha256').update(id).digest('hex').slice(0,32);}
 async call(id,name,args,signal){signal?.throwIfAborted();const c=await this.client();signal?.throwIfAborted();if(this.closed||this.removed.has(id))fail('CUA_SESSION_DISPOSED');return c.call(name,{...args,session:this.session(id)},signal);}
 async observe(id,args,signal){
  const target=Number.isInteger(args.pid)&&Number.isInteger(args.window_id)?{pid:args.pid,window_id:args.window_id}:{};
  if((args.pid!==undefined||args.window_id!==undefined)&&!target.pid)fail('CUA_EXACT_WINDOW_REQUIRED');
  this.observations.delete(id);
  const r=await this.call(id,target.pid?'get_window_state':'get_desktop_state',{...target,max_image_dimension:1600,...target.pid?{include_accessibility_tree:false,include_screenshot:true}:{}},signal);
  this.observations.delete(id);if(r.isError)return r;
  const img=r.content?.find(x=>x.type==='image'&&x.mimeType==='image/png'),data=img&&Buffer.from(img.data,'base64');
  if(!data||data.length<24||data.subarray(1,4).toString()!=='PNG')fail('CUA_SCREENSHOT_REQUIRED');
  if(this.closed||this.removed.has(id))fail('CUA_SESSION_DISPOSED');
  const observationId=randomUUID(),row={observationId,target,leaseNonce:this.lease.nonce,width:data.readUInt32BE(16),height:data.readUInt32BE(20),at:this.clock(),captureId:r.structuredContent?.capture_id};
  this.observations.set(id,row);this.unknown.delete(id);this.lease.blocked=false;
  const info={observationId,width:row.width,height:row.height,target:target.pid?target:{scope:'desktop'},expiresInMs:30000};
  return {...r,content:[...r.content,{type:'text',text:JSON.stringify(info)}],structuredContent:{...r.structuredContent,...info}};
 }
 async perform(id,args,{signal}={}){
  if(typeof id!=='string'||!id)fail('CUA_SESSION_REQUIRED');if(this.closed||this.removed.has(id))fail('CUA_SESSION_DISPOSED');signal?.throwIfAborted();
  const action=args.action;
  if(args.session!==undefined||args.element_token!==undefined||args.target!==undefined)fail('CUA_HOST_SCOPE_REQUIRED');
  if(!['status','list_windows','observe','release',...actions].includes(action))fail('CUA_ACTION_INVALID');
  if(!argsSchema.safeParse(args).success)fail('CUA_INPUT_INVALID');
  if(action==='type_text'&&args.text===undefined||action==='press_key'&&!args.key||action==='hotkey'&&!args.keys||action==='scroll'&&!args.direction)fail('CUA_INPUT_INVALID');
  if(action==='status'){const r=await this.call(id,'check_permissions',{},signal);return {...r,structuredContent:{...r.structuredContent,engine:'cua',version:CUA_VERSION,connected:true,unknown:this.unknown.has(id)}};}
  if(action==='list_windows')return this.call(id,'list_windows',{...args.pid!==undefined?{pid:args.pid}:{},...args.app?{app:args.app}:{}},signal);
  if(!['observe','release',...actions].includes(action))fail('CUA_ACTION_INVALID');
  if(this.busy)fail('CUA_ACTION_IN_FLIGHT');
  if(action==='release'){if(this.unknown.has(id))fail('CUA_OBSERVE_REQUIRED_AFTER_UNKNOWN');this.busy=true;try{this.observations.delete(id);if(this.lease.owner===id){await this.call(id,'end_session',{},signal);this.lease.release(id);}return text({released:true});}finally{this.busy=false;}}
  this.lease.acquire(id);this.busy=true;this.lease.inFlight=true;this.abort=new AbortController();signal=signal?AbortSignal.any([signal,this.abort.signal]):this.abort.signal;this.active=new Promise(resolve=>{this.settle=resolve;});
  try{
   if(action==='observe')return await this.observe(id,args,signal);
   if(this.unknown.has(id))fail('CUA_OBSERVE_REQUIRED_AFTER_UNKNOWN');
   const o=this.observations.get(id);if(!o||o.leaseNonce!==this.lease.nonce||o.observationId!==args.observationId||this.clock()-o.at>30000)fail('CUA_FRESH_OBSERVATION_REQUIRED');
   const pairs=action==='drag'?[['from_x','from_y'],['to_x','to_y']]:(['click','double_click','right_click','scroll'].includes(action)||args.x!==undefined||args.y!==undefined)?[['x','y']]:[];
   for(const [x,y]of pairs)if(!Number.isFinite(args[x])||!Number.isFinite(args[y])||args[x]<0||args[y]<0||args[x]>=o.width||args[y]>=o.height)fail('CUA_COORDINATES_OUT_OF_CAPTURE');
   const input={...o.target,...o.target.pid?{}:{scope:'desktop'}};
   const keys={click:['x','y','button','count'],double_click:['x','y'],right_click:['x','y'],scroll:['x','y','direction','amount'],drag:['from_x','from_y','to_x','to_y','duration_ms'],type_text:['text','x','y'],press_key:['key','x','y'],hotkey:['keys','x','y']}[action];
   for(const key of keys)if(args[key]!==undefined)input[key]=args[key];
   if(['click','double_click','right_click'].includes(action)){if(o.captureId)input.capture_id=o.captureId;if(action==='double_click')input.count=2;if(action==='right_click')input.button='right';}
   if(o.target.pid)input.delivery_mode=args.delivery_mode??'background';
   this.observations.delete(id);signal?.throwIfAborted();
   let result;
   try{result=await this.call(id,['double_click','right_click'].includes(action)?'click':action,input,signal);}catch{this.unknown.add(id);this.lease.blocked=true;await this.dropClient();fail('CUA_ACTION_UNKNOWN_OBSERVE_BEFORE_RETRY');}
   if(result.isError){this.unknown.add(id);this.lease.blocked=true;return result;}
   let after;try{after=await this.observe(id,o.target,signal);}catch{this.unknown.add(id);this.lease.blocked=true;await this.dropClient();fail('CUA_ACTION_UNKNOWN_POST_OBSERVATION_FAILED');}
   if(after.isError){this.unknown.add(id);this.lease.blocked=true;return after;}
   return {...after,content:[...result.content,...after.content],structuredContent:{...after.structuredContent,actionResult:result.structuredContent??null,verificationRequired:true}};
  }finally{this.busy=false;this.lease.inFlight=false;if(this.removed.has(id)){this.observations.delete(id);this.lease.blocked=false;this.lease.release(id);}this.settle?.();this.active=null;this.abort=null;}
 }
 async dropClient(){const old=this.flight;this.flight=null;this.connected=false;const c=await old?.catch(()=>null);await c?.close();}
 async attach(id){if(this.removed.has(id)&&this.lease.owner===id)await this.active;this.removed.delete(id);}
 async remove(id){this.removed.add(id);if(this.lease.owner===id&&this.busy){this.abort?.abort();await this.active;}this.observations.delete(id);this.unknown.delete(id);if(this.lease.owner===id){try{const c=this.flight&&await this.flight;await c?.call('end_session',{session:this.session(id)},AbortSignal.timeout(3000));}catch{await this.dropClient();}finally{this.lease.blocked=false;this.lease.release(id);}}}
 async close(){this.closed=true;this.abort?.abort();await this.active;await this.dropClient();this.observations.clear();this.unknown.clear();this.lease.inFlight=false;this.lease.blocked=false;if(this.lease.owner)this.lease.release(this.lease.owner);}
}
