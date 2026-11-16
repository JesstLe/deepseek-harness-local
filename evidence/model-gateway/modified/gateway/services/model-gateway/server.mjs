import http from 'node:http';import {once} from 'node:events';import {z} from 'zod';import {verify} from 'node:crypto';
import {canonical,verifyGrant,routeSchema,policySchema,fault} from './contract.mjs';import {ModelLedger} from './ledger.mjs';
const requestSchema=z.object({model:z.string().min(1).max(80),messages:z.array(z.object({role:z.enum(['system','developer','user','assistant','tool']),content:z.unknown().optional(),tool_calls:z.array(z.unknown()).optional(),tool_call_id:z.string().optional(),name:z.string().optional(),reasoning_content:z.string().optional()}).strict()).min(1).max(10000),stream:z.boolean().default(true),max_tokens:z.number().int().positive().optional(),max_completion_tokens:z.number().int().positive().optional(),temperature:z.number().min(0).max(2).optional(),top_p:z.number().min(0).max(1).optional(),tools:z.array(z.unknown()).max(200).optional(),tool_choice:z.unknown().optional(),parallel_tool_calls:z.boolean().optional(),response_format:z.unknown().optional(),reasoning_effort:z.string().max(30).optional(),stop:z.union([z.string(),z.array(z.string())]).optional(),seed:z.number().int().optional(),frequency_penalty:z.number().min(-2).max(2).optional(),presence_penalty:z.number().min(-2).max(2).optional(),stream_options:z.object({include_usage:z.boolean()}).strict().optional(),store:z.literal(false).optional()}).strict();
async function jsonBody(req,max=8*1024*1024){const chunks=[];let n=0;for await(const b of req){n+=b.length;if(n>max)throw fault('MODEL_BODY_TOO_LARGE',413);chunks.push(b);}try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fault('MODEL_BODY_INVALID');}}
const usage=v=>{const u=v?.usage;if(!u||!Number.isSafeInteger(u.prompt_tokens)||!Number.isSafeInteger(u.completion_tokens)||u.prompt_tokens<0||u.completion_tokens<0)return null;return {inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens};};
export async function startModelGateway({file,issuer,gateway,keys,routes=[],environment=process.env,host='127.0.0.1',port=0,clock=()=>Date.now(),request=fetch,allowLoopbackUpstreams=false,ledger:provided}={}){
 const catalog=new Map(routes.map(v=>{const r=routeSchema.parse(v),u=new URL(r.url);if(u.username||u.password||u.hash||u.search||u.protocol!=='https:'&&!(allowLoopbackUpstreams&&u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw fault('MODEL_UPSTREAM_INVALID');return [r.id,r];}));if(catalog.size!==routes.length)throw fault('MODEL_DUPLICATE_ROUTE');
 const ledger=provided??new ModelLedger(file,{clock}),controllers=new Map();let closing=false;
 const auth=req=>{const token=req.headers.authorization?.replace(/^Bearer /,'');const c=verifyGrant(token,{issuer,gateway,keys,now:clock()});ledger.authenticate(c);return c;};
 const send=(res,status,v)=>{if(!res.destroyed&&!res.headersSent)res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(v));};
 const pending=new Set();const handle=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');let claims,id,controller,started=false;
  try{
   if(req.headers.origin)throw fault('MODEL_BROWSER_DIRECT_DENIED',403);
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'&&url.pathname==='/health'){send(res,200,{product:'naumi-model-gateway',version:1,ready:!closing,routes:catalog.size});return;}
   if(closing)throw fault('MODEL_GATEWAY_STOPPING',503);
   if(req.method==='POST'&&url.pathname==='/admin'){
    const {proof}=z.object({proof:z.string().max(15000)}).strict().parse(await jsonBody(req,32768)),[kid,payload,signature,...extra]=proof.split('.');let p;
    try{if(extra.length||!keys[kid]||!verify(null,Buffer.from(payload),keys[kid],Buffer.from(signature,'base64url')))throw Error();p=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{throw fault('MODEL_ADMIN_SIGNATURE_INVALID',401);}
    z.object({v:z.literal(1),issuedAt:z.string().datetime(),expiresAt:z.string().datetime(),memberId:z.string().uuid()}).passthrough().parse(p);if(Date.parse(p.expiresAt)<=Date.parse(p.issuedAt))throw fault('MODEL_ADMIN_INVALID',401);
    if(p.aud!=='naumi-model-admin'||p.iss!==issuer||p.gateway!==gateway||!z.string().uuid().safeParse(p.tenantId).success||!z.string().uuid().safeParse(p.jti).success||Date.parse(p.expiresAt)<=clock()||clock()<Date.parse(p.issuedAt)-60000||Date.parse(p.expiresAt)-Date.parse(p.issuedAt)>300000)throw fault('MODEL_ADMIN_INVALID',401);
    if(p.action==='apply-policy')p.policy=policySchema.parse(p.policy);else if(p.action==='charge-ceiling'){z.string().uuid().parse(p.requestId);if(p.confirmedStopped!==true||typeof p.reason!=='string'||p.reason.trim().length<6||p.reason.length>1000)throw fault('MODEL_STOP_CONFIRMATION_REQUIRED',403);}else throw fault('MODEL_ADMIN_ACTION_INVALID',403);
    const result=ledger.admin(p);if(p.action==='apply-policy')for(const v of controllers.values())if(v.claims.tenantId===p.tenantId&&v.claims.policy.revision<p.policy.revision)v.controller.abort(Error('MODEL_POLICY_CHANGED'));send(res,200,result);return;
   }
   claims=auth(req);
   if(req.method==='GET'&&url.pathname==='/v1/models'){send(res,200,{object:'list',data:[...catalog.values()].filter(r=>claims.policy.routes.includes(r.id)).map(r=>({id:r.id,object:'model',name:r.name,contextTokens:r.contextTokens,maxOutputTokens:r.maxOutputTokens,vision:r.vision,inputMicrosPerMillion:r.inputMicrosPerMillion,outputMicrosPerMillion:r.outputMicrosPerMillion}))});return;}
   if(req.method==='GET'&&url.pathname==='/budget'){send(res,200,ledger.summary(claims));return;}
   if(req.method==='GET'&&url.pathname==='/receipt'){id=z.string().uuid().parse(url.searchParams.get('id'));send(res,200,ledger.receipt(claims,id));return;}
   if(req.method!=='POST'||url.pathname!=='/v1/chat/completions')throw fault('MODEL_ENDPOINT_NOT_FOUND',404);
   id=z.string().uuid().parse(req.headers['x-naumi-request-id']);const body=requestSchema.parse(await jsonBody(req)),primary=catalog.get(body.model);
   if(!primary||!claims.policy.routes.includes(primary.id))throw fault('MODEL_ROUTE_NOT_AUTHORIZED',403);
   const cap=body.max_completion_tokens??body.max_tokens??primary.maxOutputTokens;if(cap>primary.maxOutputTokens)throw fault('MODEL_OUTPUT_LIMIT');
   const plan=[primary];if(claims.policy.allowFallback)for(const name of primary.fallbacks){const r=catalog.get(name);if(r&&claims.policy.routes.includes(name)&&r.inputMicrosPerMillion<=primary.inputMicrosPerMillion&&r.outputMicrosPerMillion<=primary.outputMicrosPerMillion&&r.contextTokens>=primary.contextTokens&&r.maxOutputTokens>=cap&&r.vision===primary.vision)plan.push(r);}
   plan.splice(claims.policy.maxAttempts);
   if(!primary.vision&&body.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c?.type!=='text')))throw fault('MODEL_IMAGE_NOT_SUPPORTED');
   if(!body.messages.some(m=>Array.isArray(m.content)&&m.content.some(c=>c?.type==='image_url'))&&Buffer.byteLength(canonical({messages:body.messages,tools:body.tools}))+body.messages.length*32>primary.contextTokens)throw fault('MODEL_CONTEXT_LIMIT');
   body.max_tokens=cap;delete body.max_completion_tokens;body.store=false;if(body.stream)body.stream_options={include_usage:true};
   ledger.reserve(claims,id,body,plan);started=true;controller=new AbortController();controllers.set(id,{controller,claims});
   const closed=()=>{if(!res.writableEnded)controller.abort(Error('MODEL_CLIENT_DISCONNECTED'));};res.on('close',closed);
   const timeout=setTimeout(()=>controller.abort(Error('MODEL_UPSTREAM_TIMEOUT')),300000);timeout.unref?.();
   let response,route;
   try{
    for(let i=0;i<plan.length;i++){
     route=plan[i];const secret=environment[route.keyEnv];if(typeof secret!=='string'||!secret.trim())throw fault('MODEL_UPSTREAM_KEY_MISSING',503);
     ledger.attempt(claims,id,route.id);
     try{response=await request(route.url,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+secret.trim()},body:JSON.stringify({...body,model:route.model}),signal:controller.signal});}
     catch(e){if(!controller.signal.aborted&&e?.cause?.code==='ECONNREFUSED'&&i+1<plan.length)continue;throw fault('MODEL_UPSTREAM_RESULT_UNKNOWN',502);}
     if([400,401,403,404,422,429].includes(response.status)){
      await response.body?.cancel();if([401,404,429].includes(response.status)&&i+1<plan.length)continue;
      ledger.settle(claims,id,{route,state:'rejected',error:'MODEL_UPSTREAM_REJECTED'});throw fault('MODEL_UPSTREAM_REJECTED',response.status===429?429:502);
     }
     if(!response.ok){await response.body?.cancel();throw fault('MODEL_UPSTREAM_RESULT_UNKNOWN',502);}break;
    }
    if(!response?.ok)throw fault('MODEL_UPSTREAM_RESULT_UNKNOWN',502);
    let measured=null,complete=false;
    if(!body.stream){const raw=await response.text();if(raw.length>32*1024*1024)throw fault('MODEL_RESPONSE_TOO_LARGE',502);let v;try{v=JSON.parse(raw);}catch{throw fault('MODEL_RESPONSE_INVALID',502);}if(v.error)throw fault('MODEL_UPSTREAM_RESULT_UNKNOWN',502);measured=usage(v);if(!measured)throw fault('MODEL_USAGE_MISSING',502);if(measured.inputTokens>route.contextTokens||measured.outputTokens>cap)throw fault('MODEL_USAGE_OVER_CEILING',502);ledger.settle(claims,id,{...measured,route});send(res,200,v);complete=true;}
    else{
     if(!response.headers.get('content-type')?.includes('text/event-stream'))throw fault('MODEL_RESPONSE_INVALID',502);
     res.writeHead(200,{'Content-Type':'text/event-stream','X-Naumi-Request-Id':id});let pending='',total=0;const decoder=new TextDecoder();
     for await(const chunk of response.body){
      total+=chunk.length;if(total>32*1024*1024)throw fault('MODEL_RESPONSE_TOO_LARGE',502);pending+=decoder.decode(chunk,{stream:true});if(pending.length>2*1024*1024)throw fault('MODEL_SSE_FRAME_TOO_LARGE',502);
      const lines=pending.split('\n');pending=lines.pop();for(const line of lines){const text=line.trim();if(!text.startsWith('data:'))continue;const payload=text.slice(5).trim();if(payload==='[DONE]'){complete=true;continue;}let v;try{v=JSON.parse(payload);}catch{throw fault('MODEL_RESPONSE_INVALID',502);}if(v.error)throw fault('MODEL_UPSTREAM_RESULT_UNKNOWN',502);measured=usage(v)??measured;}
      if(!res.write(chunk))await once(res,'drain',{signal:controller.signal});
     }
     if(!complete||!measured)throw fault('MODEL_USAGE_MISSING',502);if(measured.inputTokens>route.contextTokens||measured.outputTokens>cap)throw fault('MODEL_USAGE_OVER_CEILING',502);
     ledger.settle(claims,id,{...measured,route});res.end();
    }
   }finally{clearTimeout(timeout);res.off('close',closed);controllers.delete(id);}
  }catch(e){
   const code=e instanceof z.ZodError?'MODEL_INVALID_REQUEST':/^MODEL_[A-Z_]+$/.test(e.message)?e.message:'MODEL_GATEWAY_FAILURE';
   if(started)try{ledger.unknown(claims,id,code);}catch{}
   if(res.headersSent){if(!res.destroyed)res.end('data: '+JSON.stringify({error:{code,message:code}})+'\n\n');}else send(res,e.status??(e instanceof z.ZodError?400:503),{error:{code,message:code},requestId:id??null});
   controller?.abort(Error(code));
  }
 };
 const server=http.createServer((req,res)=>{const work=handle(req,res).catch(()=>res.destroy());pending.add(work);void work.finally(()=>pending.delete(work));});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,resolve);});
 return {server,ledger,address:server.address(),async close(){closing=true;for(const {controller} of controllers.values())controller.abort(Error('MODEL_GATEWAY_STOPPING'));server.closeAllConnections();await new Promise(r=>server.close(r));await Promise.allSettled([...pending]);if(!provided)ledger.close();}};
}
