'use strict';
const http=require('node:http');
const {randomBytes,randomUUID,timingSafeEqual}=require('node:crypto');
const {browserURL}=require('./policy.cjs');
const tokenEqual=(a,b)=>{const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);};
class ExternalBrowserHub{
 constructor({hostURL,timeout=20000,now=Date.now}){Object.assign(this,{hostURL,timeout,now});this.pairs=new Map();this.tabs=new Map();this.pending=new Map();this.sequence=0;this.server=null;this.closed=false;}
 async start(){this.server=http.createServer((req,res)=>void this.handle(req,res));this.server.headersTimeout=10000;this.server.requestTimeout=30000;await new Promise((r,j)=>{this.server.once('error',j);this.server.listen(0,'127.0.0.1',r);});return this;}
 pair(sessionId){
  if(typeof sessionId!=='string'||!sessionId||sessionId.length>200)throw Error('BROWSER_SESSION_REQUIRED');
  // Only one extension lease per session. Re-pairing explicitly revokes old tabs.
  this.disconnect(sessionId);const token=randomBytes(32).toString('hex');
  this.pairs.set(token,{sessionId,origin:null,expires:this.now()+5*60*1000,seen:0,waiter:null});
  return `naumi-browser://connect?port=${this.server.address().port}&token=${token}`;
 }
 entries(sessionId){return [...this.tabs.values()].filter(x=>x.sessionId===sessionId).map(({id,label,title,url,pair})=>({tabId:id,label,title,url,connected:this.now()-pair.seen<35000,engine:'external-chromium',presentation:'existing-tab'}));}
 selected(sessionId){return [...this.tabs.values()].filter(x=>x.sessionId===sessionId).sort((a,b)=>b.selected-a.selected)[0];}
 disconnect(sessionId){
  for(const [token,pair]of this.pairs)if(pair.sessionId===sessionId){pair.waiter?.();this.pairs.delete(token);}
  for(const [id,tab]of this.tabs)if(tab.sessionId===sessionId){this.tabs.delete(id);this.rejectTab(id,'EXTERNAL_BROWSER_DISCONNECTED_NO_REPLAY');}
  return {disconnected:true,userTabsClosed:false,cookiesCleared:false};
 }
 rejectTab(id,error){for(const [key,job]of this.pending)if(job.tabId===id){clearTimeout(job.timer);this.pending.delete(key);job.reject(Error(error));}}
 async perform(sessionId,input){
  const tab=input.action==='select'?[...this.tabs.values()].find(x=>x.sessionId===sessionId&&x.label===input.label):this.selected(sessionId);
  if(!tab||this.now()-tab.pair.seen>=35000)throw Error('EXTERNAL_BROWSER_DISCONNECTED_NO_REPLAY');
  if(input.action==='navigate')input={...input,url:browserURL(input.url,this.hostURL)};
  const id=randomUUID();return new Promise((resolve,reject)=>{
   const job={id,tabId:tab.id,pair:tab.pair,input,resolve:data=>{if(input.action==='select')tab.selected=this.now();resolve(data);},reject,dispatched:false};
   job.timer=setTimeout(()=>{this.pending.delete(id);tab.pair.seen=0;reject(Error('EXTERNAL_BROWSER_TIMEOUT_NO_REPLAY'));},this.timeout);
   this.pending.set(id,job);tab.pair.waiter?.();
  });
 }
 async handle(req,res){
  const send=(code,body)=>{if(!res.destroyed&&!res.writableEnded){res.writeHead(code);res.end(JSON.stringify(body));}};
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const origin=req.headers.origin;if(typeof origin!=='string'||!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)||!/^127\.0\.0\.1:\d+$/.test(req.headers.host||'')){send(403,{error:'EXTERNAL_BROWSER_AUTH_REQUIRED'});return;}
  const header=req.headers.authorization;const entry=[...this.pairs.entries()].find(([key])=>tokenEqual(header,'Bearer '+key));const pair=entry?.[1];
  // Preflight reveals no state and only extension origins can ask for the narrow protocol.
  if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Authorization,Content-Type');send(204,{});return;}
  if(!pair||(!pair.origin&&pair.expires<this.now())||(pair.origin&&pair.origin!==origin)){send(403,{error:'EXTERNAL_BROWSER_PAIRING_REQUIRED'});return;}
  res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
  if(req.method!=='POST'){send(405,{error:'METHOD_NOT_ALLOWED'});return;}
  let body;try{let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>1024*1024)throw Error();raw+=chunk.toString();}body=JSON.parse(raw);}catch{send(400,{error:'EXTERNAL_BROWSER_BODY_INVALID'});return;}
  if(!pair.origin&&req.url!=='/attach'){send(403,{error:'EXTERNAL_BROWSER_PAIRING_REQUIRED'});return;}
  pair.seen=this.now();
  try{
   if(req.url==='/attach'){
    if(!Number.isInteger(body.tabId)||body.tabId<0||typeof body.title!=='string'||typeof body.instanceId!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(body.instanceId))throw Error('EXTERNAL_BROWSER_TAB_INVALID');
    if(pair.instanceId&&pair.instanceId!==body.instanceId)throw Error('EXTERNAL_BROWSER_INSTANCE_MISMATCH');
    const url=browserURL(body.url,this.hostURL),id=origin+':'+body.instanceId+':'+body.tabId;
    if(this.tabs.has(id)&&this.tabs.get(id).pair!==pair)throw Error('EXTERNAL_BROWSER_TAB_ALREADY_BOUND');
    if(!this.tabs.has(id)&&this.tabs.size>=32)throw Error('EXTERNAL_BROWSER_TAB_LIMIT');
    pair.origin=origin;pair.instanceId=body.instanceId;this.tabs.set(id,{id,pair,tabId:body.tabId,sessionId:pair.sessionId,label:'pe'+(++this.sequence),title:body.title.slice(0,200),url,selected:this.now()});
    this.onAttach?.(pair.sessionId);send(200,{ok:true,sessionId:pair.sessionId});return;
   }
   if(req.url==='/detach'){
    const id=origin+':'+pair.instanceId+':'+body.tabId,tab=this.tabs.get(id);if(tab?.pair===pair){this.tabs.delete(id);this.rejectTab(id,'EXTERNAL_BROWSER_TAB_CLOSED_NO_REPLAY');}send(200,{ok:true});return;
   }
   if(req.url==='/permit'){
    const job=this.pending.get(body.id);if(!job||job.pair!==pair||!job.dispatched||job.permitted){send(409,{error:'EXTERNAL_BROWSER_OPERATION_REVOKED'});return;}job.permitted=true;send(200,{ok:true});return;
   }
   if(req.url==='/result'){
    const job=this.pending.get(body.id);if(!job||job.pair!==pair||!job.dispatched){send(409,{error:'EXTERNAL_BROWSER_RESULT_STALE'});return;}
    clearTimeout(job.timer);this.pending.delete(body.id);
    const tab=this.tabs.get(job.tabId);
    if(body.ok&&body.data&&tab){
     if(typeof body.data.url==='string'){try{tab.url=browserURL(body.data.url,this.hostURL);}catch{job.reject(Error('EXTERNAL_BROWSER_TARGET_INVALID'));send(200,{ok:true});return;}}
     if(typeof body.data.title==='string')tab.title=body.data.title.slice(0,200);
     // Never echo extension errors or credential-fill results with arbitrary data to a model.
     job.resolve(job.input.action==='login'?{filled:true,submitted:false,engine:'external-chromium'}:{...body.data,label:tab.label,tabId:tab.id,engine:'external-chromium',presentation:'existing-tab'});
    }else job.reject(Error('EXTERNAL_BROWSER_OPERATION_FAILED_NO_REPLAY'));
    send(200,{ok:true});return;
   }
   if(req.url==='/poll'){
    if(pair.waiter){send(409,{error:'EXTERNAL_BROWSER_POLL_ALREADY_RUNNING'});return;}
    let timer;const flush=()=>{clearTimeout(timer);pair.waiter=null;if(!this.pairs.has(entry[0])){send(403,{error:'EXTERNAL_BROWSER_REVOKED'});return;}
     const jobs=[...this.pending.values()].filter(x=>x.pair===pair&&!x.dispatched);for(const job of jobs)job.dispatched=true;
     send(200,{ok:true,tabs:[...this.tabs.values()].filter(x=>x.pair===pair).map(x=>x.tabId),jobs:jobs.map(x=>({id:x.id,tabId:this.tabs.get(x.tabId)?.tabId,input:x.input}))});
    };
    pair.waiter=flush;if([...this.pending.values()].some(x=>x.pair===pair&&!x.dispatched))flush();else timer=setTimeout(flush,15000);
    res.once('close',()=>{clearTimeout(timer);if(pair.waiter===flush)pair.waiter=null;});return;
   }
   send(404,{error:'NOT_FOUND'});
  }catch(error){send(400,{error:/^EXTERNAL_BROWSER_[A-Z_]+$/.test(error.message)?error.message:'EXTERNAL_BROWSER_REQUEST_INVALID'});}
 }
 async close(){this.closed=true;for(const pair of [...this.pairs.values()])this.disconnect(pair.sessionId);if(this.server){this.server.closeAllConnections();await new Promise(r=>this.server.close(r));}}
}
module.exports={ExternalBrowserHub};
