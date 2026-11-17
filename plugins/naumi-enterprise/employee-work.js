import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {EmployeeService} from './employee-service.js';
import {EmployeeWorkStore,workCommands} from './employee-work-store.js';

export class EmployeeWorkService{
  constructor({ctx,directory,store,tasks=()=>[]}){Object.assign(this,{ctx,directory,store,tasks});this.work=new EmployeeWorkStore(store);this.evidenceService=new EmployeeService(ctx,directory,store);}
  bot(botId,write=false){const bot=this.directory.list().bots.find(b=>b.id===botId);if(!bot)throw Error('WORK_BOT_NOT_FOUND');if(write&&bot.status!=='active')throw Error('WORK_BOT_ARCHIVED');return bot;}
  caller(agent,write=false){if(!agent)throw Error('WORK_CALLER_REQUIRED');const m=this.ctx.agentTeams.membership(agent);if(write&&m.role!=='lead')throw Error('WORK_LEAD_REQUIRED');const bot=this.directory.forSession(m.root.id);if(!bot)throw Error('WORK_BOT_NOT_BOUND');this.bot(bot.id,write);return {bot,root:m.root};}
  linkedTask(botId,taskId,sessionId){if(!taskId)return;const task=this.tasks().find(t=>t.id===taskId);if(!task||task.targetBotId!==botId)throw Error('WORK_TASK_NOT_FOUND');if(sessionId&&task.targetSessionId!==sessionId)throw Error('WORK_TASK_EXECUTOR_REQUIRED');return task;}
  list(botId){this.bot(botId);const tasks=this.tasks();return {domain:'local-owner',syncState:'local_only',goals:this.work.goals(botId),goalProposals:this.work.proposals(botId),deliveries:this.work.deliveries(botId).map(d=>({...d,executionStatus:d.sourceTaskId?tasks.find(t=>t.id===d.sourceTaskId)?.status??'unknown':'not_linked'}))};}
  command(input,actor={kind:'owner'}){
    const command=workCommands.parse(input),{action,botId,...args}=command;this.bot(botId,true);
    if(action==='goal_proposal_review')return this.work.reviewProposal(botId,args,actor);
    if(action==='goal_create')return this.work.createGoal(botId,args,actor);
    if(action==='goal_update')return this.work.updateGoal(botId,args,actor);
    if(action==='delivery_create'){this.linkedTask(botId,args.sourceTaskId,actor.kind==='agent'?actor.sessionId:undefined);return this.work.createDelivery(botId,args,actor);}
    if(action==='delivery_revise')return this.work.reviseDelivery(botId,args,actor);
    const {transition,...rest}=args;return this.work.transition(botId,{...rest,action:transition},actor);
  }
  async proposeGoal(agent,input,signal){
    const args=z.object({title:z.string().trim().min(1).max(120),description:z.string().trim().max(4000).default(''),criteria:z.array(z.string().trim().min(1).max(500)).min(1).max(20),priority:z.number().int().min(0).max(3).default(1),dueAt:z.string().datetime().nullable().default(null),sourceMessageId:z.string().min(1).max(200),quote:z.string().trim().min(1).max(1000),operationId:z.string().min(1).max(200)}).strict().parse(input);
    const {bot,root}=this.caller(agent,true),actor=await this.evidenceService.evidence(root,args);
    signal?.throwIfAborted();const current=this.caller(agent,true);if(current.bot.id!==bot.id||current.root.id!==root.id)throw Error('WORK_IDENTITY_CHANGED');
    const {sourceMessageId,quote,...goal}=args;return this.work.proposeGoal(bot.id,goal,actor);
  }
  agentCommand(agent,input){
    const {bot,root}=this.caller(agent,true);
    if(!['delivery_create','delivery_revise'].includes(input.action)&&!(input.action==='delivery_transition'&&input.transition==='submit'))throw Error('WORK_REVIEWER_REQUIRED');
    if(input.deliveryId){const delivery=this.work.delivery(bot.id,input.deliveryId);
      // A draft created by another task cannot be taken over just because the Bot identity matches.
      const creation=this.store.db.prepare("SELECT json FROM events WHERE bot_id=? AND entity_id=? AND type='delivery' ORDER BY seq ASC LIMIT 1").get(bot.id,delivery.id);
      const source=creation?JSON.parse(creation.json).source:null;
      if(source?.kind!=='agent'||source.sessionId!==root.id)throw Error('WORK_TASK_EXECUTOR_REQUIRED');
    }
    return this.command({...input,botId:bot.id},{kind:'agent',sessionId:root.id,note:'agent delivery submission'});
  }
}

