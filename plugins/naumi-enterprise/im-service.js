import {randomBytes,randomUUID} from 'node:crypto';
import {basename} from 'node:path';
import {z} from 'zod';
import {IMDelivery} from './im-delivery.js';
import {IM_PLATFORMS,platformEnvironment} from './im-platforms.js';
import {validateFiles} from './bot-deliverables.js';
import {IMInteractions} from './im-interactions.js';

const id=z.string().min(1).max(200).refine(v=>!/[\u0000-\u001f\u007f]/.test(v));
const target=z.object({kind:z.enum(['bot','group']),id}).strict();
const base={expectedRevision:z.number().int().nonnegative()};
const schema=z.discriminatedUnion('action',[
  z.object({action:z.literal('save'),...base,id:z.uuid(),platform:z.enum(['dingtalk','feishu']),name:z.string().trim().min(1).max(80),appId:id,domain:z.enum(['feishu','lark']).optional(),secret:z.string().trim().min(1).max(4096).optional()}).strict(),
  z.object({action:z.literal('enable'),...base,id:z.uuid(),enabled:z.boolean()}).strict(),
  z.object({action:z.literal('check'),...base,id:z.uuid()}).strict(),
  z.object({action:z.literal('pair'),...base,connectionId:z.uuid(),chatKind:z.enum(['direct','group']),target}).strict(),
  z.object({action:z.literal('binding'),...base,id:z.uuid(),active:z.boolean(),users:z.array(id).min(1).max(100)}).strict(),
  z.object({action:z.literal('resolve'),...base,id:z.uuid(),received:z.boolean(),confirm:z.literal(true)}).strict(),
]);
const incoming=z.object({chat:z.object({key:id,kind:z.enum(['direct','group']),title:z.string().max(500).optional()}),sender:z.object({id,name:z.string().optional()}),messageId:id,text:z.string().max(8000),mentioned:z.boolean().optional(),threadId:z.string().optional(),unsupported:z.boolean().optional(),images:z.array(z.object({mediaType:z.enum(['image/png','image/jpeg','image/webp','image/gif']),data:z.string().max(7*1024*1024)})).max(4).default([]),files:z.array(z.unknown()).max(0).optional()});
const fail=code=>{throw Error(code);};

