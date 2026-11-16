import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {defineTool} from '@deepseek-ai/dsh-tools';

const name=z.string().trim().min(1).max(80).refine(v=>!/[\u0000-\u001f\u007f]/u.test(v));
const id=z.string().min(1).max(200),revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const botSchema=z.object({id,kind:z.enum(['agent','team']),name,purpose:z.string().trim().min(1).max(4000),status:z.enum(['active','archived']),revision,cwd:z.string().min(1),agentPreset:z.string().optional(),homeSessionId:id,sessionIds:z.array(id).min(1).max(1000),createdAt:z.string().datetime(),updatedAt:z.string().datetime()}).strict();
const documentSchema=z.object({version:z.literal(1),revision:z.number().int().nonnegative(),bots:z.array(botSchema).max(1000)}).strict().superRefine((value,ctx)=>{
  const bots=new Set(),sessions=new Set();for(const bot of value.bots){if(bots.has(bot.id)||!bot.sessionIds.includes(bot.homeSessionId))ctx.addIssue({code:'custom',message:'Invalid Bot identity'});bots.add(bot.id);for(const session of bot.sessionIds){if(sessions.has(session))ctx.addIssue({code:'custom',message:'Session belongs to two Bots'});sessions.add(session);}}
});
const clone=value=>structuredClone(value),fail=code=>{throw Error(code);};

