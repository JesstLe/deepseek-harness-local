import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {installBotTasks} from './bot-tasks.js';
import {installEmployees} from './employees.js';
import {installBotGroups} from './bot-groups.js';
import {BOT_FORMS,BOT_PALETTES} from './assets/bot-appearance-model.js';

const name=z.string().trim().min(1).max(80).refine(v=>!/[\u0000-\u001f\u007f]/u.test(v));
const id=z.string().min(1).max(200),revision=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const appearanceSchema=z.object({shape:z.enum(BOT_FORMS.map(f=>f.id)),palette:z.enum(BOT_PALETTES.map(p=>p.id))}).strict();
const creationFields=z.object({name,kind:z.enum(['agent','team']),purpose:z.string().trim().min(1).max(4000),appearance:appearanceSchema.optional()}).strict();
const updateFields=z.object({expectedRevision:revision,name:name.optional(),purpose:z.string().trim().min(1).max(4000).optional(),status:z.enum(['active','archived']).optional(),appearance:appearanceSchema.optional()}).strict();
const botSchema=z.object({id,kind:z.enum(['agent','team']),name,purpose:z.string().trim().min(1).max(4000),status:z.enum(['active','archived']),revision,cwd:z.string().min(1),agentPreset:z.string().optional(),homeSessionId:id,sessionIds:z.array(id).min(1).max(1000),createdAt:z.string().datetime(),updatedAt:z.string().datetime(),appearance:appearanceSchema.optional()}).strict();
const primarySetupSchema=z.object({requestId:z.uuid(),botId:id,sessionId:id,name,appearance:appearanceSchema.optional(),cwd:z.string().min(1),
  profile:z.object({agentPreset:id.optional(),model:z.object({provider:id,model:id,reasoningEffort:id.optional()}).strict(),permissions:z.array(z.never()).max(0)}).strict()}).strict();
const creationSchema=primarySetupSchema.omit({requestId:true}).extend({requestId:id,actor:id,kind:z.enum(['agent','team']),purpose:z.string().trim().min(1).max(4000),state:z.enum(['pending','completed'])}).strict();
const documentSchema=z.object({version:z.literal(1),revision:z.number().int().nonnegative(),bots:z.array(botSchema).max(1000),primaryBotId:id.optional(),primarySetup:primarySetupSchema.optional(),creations:z.array(creationSchema).max(1000).optional()}).strict().superRefine((value,ctx)=>{
  const bots=new Set(),sessions=new Set();for(const bot of value.bots){if(bots.has(bot.id)||!bot.sessionIds.includes(bot.homeSessionId))ctx.addIssue({code:'custom',message:'Invalid Bot identity'});bots.add(bot.id);for(const session of bot.sessionIds){if(sessions.has(session))ctx.addIssue({code:'custom',message:'Session belongs to two Bots'});sessions.add(session);}}
  if(value.primaryBotId&&!value.bots.some(b=>b.id===value.primaryBotId&&b.status==='active')||value.primaryBotId&&value.primarySetup)ctx.addIssue({code:'custom',message:'Invalid primary Bot'});
  const requests=new Set();for(const pending of value.creations??[]){const key=pending.actor+'\0'+pending.requestId;if(requests.has(key))ctx.addIssue({code:'custom',message:'Duplicate creation request'});requests.add(key);if(pending.state==='pending'){if(bots.has(pending.botId)||sessions.has(pending.sessionId))ctx.addIssue({code:'custom',message:'Invalid creation reservation'});bots.add(pending.botId);sessions.add(pending.sessionId);}else if(!value.bots.some(b=>b.id===pending.botId&&b.homeSessionId===pending.sessionId))ctx.addIssue({code:'custom',message:'Missing created identity'});}
  if(value.primarySetup&&(bots.has(value.primarySetup.botId)||sessions.has(value.primarySetup.sessionId)))ctx.addIssue({code:'custom',message:'Invalid primary reservation'});
});
const clone=value=>structuredClone(value),fail=code=>{throw Error(code);};