export class IMService{
  constructor({store,directory,getTasks,getGroups,credentials,ctx,platforms=IM_PLATFORMS,environment=platformEnvironment,onError=()=>{}}){
    Object.assign(this,{store,directory,getTasks,getGroups,credentials,ctx,platforms,environment,onError});
    this.connections=new Map();this.status=new Map();this.waiters=new Map();this.serial=Promise.resolve();this.closed=false;this.store.recover();
    this.delivery=new IMDelivery({store,getHandle:id=>this.connections.get(id)?.handle,sendFile:row=>this.sendFile(row)});
    this.interactions=new IMInteractions(this);
  }
  async read(){return {revision:this.store.revision(),connections:await Promise.all(this.store.connections().map(async c=>({id:c.id,name:c.name,platform:c.platform,appId:c.appId,domain:c.domain,enabled:c.enabled,configured:!!(await this.credentials.describe(c.secretRef))?.configured,state:this.status.get(c.id)??'disabled'}))),
    bindings:this.store.bindings(),outbox:this.store.outputs().filter(v=>['unknown','failed'].includes(v.state)).map(v=>({id:v.id,bindingId:v.bindingId,state:v.state,error:v.error})),
    bots:this.directory.list().bots.filter(b=>b.status==='active').map(({id,name})=>({id,name})),groups:this.getGroups()?.store.rooms().map(({id,name})=>({id,name}))??[]};}
  execute(input){const run=this.serial.then(()=>this.command(schema.parse(input)));this.serial=run.catch(()=>{});return run;}
  assertTarget(value,kind){
    if(kind==='direct'&&value.kind!=='bot'||kind==='group'&&value.kind!=='group')fail('IM_TARGET_KIND');
    if(value.kind==='bot'&&!this.directory.list().bots.some(b=>b.id===value.id&&b.status==='active'))fail('IM_BOT_NOT_FOUND');
    if(value.kind==='group'&&!this.getGroups()?.store.room(value.id))fail('IM_GROUP_NOT_FOUND');
    // A local group has one external source, avoiding cross-platform group history disclosure.
    if(value.kind==='group'&&this.store.bindings().some(b=>b.active&&b.target.kind==='group'&&b.target.id===value.id))fail('IM_GROUP_ALREADY_BOUND');
  }
  async command(p){
    if(this.closed)fail('IM_CLOSED');if(this.store.revision()!==p.expectedRevision)fail('IM_CONFLICT');
    if(p.action==='save'){
      const old=this.store.connection(p.id);if(old&&(old.platform!==p.platform||old.appId!==p.appId||old.domain!==(p.domain??'feishu')))fail('IM_ACCOUNT_IMMUTABLE');
      if(this.store.connections().some(c=>c.id!==p.id&&c.platform===p.platform&&c.appId===p.appId&&c.domain===(p.domain??'feishu')))fail('IM_ACCOUNT_EXISTS');
      if(!old?.secretRef&&!p.secret)fail('IM_SECRET_REQUIRED');
      const ref=p.secret?'NAUMI_IM_'+randomUUID().replaceAll('-','').toUpperCase():old.secretRef;
      if(p.secret)await this.credentials.set(ref,p.secret);
      try{this.store.configure(p.expectedRevision,()=>this.store.saveConnection({id:p.id,platform:p.platform,name:p.name,appId:p.appId,domain:p.domain??'feishu',secretRef:ref,enabled:old?.enabled??false}));}
      catch(e){if(p.secret)await this.credentials.unset(ref);throw e;}
      // Keep no orphan secret on successful rotation; no in-flight callback can use the new config before sync().
      if(p.secret&&old?.secretRef)await this.credentials.unset(old.secretRef).catch(()=>{});
      await this.sync();
    }else if(p.action==='enable'){
      const c=this.store.connection(p.id);if(!c)fail('IM_NOT_FOUND');if(p.enabled&&!(await this.credentials.describe(c.secretRef))?.configured)fail('IM_SECRET_REQUIRED');
      this.store.configure(p.expectedRevision,()=>this.store.saveConnection({...c,enabled:p.enabled}));await this.sync();
    }else if(p.action==='check'){
      const c=this.store.connection(p.id);if(!c)fail('IM_NOT_FOUND');const {fields,env}=await this.material(c);
      try{await this.platforms[c.platform].check(fields,env);}catch{fail('IM_CHECK_FAILED');}
      return {...await this.read(),checked:p.id};
    }else if(p.action==='pair'){
      const c=this.store.connection(p.connectionId);if(!c?.enabled)fail('IM_CONNECTION_DISABLED');this.assertTarget(p.target,p.chatKind);
      const code=randomBytes(12).toString('hex').toUpperCase(),expires=Date.now()+600000;
      this.store.configure(p.expectedRevision,()=>this.store.issuePair({connectionId:p.connectionId,chatKind:p.chatKind,target:p.target,expires},code));
      return {...await this.read(),pair:{code,expires}};
    }else if(p.action==='binding'){
      const b=this.store.binding(p.id);if(!b)fail('IM_NOT_FOUND');
      // Re-enabling requires a new external pairing, not resurrecting a revoked authority.
      if(p.active&&!b.active)fail('IM_PAIR_REQUIRED');
      this.store.configure(p.expectedRevision,()=>this.store.saveBinding({...b,active:p.active,users:[...new Set(p.users)],revision:b.revision+1}));this.expireInvalid();
    }else if(p.action==='resolve'){
      const row=this.store.output(p.id);if(!row||!['unknown','failed'].includes(row.state))fail('IM_NOT_FOUND');
      this.store.configure(p.expectedRevision,()=>this.store.updateOutput(p.id,{state:p.received?'sent':'queued',error:null,nextAt:0,resolvedBy:'owner',resolvedAt:new Date().toISOString()}));
    }
    void this.kick();return this.read();
  }
  async material(c){const secret=(await this.credentials.resolve(c.secretRef))?.value;if(!secret)fail('IM_SECRET_REQUIRED');return {fields:c.platform==='dingtalk'?{clientId:c.appId,clientSecret:secret}:{appId:c.appId,appSecret:secret,domain:c.domain},env:this.environment(c.platform)};}
  async sync(){
    for(const [id,live] of this.connections){const c=this.store.connection(id);if(!c?.enabled||JSON.stringify(c)!==live.signature){live.handle.stop();this.connections.delete(id);this.status.set(id,'disabled');}}
    for(const c of this.store.connections().filter(c=>c.enabled)){
      if(this.closed||this.connections.has(c.id))continue;
      try{
        const {fields,env}=await this.material(c);if(this.closed)break;
        const live={fields,env,signature:JSON.stringify(c)};this.connections.set(c.id,live);
        const current=()=>!this.closed&&this.connections.get(c.id)===live;
        live.handle=this.platforms[c.platform].connect(fields,env,{
          onMessage:event=>current()?this.receive(c.id,event):Promise.resolve(),
          onAction:event=>current()?this.action(c.id,event):Promise.resolve(),
          onStatus:event=>{if(current()){this.status.set(c.id,['connecting','ready','retrying','error'].includes(event.state)?event.state:'error');if(event.state==='ready')void this.kick();}},
        });
      }catch{this.connections.delete(c.id);this.status.set(c.id,'error');}
    }
    this.expireInvalid();
  }
  async receive(connectionId,raw){
    if(this.closed||!this.store.connection(connectionId)?.enabled)return;
    const parsed=incoming.safeParse(raw);if(!parsed.success)return;const event=parsed.data;
    if(event.chat.kind==='group'&&!event.mentioned)return;
    // Upstream protocols now expose thread/type metadata. Unsupported inputs are never silently sent as text.
    if(event.threadId||event.unsupported||!event.text.trim()&&!event.images.length)return;
    const pair=/^\/pair\s+([A-F0-9]{24})$/i.exec(event.text.trim());
    if(pair){
      try{const b=this.store.pair(connectionId,event,pair[1].toUpperCase(),p=>this.assertTarget(p.target,p.chatKind));const input={...b,bindingId:b.id,bindingRevision:b.revision,userId:event.sender.id};this.delivery.text(input,'pair:'+b.id+':'+b.revision,'已连接');void this.kick();}catch(e){if(!/^IM_/.test(e.message))throw e;}
      return;
    }
    const b=this.store.findBinding(connectionId,event.chat);if(!b?.active||!b.users.includes(event.sender.id))return;
    const input=this.store.admit(b,event);void this.kick();return input;
  }
  kick(){
    if(this.closed)return Promise.resolve();if(this.running){this.again=true;return this.running;}
    this.running=Promise.resolve().then(async()=>{do{this.again=false;await this.pump();}while(this.again&&!this.closed);}).catch(()=>this.onError('IM_BACKGROUND_ERROR')).finally(()=>{this.running=null;});return this.running;
  }
  async pump(){
    const runtime=this.getTasks()?.runtime;if(!runtime)return;
    for(const input of this.store.inputs(['queued','dispatching','accepted'])){
      if(this.closed)break;
      if(!this.store.valid(input)){this.store.updateInput(input.id,{state:'revoked'});continue;}
      try{
        if(['queued','dispatching'].includes(input.state)){
          if(input.text.trim()==='/stop'){await this.stop(input);this.store.updateInput(input.id,{state:'settled'});continue;}
          if(input.text.trim().startsWith('/answer ')){await this.interactions.text(input);this.store.updateInput(input.id,{state:'settled'});continue;}
          this.store.updateInput(input.id,{state:'dispatching'});
          if(input.target.kind==='bot'){
            const bot=this.directory.list().bots.find(b=>b.id===input.target.id&&b.status==='active');if(!bot)fail('IM_BOT_NOT_FOUND');
            const profile=await runtime.snapshot(input.sessionId)?undefined:await runtime.profile(bot);
            await runtime.deliver({sessionId:input.sessionId,messageId:input.messageId,fromUser:true,text:input.text,content:input.images.map(v=>({type:'image',...v})),mode:'followup',create:true,cwd:bot.cwd,...profile?{profile}:{}});
          }else{
            const groups=this.getGroups();if(!groups)fail('IM_GROUP_UNAVAILABLE');
            groups.post({id:input.messageId,roomId:input.target.id,text:input.text,botIds:[],attachments:input.images.map(v=>({type:'image',...v}))});
          }
          this.store.updateInput(input.id,{state:'accepted'});
        }
        if(input.target.kind==='bot'){
          const state=await runtime.inspect(input.sessionId,input.messageId);
          if(state?.end){const files=await runtime.delivery(input.sessionId,input.messageId);this.store.write(()=>{this.delivery.text(input,'reply:'+input.id,state.text||'回复已结束：'+state.end.kind);this.delivery.files(input,'reply:'+input.id,files.files);this.store.updateInput(input.id,{state:'settled',turn:state.turn});});}
        }else{
          const post=this.getGroups()?.readPost(input.target.id,input.messageId);
          if(post){
            for(const reply of post.replies)if(['completed','failed','cancelled','interrupted'].includes(reply.state)){
              const bot=this.directory.list().bots.find(b=>b.id===reply.botId);
              this.delivery.text(input,'group:'+reply.id,`${bot?.name??'Bot'}\n\n${reply.text||reply.state}`);
              if(reply.state==='completed'){const files=await runtime.delivery(reply.sessionId,reply.id);this.delivery.files(input,'group:'+reply.id,files.files);}
            }
            if(post.replies.every(r=>['completed','failed','cancelled','interrupted'].includes(r.state)))this.store.updateInput(input.id,{state:'settled'});
          }
        }
      }catch(e){
        // Native stable receipt permits a retry after a transport/storage interruption without replaying a consumed input.
        const known=/^(?:IM_|BOT_)/.test(e.message);
        if(known){this.store.write(()=>{this.delivery.text(input,'error:'+input.id,'消息处理失败：'+e.message);this.store.updateInput(input.id,{state:'failed',error:e.message});});}
        else this.onError('IM_NATIVE_PENDING');
      }
    }
    await this.tasks();this.expireInvalid();await this.delivery.pump();
  }
  async stop(input){
    const candidates=this.store.inputs(['dispatching','accepted']).filter(v=>v.id!==input.id&&v.bindingId===input.bindingId&&v.bindingRevision===input.bindingRevision&&v.userId===input.userId);
    let previous;
    for(const v of candidates){if(v.target.kind==='bot'){const state=await this.getTasks().runtime.inspect(v.sessionId,v.messageId);if(state?.consumed&&!state.end){previous=v;break;}}}
    previous??=candidates.at(-1);
    let stopped=false;
    if(previous?.target.kind==='bot')stopped=!!(await this.getTasks().runtime.interrupt(previous.sessionId,previous.messageId)).interrupted;
    else if(previous){for(const r of this.getGroups().readPost(previous.target.id,previous.messageId)?.replies??[])if(['queued','starting','sent'].includes(r.state))stopped=!!(await this.getGroups().interrupt(previous.target.id,r.id)).interrupted||stopped;}
    this.delivery.text(input,'stop:'+input.id,stopped?'已停止当前回复':'当前没有可停止的回复');
  }
  async tasks(){
    const doc=this.getTasks()?.store.read();if(!doc)return;
    const origin=(task,seen=new Set())=>{if(seen.has(task.id))return null;seen.add(task.id);const source=task.amendment?.source??task.intent?.source;let value=source&&this.inputForSource(source);if(!value&&!source&&task.parentTaskId){const parent=doc.tasks.find(t=>t.id===task.parentTaskId);if(parent)value=origin(parent,seen);}return value;};
    for(const task of doc.tasks){
      const input=origin(task);if(!input||!this.store.valid(input))continue;
      for(const m of doc.outbox.filter(m=>m.taskId===task.id&&m.fromSessionId===task.targetSessionId&&m.toSessionId===task.sourceSessionId)){
        if(m.kind==='result'&&!m.key.startsWith('finish:'))continue;
        this.delivery.text(input,'task:'+m.id,`${this.directory.list().bots.find(b=>b.id===task.targetBotId)?.name??'Bot'} · ${m.kind}\n\n${m.text}`);
        this.delivery.files(input,'task:'+m.id,m.files);
      }
    }
  }
  inputForSource(source){return this.store.inputs().find(v=>v.target.kind==='bot'?v.messageId===source.messageId&&v.sessionId===source.sessionId:(this.getGroups()?.readPost(v.target.id,v.messageId)?.replies??[]).some(r=>r.id===source.messageId&&r.sessionId===source.sessionId));}
  action(connectionId,event){return this.interactions.action(connectionId,event);}
  async sendFile(row){
    const ref=row.payload.ref,live=this.connections.get(row.connectionId),runtime=this.getTasks().runtime;
    if(!live||!this.store.valid(row))throw Object.assign(Error('IM_REVOKED'),{permanent:true});
    const source=await runtime.snapshot(ref.sessionId),event=source?.events.find(e=>e.type==='deliverables/presented'&&e.seq===ref.seq&&e.data.turn===ref.turn),file=event?.data.files[ref.index];
    if(!file||file.path!==ref.path)throw Object.assign(Error('IM_FILE_REFERENCE'),{permanent:true});
    let data;
    try{
      const [stat]=await validateFiles(this.ctx,{id:ref.sessionId,header:source.header},[file],AbortSignal.timeout(10000));
      if(stat.version!==ref.version||stat.bytes>10*1024*1024)fail('IM_FILE_STALE');
      const bytes=await this.ctx.workspaceFiles.readBytes({sessionId:ref.sessionId,workspaceRoot:source.header.cwd},file.path,{},AbortSignal.timeout(15000));
      if(bytes.version!==ref.version||bytes.data.length>10*1024*1024)fail('IM_FILE_STALE');
      if(!this.store.valid(row))fail('IM_REVOKED');
      data=bytes.data;
    }catch(e){e.permanent=true;throw e;}
    return this.platforms[this.store.connection(row.connectionId).platform].sendFile(live.fields,live.env,row.chat,{name:basename(file.path),data});
  }
  async activeOrigin(sessionId){
    const runtime=this.getTasks()?.runtime;if(!runtime)return null;
    const snapshot=await runtime.snapshot(sessionId),turn=snapshot?.events.findLast(e=>e.type==='turn/start')?.data.turn;
    if(!turn||snapshot.events.some(e=>e.type==='turn/end'&&e.data.turn===turn))return null;
    const candidates=[];
    for(const v of this.store.inputs(['accepted','dispatching','settled'])){
      const ids=v.target.kind==='bot'?[{sessionId:v.sessionId,id:v.messageId}]:(this.getGroups()?.readPost(v.target.id,v.messageId)?.replies??[]);
      for(const r of ids)if(r.sessionId===sessionId){const state=await runtime.inspect(sessionId,r.id);if(state?.turn===turn&&this.store.valid(v))candidates.push(v);}
    }
    // Coalesced inputs from different senders must never yield an arbitrary approval authority.
    if(candidates.length&&new Set(candidates.map(v=>v.bindingId+'\0'+v.userId)).size===1)return candidates.at(-1);
    const task=this.getTasks().store.read().tasks.find(t=>t.targetSessionId===sessionId);
    const source=task?.intent?.source;const input=source&&this.inputForSource(source);
    return input&&this.store.valid(input)?input:null;
  }
  expireInvalid(){for(const v of this.store.interactions().filter(v=>v.state==='open'))if(v.expires<Date.now()||!this.store.valid(v)){this.store.saveInteraction({...v,state:'expired'});this.waiters.get(v.id)?.cancel();}}
  async close(){this.closed=true;for(const v of this.connections.values())v.handle.stop();this.connections.clear();for(const w of this.waiters.values())w.cancel();await this.serial;await this.running;this.store.close();}
}