/** Local owner directory. Bot IDs are independent from Sessions; one Bot can own many task threads. */
export class BotDirectory {
  constructor(file,{write,now=()=>new Date().toISOString(),uuid=randomUUID}={}){
    this.file=file;this.now=now;this.uuid=uuid;this.listeners=new Set();this.tail=Promise.resolve();this.closed=false;
    this.write=write??(async value=>{
      await fs.promises.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
      try{const handle=await fs.promises.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}await fs.promises.rename(temp,file);}
      finally{await fs.promises.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    });
    try{this.value=documentSchema.parse(JSON.parse(fs.readFileSync(file,'utf8')));}catch(error){if(error.code==='ENOENT')this.value={version:1,revision:0,bots:[]};else this.failure='BOT_DIRECTORY_INVALID';}
  }
  assertReady(){if(this.closed)fail('BOT_DIRECTORY_CLOSED');if(this.failure)fail(this.failure);}
  list(){this.assertReady();return clone(this.value);}
  forSession(sessionId){this.assertReady();const bot=this.value.bots.find(b=>b.sessionIds.includes(sessionId));return bot?clone(bot):null;}
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  transact(change){
    this.assertReady();const run=this.tail.then(async()=>{
      this.assertReady();const next=clone(this.value),result=change(next);
      if(result.unchanged)return clone(result.bot);
      next.revision++;documentSchema.parse(next);await this.write(next);this.value=next;
      for(const listener of this.listeners){try{listener();}catch{}}
      return clone(result.bot);
    });this.tail=run.then(()=>{},()=>{});return run;
  }
  create({sessionId,cwd,agentPreset},input){
    const fields=z.object({name,kind:z.enum(['agent','team']),purpose:z.string().trim().min(1).max(4000)}).strict().parse(input);
    if(!cwd||!path.isAbsolute(cwd))fail('BOT_WORKSPACE_REQUIRED');
    return this.transact(next=>{
      if(next.bots.some(b=>b.sessionIds.includes(sessionId)))fail('BOT_SESSION_ALREADY_BOUND');
      if(next.bots.some(b=>b.status==='active'&&b.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      const time=this.now(),bot=botSchema.parse({id:'bot-'+this.uuid(),...fields,status:'active',revision:1,cwd,...(agentPreset?{agentPreset}:{}),homeSessionId:sessionId,sessionIds:[sessionId],createdAt:time,updatedAt:time});next.bots.push(bot);return {bot};
    });
  }
  update(sessionId,input){
    const patch=z.object({expectedRevision:revision,name:name.optional(),purpose:z.string().trim().min(1).max(4000).optional(),status:z.enum(['active','archived']).optional()}).strict().parse(input);
    return this.transact(next=>{
      const bot=next.bots.find(b=>b.sessionIds.includes(sessionId));if(!bot)fail('BOT_NOT_BOUND');if(bot.revision!==patch.expectedRevision)fail('BOT_CONFLICT');
      const fields=Object.fromEntries(Object.entries(patch).filter(([key])=>key!=='expectedRevision'));
      if(!Object.keys(fields).length)fail('BOT_EMPTY_UPDATE');
      const nextName=fields.name??bot.name,nextStatus=fields.status??bot.status;
      if(nextStatus==='active'&&next.bots.some(b=>b.id!==bot.id&&b.status==='active'&&b.name.toLocaleLowerCase()===nextName.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      if(Object.entries(fields).every(([key,value])=>bot[key]===value))return {bot,unchanged:true};
      Object.assign(bot,fields,{revision:bot.revision+1,updatedAt:this.now()});return {bot};
    });
  }
  bind(botId,sessionId,expectedRevision,cwd){
    id.parse(botId);id.parse(sessionId);revision.parse(expectedRevision);
    return this.transact(next=>{
      const bot=next.bots.find(b=>b.id===botId);if(!bot)fail('BOT_NOT_FOUND');if(bot.status!=='active')fail('BOT_ARCHIVED');
      const existing=next.bots.find(b=>b.sessionIds.includes(sessionId));if(existing&&existing.id!==botId)fail('BOT_SESSION_ALREADY_BOUND');
      if(existing)return {bot,unchanged:true};if(bot.revision!==expectedRevision)fail('BOT_CONFLICT');
      if(!cwd||path.resolve(cwd).toLocaleLowerCase()!==path.resolve(bot.cwd).toLocaleLowerCase())fail('BOT_WORKSPACE_MISMATCH');
      bot.sessionIds.push(sessionId);bot.revision++;bot.updatedAt=this.now();return {bot};
    });
  }
  async close(){this.closed=true;await this.tail;this.listeners.clear();}
}

export function createBotTools(ctx,directory){
  const membership=exec=>{if(!exec.agent)fail('BOT_CALLER_REQUIRED');return ctx.agentTeams.membership(exec.agent);};
  const lead=exec=>{const m=membership(exec);if(m.role!=='lead')fail('BOT_LEAD_REQUIRED');return m.root;};
  const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
  return [
    defineTool({name:'bot_directory',description:'Read the local owner\'s persistent Bot directory and this task\'s Bot. A Bot is a reusable agent or team identity across task Sessions, not a conversation title.',parameters:{},output,execute:(_args,exec)=>{const m=membership(exec);return {...directory.list(),currentBotId:directory.forSession(m.root.id)?.id??null};}}),
    defineTool({name:'bot_create',description:'Create a persistent Bot for this root task when the user asks to establish a reusable agent or team. The Lead autonomously chooses its name, kind and purpose from the real work, without fixed employee templates. Do not create Bots for every ordinary conversation or temporary teammate.',parameters:{name:{type:'string',required:true},kind:{type:'string',enum:['agent','team'],required:true},purpose:{type:'string',required:true,description:'The reusable responsibility agreed with the user, not claims of unavailable skills or permissions.'}},output,execute:(args,exec)=>{const root=lead(exec);return directory.create({sessionId:root.id,cwd:root.session.header.cwd,agentPreset:ctx.agentPresets?.presetForSession(root.session)??undefined},args);}}),
    defineTool({name:'bot_update',description:'Update this task\'s persistent Bot name, responsibility or lifecycle. Lead only; use the Bot revision from bot_directory. Archiving hides the directory entry and prevents new task bindings; it never stops or deletes existing Sessions.',parameters:{expectedRevision:{type:'integer',required:true},name:{type:'string'},purpose:{type:'string'},status:{type:'string',enum:['active','archived']}},output,execute:(args,exec)=>directory.update(lead(exec).id,args)}),
    defineTool({name:'bot_use',description:'Associate this root task with an existing active Bot at the user\'s request. Use bot_directory first. This task must use the Bot\'s working directory and must not already belong to another Bot. No model, permissions or task contents are changed.',parameters:{botId:{type:'string',required:true},expectedRevision:{type:'integer',required:true}},output,execute:(args,exec)=>{const root=lead(exec);return directory.bind(args.botId,root.id,args.expectedRevision,root.session.header.cwd);}}),
  ];
}

export function installBots(ctx,{directory}={}){
  return ctx.inject(['agents','agentTeams','sessions','sessionPersistence','tools','systemPrompt'],scope=>{
    const store=directory??new BotDirectory(path.join(process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),'naumi','bots.json'));
    const installed=new Map(),streams=new Set();
    const install=agent=>{
      if(installed.has(agent)||!scope.agentTeams.tryMembership(agent))return;const disposers=[];
      try{
        for(const tool of createBotTools(scope,store))disposers.push(agent.ctx.tools.register(tool));
        disposers.push(agent.ctx.systemPrompt.section({name:'naumi:bots',order:agent.ctx.systemPrompt.getSectionOrder('TEAM_POLICY')+2,text:'Naumi has Thread and Bot navigation modes over the same Session engine. Only establish a persistent Bot when the user requests a reusable agent/team; use bot_create and choose its name and responsibilities yourself from that request. Never promote every temporary teammate or ordinary chat into a Bot. Use bot_directory / bot_update / bot_use to manage the real directory. The name is not a model tool address. Starting a new task for an existing Bot creates another Session linked to the same Bot ID. Do not claim cross-session memory beyond the Bot purpose and the actually available linked resources/history.'}));
        disposers.push(agent.ctx.systemPrompt.context({name:'naumi:bot-identity',order:agent.ctx.systemPrompt.getContextOrder('TEAM_IDENTITY')+1,required:true,text:()=>{try{const m=scope.agentTeams.membership(agent),bot=store.forSession(m.root.id);return bot?`Persistent Naumi Bot: ${JSON.stringify({id:bot.id,name:bot.name,kind:bot.kind,purpose:bot.purpose,status:bot.status})}\nThis is the identity for this task; preserve its stable ID across tasks. Use bot_update for name/purpose changes, not a conversation-title rename.`:'';}catch{return '';}}}));
        installed.set(agent,()=>{for(const dispose of disposers.reverse())dispose();});
      }catch(error){for(const dispose of disposers.reverse())dispose();throw error;}
    };
    scope.on('agent/created',({agent})=>install(agent));scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);});
    for(const agent of scope.agents.list())install(agent);
    const admit=(req,res)=>{
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
      const admission=scope.connection.admit(req);if('rejection'in admission){res.writeHead(admission.rejection).end();return false;}
      if(admission.peer.principal.kind!=='owner'){res.writeHead(403).end();return false;}return true;
    };
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/bots',handler:async(req,res)=>{
      if(!admit(req,res))return;res.setHeader('Content-Type','application/json; charset=utf-8');
      const send=(status,data)=>{if(!res.destroyed)res.writeHead(status).end(JSON.stringify(data));};
      try{
        if(req.method==='GET'){send(200,store.list());return;}
        if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
        if(req.headers['x-naumi-bots']!=='1'){send(403,{error:'BOT_SAME_ORIGIN_REQUIRED'});return;}
        if(req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'BOT_SAME_ORIGIN_REQUIRED'});return;}
        let text='',size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){send(413,{error:'BOT_REQUEST_TOO_LARGE'});return;}text+=chunk.toString();}
        let input;try{input=z.object({action:z.literal('bind'),botId:id,sessionId:id,expectedRevision:revision}).strict().parse(JSON.parse(text));}catch{send(400,{error:'BOT_INVALID_REQUEST'});return;}
        const header=scope.sessions.get(input.sessionId)?.header??(await scope.sessionPersistence.stat(input.sessionId))?.header;
        if(!header){send(404,{error:'BOT_SESSION_NOT_FOUND'});return;}
        if(header.origin==='subagent'||(header.delegationDepth??0)>0){send(403,{error:'BOT_ROOT_SESSION_REQUIRED'});return;}
        send(200,await store.bind(input.botId,input.sessionId,input.expectedRevision,header.cwd));
      }catch(error){const code=/^BOT_[A-Z_]+$/.test(error.message)?error.message:'BOT_DIRECTORY_UNAVAILABLE';send(code==='BOT_CONFLICT'?409:code==='BOT_NOT_FOUND'?404:code==='BOT_DIRECTORY_INVALID'||code==='BOT_DIRECTORY_UNAVAILABLE'?503:400,{error:code});}
    }}));
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/bots/events',handler:(req,res)=>{
      if(!admit(req,res))return;if(req.method!=='GET'){res.writeHead(405).end();return;}
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
      const publish=()=>{if(!res.destroyed)res.write('data: changed\n\n');};publish();const unsubscribe=store.subscribe(publish);streams.add(res);
      const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},25000);heartbeat.unref?.();
      res.on('close',()=>{clearInterval(heartbeat);unsubscribe();streams.delete(res);});
    }}));
    scope.effect(()=>async()=>{for(const dispose of installed.values())dispose();installed.clear();for(const res of streams)res.end();streams.clear();await store.close();});
  });
}