/** Local owner directory. Bot IDs are independent from Sessions; one Bot can own many task threads. */
export class BotDirectory {
  constructor(file,{write,now=()=>new Date().toISOString(),uuid=randomUUID}={}){
    this.file=file;this.lifecycleLocks=new Set();this.now=now;this.uuid=uuid;this.listeners=new Set();this.tail=Promise.resolve();this.closed=false;
    this.write=write??(async value=>{
      await fs.promises.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
      try{const handle=await fs.promises.open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(value,null,2)+'\n');await handle.sync();}finally{await handle.close();}await fs.promises.rename(temp,file);}
      finally{await fs.promises.unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    });
    try{this.value=documentSchema.parse(JSON.parse(fs.readFileSync(file,'utf8')));}catch(error){if(error.code==='ENOENT')this.value={version:1,revision:0,bots:[]};else this.failure='BOT_DIRECTORY_INVALID';}
  }
  assertReady(){if(this.closed)fail('BOT_DIRECTORY_CLOSED');if(this.failure)fail(this.failure);}
  list(){this.assertReady();return clone(this.value);}
  primary(){this.assertReady();return clone(this.value.bots.find(b=>b.id===this.value.primaryBotId&&b.status==='active')??null);}
  forSession(sessionId){this.assertReady();const groupBotId=this.groupSessionOwner?.(sessionId);const bot=this.value.bots.find(b=>b.id===groupBotId||b.sessionIds.includes(sessionId));return bot?clone(bot):null;}
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
      if(this.groupSessionOwner?.(sessionId))fail('BOT_SESSION_ALREADY_BOUND');
      const existing=next.bots.find(b=>b.sessionIds.includes(sessionId));
      if(existing){
        if(existing.status==='archived')fail('BOT_ARCHIVED');
        // A lost tool reply/retry must return the durable identity, not create a second Bot.
        if(Object.entries(fields).every(([key,value])=>existing[key]===value)
          &&path.resolve(cwd).toLocaleLowerCase()===path.resolve(existing.cwd).toLocaleLowerCase()
          &&(agentPreset??undefined)===existing.agentPreset)return {bot:existing,unchanged:true};
        fail('BOT_SESSION_ALREADY_BOUND');
      }
      if(next.bots.length+(next.creations??[]).filter(c=>c.state==='pending').length>=1000)fail('BOT_DIRECTORY_FULL');
      if(next.bots.some(b=>b.status==='active'&&b.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      if(next.primarySetup?.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase()||(next.creations??[]).some(c=>c.state==='pending'&&c.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      const time=this.now(),bot=botSchema.parse({id:'bot-'+this.uuid(),...fields,status:'active',revision:1,cwd,...(agentPreset?{agentPreset}:{}),homeSessionId:sessionId,sessionIds:[sessionId],createdAt:time,updatedAt:time});next.bots.push(bot);return {bot};
    });
  }
  update(sessionId,input){
    const bot=this.forSession(sessionId);if(!bot)fail('BOT_NOT_BOUND');return this.updateBot(bot.id,input);
  }
  updateBot(botId,input){
    const patch=updateFields.parse(input);
    return this.transact(next=>{
      const bot=next.bots.find(b=>b.id===botId);if(!bot)fail('BOT_NOT_FOUND');if(bot.revision!==patch.expectedRevision)fail('BOT_CONFLICT');
      const fields=Object.fromEntries(Object.entries(patch).filter(([key])=>key!=='expectedRevision'));if(!Object.keys(fields).length)fail('BOT_EMPTY_UPDATE');
      const nextName=fields.name??bot.name,nextStatus=fields.status??bot.status;
      if(bot.id===next.primaryBotId&&nextStatus!=='active')fail('BOT_PRIMARY_REQUIRED');
      if(nextStatus==='active'&&(next.primarySetup?.name.toLocaleLowerCase()===nextName.toLocaleLowerCase()||(next.creations??[]).some(c=>c.state==='pending'&&c.name.toLocaleLowerCase()===nextName.toLocaleLowerCase())))fail('BOT_NAME_EXISTS');
      if(nextStatus==='active'&&next.bots.some(b=>b.id!==bot.id&&b.status==='active'&&b.name.toLocaleLowerCase()===nextName.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      if(Object.entries(fields).every(([key,value])=>JSON.stringify(bot[key])===JSON.stringify(value)))return {bot,unchanged:true};
      Object.assign(bot,fields,{revision:bot.revision+1,updatedAt:this.now()});return {bot};
    });
  }
  reserveCreation(input){
    const fields=creationFields.parse(input.fields);id.parse(input.requestId);id.parse(input.actor);
    return this.transact(next=>{
      const prior=(next.creations??[]).find(c=>c.actor===input.actor&&c.requestId===input.requestId);
      if(prior){if(JSON.stringify(creationFields.parse(Object.fromEntries(['name','kind','purpose','appearance'].filter(k=>prior[k]!==undefined).map(k=>[k,prior[k]]))))!==JSON.stringify(fields))fail('BOT_CREATION_REQUEST_CONFLICT');return {bot:prior,unchanged:true};}
      if(next.revision!==input.expectedRevision)fail('BOT_CONFLICT');
      if(next.bots.length+(next.creations??[]).filter(c=>c.state==='pending').length>=1000||(next.creations??[]).length>=1000)fail('BOT_DIRECTORY_FULL');
      if(next.bots.some(b=>b.status==='active'&&b.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase())||next.primarySetup?.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase()||(next.creations??[]).some(c=>c.state==='pending'&&c.name.toLocaleLowerCase()===fields.name.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      const botId='bot-'+this.uuid(),cwd=path.resolve(path.dirname(this.file),'workspaces',botId),entry=creationSchema.parse({requestId:input.requestId,actor:input.actor,botId,sessionId:'session-'+this.uuid(),...fields,cwd,profile:input.profile,state:'pending'});
      next.creations??=[];next.creations.push(entry);return {bot:entry};
    });
  }
  completeCreation(actor,requestId){
    return this.transact(next=>{const pending=(next.creations??[]).find(c=>c.actor===actor&&c.requestId===requestId);if(!pending)fail('BOT_CREATION_NOT_FOUND');
      if(pending.state==='completed')return {bot:next.bots.find(b=>b.id===pending.botId),unchanged:true};
      const time=this.now(),bot=botSchema.parse({id:pending.botId,...Object.fromEntries(['name','kind','purpose','appearance'].filter(k=>pending[k]!==undefined).map(k=>[k,pending[k]])),status:'active',revision:1,cwd:pending.cwd,agentPreset:pending.profile.agentPreset,homeSessionId:pending.sessionId,sessionIds:[pending.sessionId],createdAt:time,updatedAt:time});
      next.bots.push(bot);pending.state='completed';return {bot};
    });
  }
  appearance(botId,expectedRevision,input){
    id.parse(botId);revision.parse(expectedRevision);const appearance=appearanceSchema.parse(input);
    return this.transact(next=>{
      const bot=next.bots.find(b=>b.id===botId);if(!bot)fail('BOT_NOT_FOUND');if(bot.status!=='active')fail('BOT_ARCHIVED');if(bot.revision!==expectedRevision)fail('BOT_CONFLICT');
      if(bot.appearance?.shape===appearance.shape&&bot.appearance?.palette===appearance.palette)return {bot,unchanged:true};
      Object.assign(bot,{appearance,revision:bot.revision+1,updatedAt:this.now()});return {bot};
    });
  }
  bind(botId,sessionId,expectedRevision,cwd){
    id.parse(botId);id.parse(sessionId);revision.parse(expectedRevision);
    return this.transact(next=>{
      const bot=next.bots.find(b=>b.id===botId);if(!bot)fail('BOT_NOT_FOUND');if(bot.status!=='active')fail('BOT_ARCHIVED');
      if(this.groupSessionOwner?.(sessionId))fail('BOT_SESSION_ALREADY_BOUND');
      const existing=next.bots.find(b=>b.sessionIds.includes(sessionId));if(existing&&existing.id!==botId)fail('BOT_SESSION_ALREADY_BOUND');
      if(existing)return {bot,unchanged:true};if(bot.revision!==expectedRevision)fail('BOT_CONFLICT');
      if(!cwd||path.resolve(cwd).toLocaleLowerCase()!==path.resolve(bot.cwd).toLocaleLowerCase())fail('BOT_WORKSPACE_MISMATCH');
      bot.sessionIds.push(sessionId);bot.revision++;bot.updatedAt=this.now();return {bot};
    });
  }
  reservePrimary(input){
    return this.transact(next=>{
      if(next.primaryBotId)return {bot:{bot:next.bots.find(b=>b.id===next.primaryBotId),already:true},unchanged:true};
      if(next.primarySetup){
        const prior=next.primarySetup;
        if(prior.requestId!==input.requestId)fail('BOT_PRIMARY_PENDING');
        if(prior.name!==input.name||JSON.stringify(prior.appearance)!==JSON.stringify(input.appearance))fail('BOT_PRIMARY_REQUEST_CONFLICT');
        return {bot:prior,unchanged:true};
      }
      if(next.revision!==input.expectedRevision)fail('BOT_CONFLICT');
      if(next.bots.length>=1000)fail('BOT_DIRECTORY_FULL');
      if(next.bots.some(b=>b.status==='active'&&b.name.toLocaleLowerCase()===input.name.toLocaleLowerCase())||(next.creations??[]).some(c=>c.state==='pending'&&c.name.toLocaleLowerCase()===input.name.toLocaleLowerCase()))fail('BOT_NAME_EXISTS');
      next.primarySetup=primarySetupSchema.parse({requestId:input.requestId,botId:'bot-'+this.uuid(),sessionId:'session-'+this.uuid(),name:input.name,
        ...(input.appearance?{appearance:input.appearance}:{}),cwd:input.cwd,profile:input.profile});return {bot:next.primarySetup};
    });
  }
  completePrimary(requestId){
    return this.transact(next=>{
      if(next.primaryBotId)return {bot:next.bots.find(b=>b.id===next.primaryBotId),unchanged:true};
      const pending=next.primarySetup;if(!pending||pending.requestId!==requestId)fail('BOT_PRIMARY_PENDING');
      const time=this.now(),bot=botSchema.parse({id:pending.botId,kind:'agent',name:pending.name,
        purpose:'作为用户的主助手接待需求，协调已有 Bot 的独立工作，并核对与汇总交付；新增 Bot 需用户明确要求。',status:'active',revision:1,
        cwd:pending.cwd,...(pending.profile.agentPreset?{agentPreset:pending.profile.agentPreset}:{}),homeSessionId:pending.sessionId,sessionIds:[pending.sessionId],
        ...(pending.appearance?{appearance:pending.appearance}:{}),createdAt:time,updatedAt:time});
      next.bots.push(bot);next.primaryBotId=bot.id;delete next.primarySetup;return {bot};
    });
  }
  choosePrimary(botId,expectedRevision){
    return this.transact(next=>{
      if(next.primaryBotId){if(next.primaryBotId!==botId)fail('BOT_PRIMARY_ALREADY_SET');return {bot:next.bots.find(b=>b.id===botId),unchanged:true};}
      if(next.primarySetup)fail('BOT_PRIMARY_PENDING');if(next.revision!==expectedRevision)fail('BOT_CONFLICT');
      const bot=next.bots.find(b=>b.id===botId);if(!bot)fail('BOT_NOT_FOUND');if(bot.status!=='active')fail('BOT_ARCHIVED');
      next.primaryBotId=bot.id;return {bot};
    });
  }
  async close(){this.closed=true;await this.tail;this.listeners.clear();}
}

/** Owner/profile scoped bootstrap. It reuses the existing registry/runtime and
 * persists a reservation BEFORE creating a native Session. No prompt/model call. */
export class PrimaryBotService{
  constructor(options){Object.assign(this,options);this.tail=Promise.resolve();}
  execute(input){const run=this.tail.then(()=>this.perform(input));this.tail=run.catch(()=>{});return run;}
  defaultProfile(){return Promise.resolve(this.agentPresets.resolve()).then(selected=>({agentPreset:selected.id,model:(this.agentDefaultModel??this.context?.get('agentDefaultModel')).currentSelection(),permissions:[]}));}
  createBot(input,actor='owner'){
    const run=this.tail.then(async()=>{
      if(!this.directory.primary())fail('BOT_PRIMARY_REQUIRED');const runtime=this.getRuntime(),registry=this.workspaceRegistry??this.context?.get('workspaceRegistry');if(!runtime||!registry?.create)fail('BOT_PRIMARY_UNAVAILABLE');
      const fields=creationFields.parse(input.fields),prior=(this.directory.list().creations??[]).find(c=>c.actor===actor&&c.requestId===input.requestId);
      const pending=await this.directory.reserveCreation({...input,actor,fields,profile:prior?.profile??await this.defaultProfile()});
      if(pending.state==='completed')return this.directory.list().bots.find(b=>b.id===pending.botId);
      const base=path.resolve(path.dirname(this.directory.file),'workspaces'),cwd=path.resolve(pending.cwd);if(path.dirname(cwd)!==base)fail('BOT_WORKSPACE_MISMATCH');
      await fs.promises.mkdir(base,{recursive:true});if((await fs.promises.lstat(base)).isSymbolicLink())fail('BOT_WORKSPACE_MISMATCH');await fs.promises.mkdir(cwd,{recursive:true});if((await fs.promises.lstat(cwd)).isSymbolicLink())fail('BOT_WORKSPACE_MISMATCH');
      const workspace=await registry.create(cwd,pending.name);if(path.resolve(workspace.path).toLowerCase()!==cwd.toLowerCase())fail('BOT_WORKSPACE_MISMATCH');
      await runtime.ensure(pending.sessionId,{create:true,cwd,profile:pending.profile});const stored=await runtime.snapshot(pending.sessionId);if(!stored)fail('BOT_PRIMARY_SESSION_PENDING');
      if(stored.header?.origin==='subagent'||(stored.header?.delegationDepth??0)>0)fail('BOT_ROOT_SESSION_REQUIRED');if(path.resolve(stored.header.cwd).toLowerCase()!==cwd.toLowerCase())fail('BOT_WORKSPACE_MISMATCH');
      await workspace.attachSession(pending.sessionId);return this.directory.completeCreation(actor,input.requestId);
    });this.tail=run.catch(()=>{});return run;
  }
  async manageBot(botId,input){
    const patch=updateFields.parse(input),service=this.getTasks?.(),busy=()=>service?.store.read().tasks.some(t=>[t.sourceBotId,t.targetBotId].includes(botId)&&['queued','starting','running','waiting'].includes(t.status));
    if(patch.status!=='archived')return this.directory.updateBot(botId,patch);
    if(busy()||this.directory.lifecycleLocks.has(botId))fail('BOT_BUSY');this.directory.lifecycleLocks.add(botId);
    try{await service?.store.tail;if(busy())fail('BOT_BUSY');return await this.directory.updateBot(botId,patch);}finally{this.directory.lifecycleLocks.delete(botId);}
  }
  async perform(input){
    if(input.action==='select-primary'){
      const bot=this.directory.list().bots.find(b=>b.id===input.botId);if(!bot)fail('BOT_NOT_FOUND');
      const runtime=this.getRuntime();if(!runtime)fail('BOT_PRIMARY_UNAVAILABLE');
      const stored=await runtime.snapshot(bot.homeSessionId);if(!stored)fail('BOT_SESSION_NOT_FOUND');
      if(stored.header?.origin==='subagent'||(stored.header?.delegationDepth??0)>0)fail('BOT_ROOT_SESSION_REQUIRED');
      if((this.workspaceRegistry??this.context?.get('workspaceRegistry'))?.archivedSessionIds?.includes(bot.homeSessionId))fail('BOT_PRIMARY_HOME_ARCHIVED');
      return this.directory.choosePrimary(bot.id,input.expectedRevision);
    }
    const existing=this.directory.primary();if(existing)return existing;
    const runtime=this.getRuntime();if(!runtime)fail('BOT_PRIMARY_UNAVAILABLE');
    let pending=this.directory.list().primarySetup;
    if(pending){if(pending.requestId!==input.requestId)fail('BOT_PRIMARY_PENDING');
      pending=await this.directory.reservePrimary({...input,cwd:pending.cwd,profile:pending.profile});
    }else{
      const registry=this.workspaceRegistry??this.context?.get('workspaceRegistry'),controller=this.workspaceController??this.context?.get('workspaceController');if(!registry)fail('BOT_WORKSPACE_REQUIRED');
      let workspace=input.workspaceId?registry.get(input.workspaceId):registry.list()[0];
      if(!workspace&&!input.workspaceId&&controller){await controller.initializeDefault(AbortSignal.timeout(10000));workspace=registry.list()[0];}
      if(!workspace||!path.isAbsolute(workspace.path??''))fail('BOT_WORKSPACE_REQUIRED');
      const selected=await this.agentPresets.resolve();
      const profile={agentPreset:selected.id,model:(this.agentDefaultModel??this.context?.get('agentDefaultModel')).currentSelection(),permissions:[]};
      pending=await this.directory.reservePrimary({...input,cwd:workspace.path,profile});
    }
    if(pending.already)return pending.bot;
    await runtime.ensure(pending.sessionId,{create:true,cwd:pending.cwd,profile:pending.profile});
    const stored=await runtime.snapshot(pending.sessionId);if(!stored)fail('BOT_PRIMARY_SESSION_PENDING');
    if(path.resolve(stored.header.cwd).toLocaleLowerCase()!==path.resolve(pending.cwd).toLocaleLowerCase())fail('BOT_WORKSPACE_MISMATCH');
    const registry=this.workspaceRegistry??this.context?.get('workspaceRegistry');
    const workspace=registry?.list().find(w=>path.resolve(w.path).toLocaleLowerCase()===path.resolve(pending.cwd).toLocaleLowerCase());
    if(!workspace)fail('BOT_WORKSPACE_REQUIRED');
    if(workspace.attachSession)await workspace.attachSession(pending.sessionId);
    return this.directory.completePrimary(pending.requestId);
  }
}

export function createBotTools(ctx,directory,operations){
  const membership=exec=>{if(!exec.agent)fail('BOT_CALLER_REQUIRED');return ctx.agentTeams.membership(exec.agent);};
  const lead=exec=>{const m=membership(exec);if(m.role!=='lead')fail('BOT_LEAD_REQUIRED');return m.root;};
  const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
  return [
    defineTool({name:'bot_directory',description:'Read the local owner\'s persistent Bot directory and this task\'s Bot. A Bot is a reusable agent or team identity across task Sessions, not a conversation title.',parameters:{},output,execute:(_args,exec)=>{const m=membership(exec);return {...directory.list(),currentBotId:directory.forSession(m.root.id)?.id??null};}}),
    defineTool({name:'bot_create',description:'Create a persistent Bot only when requested by the user. In the primary Bot, create a NEW employee identity with its own workspace and native home Session without binding or renaming the primary caller. Supply a stable idempotencyKey for retries. Choose name/kind/purpose from the user request, not fixed staff templates. Success is durable identity creation, not execution or external account provisioning; do not use shell/source edits.',parameters:{name:{type:'string',required:true},kind:{type:'string',enum:['agent','team'],required:true},purpose:{type:'string',required:true},idempotencyKey:{type:'string'}},output,execute:(args,exec)=>{
      const root=lead(exec);exec.signal?.throwIfAborted();const {idempotencyKey,...fields}=args,current=directory.forSession(root.id);
      if(current&&current.id===directory.primary()?.id){if(!operations)fail('BOT_PRIMARY_UNAVAILABLE');return operations.createBot({fields,requestId:idempotencyKey??exec.callId,expectedRevision:directory.list().revision},'primary:'+current.id);}
      return directory.create({sessionId:root.id,cwd:root.session.header.cwd,agentPreset:ctx.agentPresets.presetForSession(root.session)??undefined},fields);
    }}),
    defineTool({name:'bot_update',description:'Update name, responsibility, appearance or lifecycle using the current Bot revision. Omit targetBotId to update yourself. Only the account primary Bot may target other Bots. Archiving preserves history and is rejected while that Bot has active tasks; it does not stop tasks or delete files. Primary identity, model and permissions never change here.',parameters:{targetBotId:{type:'string'},expectedRevision:{type:'integer',required:true},name:{type:'string'},purpose:{type:'string'},status:{type:'string',enum:['active','archived']},avatarShape:{type:'string',enum:BOT_FORMS.map(f=>f.id)},avatarPalette:{type:'string',enum:BOT_PALETTES.map(p=>p.id)}},output,execute:(args,exec)=>{
      const root=lead(exec);exec.signal?.throwIfAborted();const caller=directory.forSession(root.id),{targetBotId,avatarShape,avatarPalette,...patch}=args;if(!caller)fail('BOT_NOT_BOUND');
      const target=targetBotId??caller.id;if(target!==caller.id&&caller.id!==directory.primary()?.id)fail('BOT_PRIMARY_MANAGER_REQUIRED');
      if(avatarShape||avatarPalette){if(!avatarShape||!avatarPalette)fail('BOT_INVALID_APPEARANCE');patch.appearance={shape:avatarShape,palette:avatarPalette};}
      return operations?operations.manageBot(target,patch):directory.updateBot(target,patch);
    }}),
    defineTool({name:'bot_use',description:'Associate this root task with an existing active Bot at the user\'s request. Use bot_directory first. This task must use the Bot\'s working directory and must not already belong to another Bot. No model, permissions or task contents are changed.',parameters:{botId:{type:'string',required:true},expectedRevision:{type:'integer',required:true}},output,execute:(args,exec)=>{const root=lead(exec);return directory.bind(args.botId,root.id,args.expectedRevision,root.session.header.cwd);}}),
  ];
}

export function installBots(ctx,{directory,collaborationOrigin}={}){
  return ctx.inject(['agents','agentTeams','agentPresets','sessions','sessionPersistence','tools','systemPrompt'],scope=>{
    const store=directory??new BotDirectory(path.join(process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),'naumi','bots.json'));
    let taskService;
    const taskRuntime=installBotTasks(scope,store,{onReady:service=>{taskService=service;}});
    const groupRuntime=installBotGroups(scope,store,()=>taskService);
    const employeeRuntime=installEmployees(scope,store,{collaborationOrigin});
    const primary=new PrimaryBotService({directory:store,context:scope,getRuntime:()=>taskService?.runtime,
      workspaceRegistry:scope.get?.('workspaceRegistry'),workspaceController:scope.get?.('workspaceController'),agentPresets:scope.agentPresets,agentDefaultModel:scope.get?.('agentDefaultModel'),getTasks:()=>taskService});
    const installed=new Map(),streams=new Set();
    const install=agent=>{
      if(installed.has(agent)||!scope.agentTeams.tryMembership(agent))return;const disposers=[];
      try{
        for(const tool of createBotTools(scope,store,primary))disposers.push(agent.ctx.tools.register(tool));
        disposers.push(agent.ctx.systemPrompt.section({name:'naumi:bots',order:agent.ctx.systemPrompt.getSectionOrder('TEAM_POLICY')+2,text:'Naumi has Thread and Bot navigation modes over the same Session engine. Only establish a persistent Bot when the user requests a reusable agent/team; use bot_create directly and choose its name and responsibilities yourself from that request. Creating a Bot is an existing product operation, not a software development task: do not search source code, run shell commands or edit internal files to create it. If creation fails, check bot_directory once for a saved identity, report the actual failure and stop this creation attempt; do not improvise a file-based replacement. A successful bot_create completes identity creation; report it concisely and wait for the user task, without additional setup interviews or claiming that external integrations were provisioned. Never promote every temporary teammate or ordinary chat into a Bot. Use bot_directory / bot_update / bot_use to manage the real directory. The primary Bot may create other Bots without changing its own identity, and manage a specific targetBotId using bot_update; only do so on the user request. Reuse creation idempotencyKey for retries. Never use bot_use to become an employee you just created. The name is not a model tool address. Starting a new task for an existing Bot creates another Session linked to the same Bot ID. Do not claim cross-session memory beyond the Bot purpose and the actually available linked resources/history.'}));
        disposers.push(agent.ctx.systemPrompt.context({name:'naumi:bot-identity',order:agent.ctx.systemPrompt.getContextOrder('TEAM_IDENTITY')+1,required:true,text:()=>{try{const m=scope.agentTeams.membership(agent),bot=store.forSession(m.root.id);return bot?`Persistent Naumi Bot: ${JSON.stringify({id:bot.id,name:bot.name,kind:bot.kind,purpose:bot.purpose,status:bot.status,isPrimary:store.primary()?.id===bot.id})}\nThis is the identity for this task; preserve its stable ID across tasks. Use bot_update for name/purpose changes, not a conversation-title rename. ${store.primary()?.id===bot.id?'You are this owner account primary reception Bot. Receive the user request, coordinate EXISTING Bots for independent work, promptly acknowledge durable dispatch and continue chatting. Amend the same task via bot_task_continue from its original sender Session. Do not create staff or external accounts unless requested; primary status grants no extra model, tool or filesystem permissions.':''}`:'';}catch{return '';}}}));
        installed.set(agent,()=>{for(const dispose of disposers.reverse())dispose();});
      }catch(error){for(const dispose of disposers.reverse())dispose();throw error;}
    };
    scope.on('agent/created',({agent})=>install(agent));scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);});
    for(const agent of scope.agents.list())install(agent);
    const admit=(req,res)=>{
      res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('X-Naumi-Bots-Contract','2');
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
        let input;try{input=z.discriminatedUnion('action',[
          z.object({action:z.literal('create'),requestId:z.uuid(),expectedRevision:z.number().int().nonnegative(),fields:creationFields}).strict(),
          z.object({action:z.literal('update'),botId:id,patch:updateFields}).strict(),
          z.object({action:z.literal('bind'),botId:id,sessionId:id,expectedRevision:revision}).strict(),
          z.object({action:z.literal('appearance'),botId:id,expectedRevision:revision,appearance:appearanceSchema}).strict(),
          z.object({action:z.literal('select-primary'),botId:id,expectedRevision:z.number().int().nonnegative()}).strict(),
          z.object({action:z.literal('create-primary'),requestId:z.uuid(),expectedRevision:z.number().int().nonnegative(),name,appearance:appearanceSchema.optional(),workspaceId:id.optional()}).strict(),
        ]).parse(JSON.parse(text));}catch{send(400,{error:'BOT_INVALID_REQUEST'});return;}
        if(input.action==='create'){send(200,await primary.createBot(input));return;}
        if(input.action==='update'){send(200,await primary.manageBot(input.botId,input.patch));return;}
        if(input.action==='appearance'){send(200,await store.appearance(input.botId,input.expectedRevision,input.appearance));return;}
        if(['create-primary','select-primary'].includes(input.action)){send(200,await primary.execute(input));return;}
        const header=scope.sessions.get(input.sessionId)?.header??(await scope.sessionPersistence.stat(input.sessionId))?.header;
        if(!header){send(404,{error:'BOT_SESSION_NOT_FOUND'});return;}
        if(header.origin==='subagent'||(header.delegationDepth??0)>0){send(403,{error:'BOT_ROOT_SESSION_REQUIRED'});return;}
        send(200,await store.bind(input.botId,input.sessionId,input.expectedRevision,header.cwd));
      }catch(error){const code=/^BOT_[A-Z_]+$/.test(error.message)?error.message:'BOT_DIRECTORY_UNAVAILABLE';send(/CONFLICT|ALREADY_SET|PRIMARY_PENDING/.test(code)?409:code==='BOT_NOT_FOUND'?404:code==='BOT_DIRECTORY_INVALID'||code==='BOT_DIRECTORY_UNAVAILABLE'||code==='BOT_PRIMARY_UNAVAILABLE'?503:400,{error:code});}
    }}));
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/bots/events',handler:(req,res)=>{
      if(!admit(req,res))return;if(req.method!=='GET'){res.writeHead(405).end();return;}
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Connection':'keep-alive','X-Accel-Buffering':'no'});
      const publish=()=>{if(!res.destroyed)res.write('data: changed\n\n');};publish();const unsubscribe=store.subscribe(publish);streams.add(res);
      const heartbeat=setInterval(()=>{if(!res.destroyed)res.write(': keepalive\n\n');},25000);heartbeat.unref?.();
      res.on('close',()=>{clearInterval(heartbeat);unsubscribe();streams.delete(res);});
    }}));
    scope.effect(()=>async()=>{await primary.tail;await groupRuntime.dispose();await employeeRuntime.dispose();await taskRuntime.dispose();for(const dispose of installed.values())dispose();installed.clear();for(const res of streams)res.end();streams.clear();await store.close();});
  });
}
