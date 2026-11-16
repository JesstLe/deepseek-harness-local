import http from 'node:http';import path from 'node:path';import {randomUUID} from 'node:crypto';
import {managedRuntimeHost} from './managed-runtime-host.mjs';import {startModelGateway} from '../../services/model-gateway/server.mjs';import {EmployeeModels,EmployeeGatewayAdapter,MODEL_PROVIDER,installEmployeeModels} from '../../plugins/naumi-enterprise/employee-models.js';
export const generous={costMicros:10000000,tokens:1000000,requests:100,concurrent:4};
export const policy=(patch={})=>({revision:1,active:true,routes:['chat','backup'],organization:{...generous},employee:{...generous},task:{...generous},maxAttempts:2,credentialSeconds:3600,enforceManaged:true,allowFallback:true,...patch});
export async function modelGatewayHost({http:withHttp=false}={}){
 const f=await managedRuntimeHost();let requests=0,mints=0,mode='normal',controllerMode='normal',lastBody=null;const upstream=http.createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);lastBody=JSON.parse(Buffer.concat(chunks));requests++;
  if(req.headers.authorization!=='Bearer fixture-upstream-only'){res.writeHead(401).end();return;}
  if(mode==='reject-primary'&&lastBody.model==='wire-primary'){res.writeHead(429).end();return;}
  if(mode==='500'){res.writeHead(500).end('private upstream diagnostic');return;}
  if(mode==='hang')return;
  if(!lastBody.stream){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({id:'completion-'+requests,object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'网关实际响应'},finish_reason:'stop'}],usage:{prompt_tokens:12,completion_tokens:3,total_tokens:15}}));return;}
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  res.write('data: '+JSON.stringify({id:'completion-'+requests,object:'chat.completion.chunk',created:1,model:lastBody.model,choices:[{index:0,delta:{role:'assistant',content:'网关实际响应'},finish_reason:null}]})+'\n\n');
  if(mode==='truncated'){res.end();return;}
  res.write('data: '+JSON.stringify({id:'completion-'+requests,object:'chat.completion.chunk',created:1,model:lastBody.model,choices:[{index:0,delta:{},finish_reason:'stop'}]})+'\n\n');
  res.write('data: '+JSON.stringify({id:'completion-'+requests,object:'chat.completion.chunk',created:1,model:lastBody.model,choices:[],usage:{prompt_tokens:12,completion_tokens:3,total_tokens:15}})+'\n\n');res.end('data: [DONE]\n\n');
 });await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
 const reserve=http.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));const gateway='http://127.0.0.1:'+port;
 const route={id:'chat',name:'企业标准模型',url:'http://127.0.0.1:'+upstream.address().port+'/v1/chat/completions',model:'wire-primary',keyEnv:'TEST_UPSTREAM_KEY',contextTokens:8192,maxOutputTokens:128,inputMicrosPerMillion:1000000,outputMicrosPerMillion:2000000,vision:false,fallbacks:['backup']};
 const app=await startModelGateway({file:path.join(f.dir,'model-ledger.sqlite'),issuer:f.origin,gateway,keys:{'fixture-key':f.sync.registration().serverPublicKey},routes:[route,{...route,id:'backup',name:'已批准备用',model:'wire-backup',inputMicrosPerMillion:500000,outputMicrosPerMillion:1000000,fallbacks:[]}],environment:{TEST_UPSTREAM_KEY:'fixture-upstream-only'},port,allowLoopbackUpstreams:true,clock:()=>f.now});let currentPolicy=policy();
 function grant(taskId=null,overrides={}){return f.signPacket({aud:'naumi-model-gateway',gateway,jti:randomUUID(),tenantId:f.claims.tenantId,memberId:f.claims.memberId,deviceId:f.claims.deviceId,employeeId:f.employeeId,botId:f.bot.id,taskId,authEpoch:f.claims.authEpoch,period:new Date(f.now).toISOString().slice(0,7),issuedAt:new Date(f.now).toISOString(),expiresAt:new Date(Math.min(f.now+3600000,Date.UTC(new Date(f.now).getUTCFullYear(),new Date(f.now).getUTCMonth()+1,1))).toISOString(),policy:currentPolicy,...overrides});}
 f.deviceActions.set('model.authorize',async body=>{mints++;if(controllerMode==='reject'){const e=Error('MODEL_POLICY_DISABLED');e.status=403;throw e;}return {model:{gateway,token:grant(body.taskId),expiresAt:new Date(f.now+3600000).toISOString(),policy:currentPolicy}};});
 let client,adapter,registration,modelsHost,modelsRuntime;
 if(withHttp){modelsHost=f.ctx.plugin({name:'model-http-fixture',inject:['llm','connection','webServer'],apply(scope){modelsRuntime=installEmployeeModels(scope,f.directory,{sync:f.sync});}});await modelsHost;client=modelsRuntime.client;}
 else{client=new EmployeeModels({ctx:f.ctx,sync:f.sync,directory:f.directory});f.sync.models=client;adapter=new EmployeeGatewayAdapter({ctx:f.ctx,client,directory:f.directory});registration=f.ctx.llm.registerAdapter([MODEL_PROVIDER],adapter);}
 const request=(body,token=grant(),id=randomUUID())=>fetch(gateway+'/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Naumi-Request-Id':id},body:JSON.stringify({model:'chat',messages:[{role:'user',content:'网关验证'}],max_tokens:16,stream:false,...body})});
 return {...f,app,client,gateway,grant,request,route,adapter,get requests(){return requests;},get mints(){return mints;},get lastBody(){return lastBody;},get policy(){return currentPolicy;},setPolicy:p=>currentPolicy=p,setMode:v=>mode=v,setControllerMode:v=>controllerMode=v,
  admin(body){return f.signPacket({aud:'naumi-model-admin',gateway,tenantId:f.claims.tenantId,memberId:f.claims.memberId,jti:randomUUID(),issuedAt:new Date(f.now).toISOString(),expiresAt:new Date(f.now+300000).toISOString(),...body});},
  async cleanup(){if(modelsRuntime){await modelsRuntime.close();await modelsHost.dispose();}else{await client.close();registration();}await app.close();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));await f.cleanup();},
 };
}
