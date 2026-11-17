import path from 'node:path';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {z} from 'zod';
import {EmployeeActivityStore,activityCommands} from './employee-activity-store.js';
import {EmployeeObservation} from './employee-observation.js';
import {EmployeeCapabilities} from './employee-capabilities.js';
import {installProactiveAi,aiCommands} from './employee-proactive-ai.js';

export function installEmployeeActivity(scope,directory,store,service,{sync,intervalMs=30000,capabilities:provided,proactiveOptions={}}={}){
  const activity=new EmployeeActivityStore(store),observation=new EmployeeObservation({store,directory,agents:scope.agents});
  const capabilities=provided??new EmployeeCapabilities({ctx:scope,sync,home:path.dirname(path.dirname(directory.file))});
  const proactive=installProactiveAi(scope,directory,store,activity,sync,proactiveOptions),commandSchema=z.discriminatedUnion('action',[...activityCommands.options,...aiCommands.options]);
  let closed=false,timer,lastCheck=0,value={sampledAt:null,error:null,clockRollback:false,actions:0};const installed=new Map();
  const observe=(agent,state)=>{if(closed)return;try{observation.record(agent,state);}catch{scope.logger.warn('ACT_OBSERVATION_FAILED');}};
  const install=agent=>{
    if(closed||installed.has(agent)||!scope.agentTeams.tryMembership(agent))return;
    const disposers=[];
    try{
      disposers.push(agent.ctx.tools.register(defineTool({name:'employee_activity_report',description:'Report your own Bot root work state: working, waiting_user, waiting_dependency, model_unavailable or blocked. This is attributed self-report, not verified progress or permission. No dispatch, retries or approval. Actual saved artifact/review events independently establish progress.',parameters:{state:{type:'string',enum:['working','waiting_user','waiting_dependency','model_unavailable','blocked'],required:true},note:{type:'string',required:true},operationId:{type:'string',required:true}},output:{schema:{type:'json'},render:(_args,data)=>[{type:'text',text:JSON.stringify(data)}]},execute:(args,exec)=>{exec.signal?.throwIfAborted();const {root}=service.caller(exec.agent,true);if(root.id!==exec.agent.id)throw Error('ACT_ROOT_REQUIRED');return observation.report(root,args);}})));
      disposers.push(agent.ctx.tools.register(defineTool({name:'employee_capabilities',description:'Read the latest measured capability inventory for your Bot. installed, connected, authorized and healthy are independent; null/stale is UNKNOWN, never permission. Registration alone is not health. reasonCode identifies missing bundle/connection/device authorization. Do not develop or install replacement integrations from shell when a packaged capability is not ready.',parameters:{},output:{schema:{type:'json'},render:(_args,data)=>[{type:'text',text:JSON.stringify(data)}]},execute:(_args,exec)=>{exec.signal?.throwIfAborted();return capabilities.read(service.caller(exec.agent).bot.id);}})));
      installed.set(agent,()=>{for(const d of disposers.reverse())d();});observe(agent,agent.status);
    }catch(e){for(const d of disposers.reverse())d();throw e;}
  };
  scope.on('agent/created',({agent})=>install(agent));scope.on('agent/status',({agent,status})=>observe(agent,status));
  scope.on('agent/error',({agent})=>observe(agent,'fault'));
  scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);observe(agent,'disposed');});
  for(const agent of scope.agents.list())install(agent);
  const tick=()=>{
    if(closed)return;
    try{const result=activity.tick(directory.list().bots.filter(b=>b.status==='active').map(b=>b.id));proactive.engine.tick();value={sampledAt:store.now(),error:null,...result};}
    catch{value={...value,error:'ACT_SCAN_FAILED'};scope.logger.warn('ACT_SCAN_FAILED');}
    if(Date.now()-lastCheck>=60000){lastCheck=Date.now();void capabilities.refresh().catch(()=>scope.logger.warn('ACT_CAPABILITY_PROBE_FAILED'));}
  };
  const read=botId=>({domain:'local-owner',scheduler:{...value,modelCalls:0,externalActions:0,stale:!value.sampledAt||Date.now()-Date.parse(value.sampledAt)>intervalMs*3},proactive:proactive.engine.view(botId),rules:activity.rules(botId),runs:activity.runs(botId),notifications:activity.notifications(botId),observation:observation.read(botId),capabilities:capabilities.read(botId)});
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/employee-activity',handler:async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Naumi-Activity','1');res.setHeader('X-Naumi-Local-Proactive','1');
    const admission=scope.connection.admit(req);if('rejection'in admission){res.writeHead(admission.rejection).end();return;}if(admission.peer.principal.kind!=='owner'){res.writeHead(403).end();return;}
    const send=(code,value)=>{if(!res.destroyed)res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
    try{
      if(req.method==='GET'){const botId=z.string().min(1).max(200).parse(new URL(req.url,'http://localhost').searchParams.get('botId'));service.bot(botId);send(200,read(botId));return;}
      if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
      if(req.headers['x-naumi-employee-activity']!=='1'||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'ACT_SAME_ORIGIN_REQUIRED'});return;}
      let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>16384){send(413,{error:'ACT_REQUEST_TOO_LARGE'});return;}chunks.push(Buffer.from(chunk));}
      let command;try{command=commandSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{send(400,{error:'ACT_INVALID_REQUEST'});return;}
      service.bot(command.botId,{write:true});
      if(command.action.startsWith('ai_job_')){send(200,await proactive.engine.command(command));return;}
      const config=command.config??(command.action==='rule_enable'&&command.enabled?activity.rule(command.botId,command.ruleId).config:null);if(config)proactive.engine.validate(command.botId,config);
      const result=activity.command(command);proactive.engine.tick();send(200,result);
    }catch(e){const code=e instanceof z.ZodError?'ACT_INVALID_REQUEST':/^(?:EMP|WORK|ACT)_[A-Z_]+$/.test(e.message)?e.message:'ACT_STORAGE_UNAVAILABLE';send(/CONFLICT/.test(code)?409:/NOT_FOUND/.test(code)?404:/REQUIRED|ARCHIVED/.test(code)?403:/UNAVAILABLE/.test(code)?503:400,{error:code});}
  }}));
  tick();timer=setInterval(tick,intervalMs);timer.unref?.();
  return {activity,proactive:proactive.engine,observation,capabilities,read,tick,async close(){closed=true;clearInterval(timer);timer=null;await proactive.close();for(const dispose of installed.values())dispose();installed.clear();await capabilities.close();}};
}