export function createEmployeeWorkTools(service){
  const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
  const tool=(name,description,parameters,run)=>defineTool({name,description,parameters,output,execute:(args,exec)=>{exec.signal?.throwIfAborted();return run(exec.agent,args,exec.signal);}});
  const field=(type,required=true)=>({type,...(required?{required:true}:{})});
  return [
    tool('employee_work','Read your Bot goals, acceptance criteria and deliverables. executionStatus is not business acceptance. Only owner reviews and accepts. No business/server approval is implied by local-owner records. recentUserSources provides verified message IDs/quotes for proposing work.',{},agent=>({...service.list(service.caller(agent).bot.id),recentUserSources:service.evidenceService.profile(agent).recentUserSources})),
    tool('employee_goal_propose','Propose a trackable goal from a real user message in your own conversation. Read employee_work for existing goals and recentUserSources first. Supply the exact sourceMessageId and quote; do not invent them. This only creates a pending proposal, NOT approval, dispatch, automatic work or acceptance. Reuse a stable operationId; do not re-propose ignored work.',{title:field('string'),description:field('string',false),criteria:{type:'array',items:{type:'string'},required:true},priority:field('integer',false),dueAt:field('string',false),sourceMessageId:field('string'),quote:field('string'),operationId:field('string')},(agent,args,signal)=>service.proposeGoal(agent,args,signal)),
    tool('employee_delivery_create','Create an immutable text artifact draft for an existing owner-assigned goal. Keep a stable operationId. This is a draft, not submitted or accepted. sourceTaskId, if supplied, must identify your exact executing delegated task.',{goalId:field('string'),title:field('string'),fileName:field('string'),content:field('string'),sourceTaskId:field('string',false),operationId:field('string')},(agent,args)=>service.agentCommand(agent,{action:'delivery_create',...args})),
    tool('employee_delivery_revise','Create a NEW artifact version for your own draft or returned delivery. Old versions/review evidence remain immutable. Does not submit or accept.',{deliveryId:field('string'),expectedRevision:field('integer'),fileName:field('string'),content:field('string'),operationId:field('string')},(agent,args)=>service.agentCommand(agent,{action:'delivery_revise',...args})),
    tool('employee_delivery_submit','Submit your own prepared delivery for human review. Submission is not acceptance; do not claim owner approval. Use current revision and a stable operationId.',{deliveryId:field('string'),expectedRevision:field('integer'),operationId:field('string')},(agent,args)=>service.agentCommand(agent,{action:'delivery_transition',transition:'submit',...args})),
  ];
}

export function installEmployeeWork(ctx,directory,store,{tasks,onReady}={}){
  return ctx.inject(['agents','agentTeams','tools','systemPrompt'],scope=>{
    const file=path.join(path.dirname(directory.file),'bot-tasks.json');
    const readTasks=tasks??(()=>{try{const d=JSON.parse(fs.readFileSync(file,'utf8'));if(!Array.isArray(d.tasks))throw Error('WORK_TASK_LEDGER_INVALID');return d.tasks;}catch(error){if(error.code==='ENOENT')return [];throw Error('WORK_TASK_LEDGER_UNAVAILABLE');}});
    const service=new EmployeeWorkService({ctx:scope,directory,store,tasks:readTasks}),installed=new Map();
    const install=agent=>{
      if(installed.has(agent)||!scope.agentTeams.tryMembership(agent))return;const disposers=[];
      try{
        for(const tool of createEmployeeWorkTools(service))disposers.push(agent.ctx.tools.register(tool));
        disposers.push(agent.ctx.systemPrompt.section({name:'naumi:delivery-policy',order:agent.ctx.systemPrompt.getSectionOrder('TEAM_POLICY')+5,text:'For owner-assigned employee goals, use employee_work to read the real criteria. Save deliverables through employee_delivery_create/revise and submit explicitly. A completed Agent turn or task is not business acceptance. Only the human owner can start review, return or accept; never self-approve, overwrite an accepted artifact, or report local acceptance as enterprise server approval. For new multi-step work with no matching assigned goal, read employee_work and use employee_goal_propose with the exact real user source; tell the user it awaits confirmation in Work and delivery. Only owner confirmation creates a goal; never treat a pending proposal as authorization or schedule it. Reuse existing goals and do not re-propose dismissed work. Existing unrelated conversations and quick questions need not manufacture goals or deliverables.'}));
        installed.set(agent,()=>{for(const d of disposers.reverse())d();});
      }catch(error){for(const d of disposers.reverse())d();throw error;}
    };
    scope.on('agent/created',({agent})=>install(agent));scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);});for(const agent of scope.agents.list())install(agent);
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/employee-work',handler:async(req,res)=>{
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Naumi-Employee-Work','1');res.setHeader('X-Naumi-Goal-Proposals','1');
      const a=scope.connection.admit(req);if('rejection'in a){res.writeHead(a.rejection).end();return;}if(a.peer.principal.kind!=='owner'){res.writeHead(403).end();return;}
      const send=(code,value)=>{if(!res.destroyed)res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
      try{
        if(req.method==='GET'){
          const q=new URL(req.url??'/naumi/employee-work','http://localhost').searchParams,botId=z.string().min(1).max(200).parse(q.get('botId'));service.bot(botId);
          const view=q.get('view')??'list';if(view==='list'){send(200,service.list(botId));return;}
          if(view==='delivery'){send(200,service.work.details(botId,z.string().min(1).max(200).parse(q.get('deliveryId'))));return;}
          if(view==='artifact'){
            const artifact=service.work.artifact(botId,z.string().min(1).max(200).parse(q.get('artifactId')));
            res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="delivery.txt"; filename*=UTF-8''${encodeURIComponent(artifact.fileName)}`,'X-Artifact-SHA256':artifact.sha256});res.end(artifact.content);return;
          }
          send(400,{error:'WORK_INVALID_VIEW'});return;
        }
        if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
        if(req.headers['x-naumi-employee-work']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'WORK_SAME_ORIGIN_REQUIRED'});return;}
        let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>131072){send(413,{error:'WORK_REQUEST_TOO_LARGE'});return;}chunks.push(Buffer.from(chunk));}
        let command;try{command=workCommands.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{send(400,{error:'WORK_INVALID_REQUEST'});return;}
        send(200,service.command(command));
      }catch(error){const code=error instanceof z.ZodError?'WORK_INVALID_REQUEST':/^(?:EMP|WORK)_[A-Z_]+$/.test(error.message)?error.message:'WORK_STORAGE_UNAVAILABLE';send(/CONFLICT/.test(code)?409:/NOT_FOUND/.test(code)?404:/REQUIRED|ARCHIVED/.test(code)?403:/CORRUPT|UNAVAILABLE/.test(code)?503:400,{error:code});}
    }}));
    onReady?.(service);scope.effect(()=>()=>{for(const d of installed.values())d();installed.clear();});
  });
}
