import {defineTool} from '@deepseek-ai/dsh-tools';
import {BusinessRuntime,BusinessTransport} from './business-runtime.js';
import contract from './business-contract.cjs';
const output={schema:{type:'json'},render:(_args,v)=>[{type:'text',text:JSON.stringify(v)}]},string={type:'string'},required={type:'string',required:true};
export function createBusinessTools(runtime,caller){
 const tool=(name,description,parameters,run,write=false)=>defineTool({name,description,parameters,output,execute:(args,exec)=>{exec.signal?.throwIfAborted();const root=caller(exec.agent,typeof write==='function'?write(args):write);return run(root.id,args,exec,root);}});
 return [
  tool('naumi_systems','Check actual native enterprise identity/readiness, role-eligible command schemas, and the existing Creation MCP connection. A logged-in page or registered schema is not proof of a usable tool. No browser/SQL or new login credentials needed.',{},(id,_a,e)=>runtime.status(id,{agent:e.agent,signal:e.signal})),
  tool('naumi_business_read','Read authoritative, permission-filtered projects, requirements, tasks, deliverables, submissions, assets or people. Supports exact IDs, project/request/task relation filters, text search and pagination. Retain returned revisions and actor IDs. An empty list is real empty data, never fabricate examples.',{collection:{type:'string',enum:contract.collections,required:true},id:string,query:string,projectId:string,requestId:string,taskId:string,offset:{type:'integer'},limit:{type:'integer'}},(id,a,e)=>runtime.read(id,a,e.signal)),
  tool('naumi_business_context','Read/select/clear this root Session\'s explicit project/request/task context. Read first to obtain version; select requires visible exact IDs and expectedVersion. No cross-Session context access; read is not business mutation. On account change explicitly clear before selecting a new context.',{action:{type:'string',enum:['read','select','clear'],required:true},expectedVersion:{type:'integer'},selection:{type:'object',additionalProperties:false,properties:{projectId:string,requestId:string,taskId:string}}},(id,a,e)=>runtime.context(id,a,e.signal),a=>a.action!=='read'),
  tool('naumi_business_command','Execute an original enterprise domain command as the current signed-in human account, subject to original server roles/state/revisions and native tool approvals. Use naumi_systems for required fields and naumi_business_read for current revisions. inputJson is only the domain input object, no URLs, auth, SQL or _idempotencyKey; operationId is a stable UUID. UNKNOWN: query naumi_business_operation, never generate a new UUID. deliverable.submit starts review, not acceptance; no reviewer/accept/permission commands exposed.',{command:{type:'string',enum:Object.keys(contract.commands),required:true},inputJson:required,operationId:required,contextVersion:{type:'integer'}},(id,a,e)=>{let input;try{input=JSON.parse(a.inputJson);}catch{throw Error('BUSINESS_INPUT_JSON_INVALID');}return runtime.command(id,{...a,input},e.signal);},true),
  tool('naumi_business_operation','Read a durable operation outcome or explicitly recover an UNKNOWN command using the exact stored actor/session/UUID/payload and the server idempotency receipt. Upload UNKNOWN is manual reconciliation, never repeat upload. Rejected operations are not auto-retried.',{action:{type:'string',enum:['read','recover'],required:true},operationId:required},(id,a,e)=>runtime.operation(id,a,e.signal),a=>a.action==='recover'),
  tool('naumi_business_upload','Upload an actual file inside this Agent working directory to an assigned enterprise task or editable product. Keeps the source system asset ID/hash receipt for deliverable.submit. No arbitrary outside-workspace reads. Stable operationId UUID; a lost upload response remains UNKNOWN, do not retry upload under any ID automatically.',{path:required,operationId:required,taskId:string,productId:string,purpose:{type:'string',enum:['reference','white-image']},contextVersion:{type:'integer'}},(id,a,e)=>runtime.upload(id,a,e.agent,e.signal),true),
 ];
}
export function installBusiness(ctx,{origin,home=process.env.DSH_HOME,creation,onReady}={}){
 return ctx.inject(['agents','agentTeams','tools','systemPrompt','workingDirectory','webServer','connection'],scope=>{
  const runtime=new BusinessRuntime({transport:new BusinessTransport({origin,home}),creation,workingDirectory:(agent,signal)=>scope.workingDirectory.ensure(agent,signal??new AbortController().signal)});onReady?.(runtime);
  const caller=(agent,write=false)=>{if(!agent)throw Error('BUSINESS_CALLER_REQUIRED');const member=scope.agentTeams.tryMembership(agent);if(!member)throw Error('BUSINESS_CALLER_NOT_LOADED');if(write&&member.role!=='lead')throw Error('BUSINESS_LEAD_REQUIRED');return member.root;};
  const installed=new Map();const install=agent=>{
   if(installed.has(agent)||!scope.agentTeams.tryMembership(agent))return;const disposers=[];
   try{
    for(const tool of createBusinessTools(runtime,caller))disposers.push(agent.ctx.tools.register(tool));
    disposers.push(agent.ctx.systemPrompt.section({name:'naumi:native-systems',order:76,text:'Native Naumi business connections are automatically available in your tool runtime; no visual entry or manually selected UI context is required. For projects/requirements/design/delivery work, first call naumi_systems to discover actual readiness and command schemas, then use naumi_business_read to resolve the user request to visible real IDs. Read and select the Session context yourself with naumi_business_context, retaining revisions. If multiple objects match, ask the user to disambiguate in chat; never guess IDs or ask them to find a connection/context panel. Use these native tools, not browser scraping or SQL. Existing mcp__naumi_creation__ tools own design creation/provider work; link their verified downloaded files through naumi_business_upload then deliverable.submit. Pass exact business IDs in delegated task instructions; a new task does not silently inherit another Session context. Native approvals and managed employee execution gates still apply. Never call a different tool/Session to evade a denied operation. Stable UUID receipts distinguish submitted/review/accepted; task completion is not enterprise acceptance.'}));
    installed.set(agent,()=>{for(const dispose of disposers.reverse())dispose();});
   }catch(error){for(const dispose of disposers.reverse())dispose();throw error;}
  };
  scope.on('agent/created',({agent})=>install(agent));scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);});for(const agent of scope.agents.list())install(agent);
  scope.on('agent/pre-step',async({agent},next)=>{install(agent);return next();});
  scope.effect(()=>()=>{for(const dispose of installed.values())dispose();installed.clear();});
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/systems',handler:async(req,res)=>{
   res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','private, no-store');const send=(code,data)=>{if(!res.destroyed){res.writeHead(code);res.end(JSON.stringify(data));}};
   const admission=scope.connection.admit(req);if('rejection'in admission){send(admission.rejection,{error:'BUSINESS_OWNER_REQUIRED'});return;}if(admission.peer.principal.kind!=='owner'){send(403,{error:'BUSINESS_OWNER_REQUIRED'});return;}
   const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort();};res.once('close',closed);
   try{
    if(req.method==='GET'){
     const sessionId=new URL(req.url,'http://local').searchParams.get('sessionId')||'systems-status';contract.sessionId(sessionId);
     const agent=scope.agents.list().find(a=>a.id===sessionId),status=await runtime.status(sessionId,{agent,signal:controller.signal});
     if(new URL(req.url,'http://local').searchParams.get('context')==='1'){
      const workspace=await runtime.workspace(sessionId,controller.signal),context=await runtime.context(sessionId,{action:'read'},controller.signal);send(200,{...status,workspace,context});
     }else send(200,status);return;
    }
    if(req.method!=='POST'){send(405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(req.headers['x-naumi-business']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin))throw Error('BUSINESS_SAME_ORIGIN_REQUIRED');
    let raw='',bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)throw Error('BUSINESS_BODY_TOO_LARGE');raw+=chunk.toString();}
    const input=JSON.parse(raw);contract.only(input,['sessionId','action','selection','expectedVersion']);contract.sessionId(input.sessionId);
    if(!['select','clear'].includes(input.action))throw Error('BUSINESS_CONTEXT_ACTION_INVALID');send(200,await runtime.context(input.sessionId,input,controller.signal));
   }catch(error){send(/LOGIN_REQUIRED/.test(error.message)?401:409,{error:/^BUSINESS_[A-Z_]+$/.test(error.message)?error.message:'BUSINESS_SYSTEM_UNAVAILABLE'});}finally{res.off('close',closed);}
  }}));
 });
}
