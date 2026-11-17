import {dirname,join} from 'node:path';
import {z} from 'zod';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {BotGroupStore} from './bot-group-store.js';
import {BotGroupService} from './bot-group-service.js';

const id = z.string().min(1).max(200);
const requestId = z.uuid();
const botIds = z.array(id).max(12).refine(ids => new Set(ids).size === ids.length);
const attachment=z.discriminatedUnion('type',[
  z.object({type:z.literal('file'),receiptId:id}).strict(),
  z.object({type:z.literal('image'),mediaType:z.enum(['image/png','image/jpeg','image/webp','image/gif']),data:z.string().max(48000),name:z.string().max(255).optional()}).strict(),
]);
const commands = z.discriminatedUnion('action', [
  z.object({action:z.literal('create'),id:requestId,name:z.string().trim().min(1).max(80),
    botIds:botIds.refine(ids => ids.length >= 2),defaultBotId:id.nullable()}).strict(),
  z.object({action:z.literal('post'),id:requestId,roomId:requestId,text:z.string().trim().max(8000),botIds,taskId:id.optional(),attachments:z.array(attachment).max(8).optional()}).strict()
    .refine(v=>v.text.length>0||v.attachments?.length),
  z.object({action:z.literal('prepare'),roomId:requestId}).strict(),
  z.object({action:z.literal('interrupt'),roomId:requestId,replyId:requestId}).strict(),
  z.object({action:z.literal('rename'),operationId:requestId,roomId:requestId,expectedName:z.string().min(1).max(80),name:z.string().trim().min(1).max(80).refine(v=>!/[\u0000-\u001f\u007f]/.test(v))}).strict(),
]);

export function createBotGroupTools(ctx,service){
 const member=exec=>{if(!exec.agent)throw Error('BOT_GROUP_CALLER_REQUIRED');return ctx.agentTeams.membership(exec.agent);};
 const output={schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]};
 return [
  defineTool({name:'bot_group_list',description:'List the local owner chat groups and their exact IDs, names and members. Use this before renaming a group. Group identity is separate from Bot names and conversation titles. If names are ambiguous, ask which group; do not guess or use desktop/browser automation.',parameters:{},output,execute:(_args,exec)=>{const m=member(exec);exec.signal?.throwIfAborted();return {rooms:service.store.rooms(),currentRoomId:service.store.member(m.root.id)?.roomId??null};}}),
  defineTool({name:'bot_group_rename',description:'Rename an existing chat group directly at the user request. Read bot_group_list first, use its exact roomId and current name as expectedName, and supply a new UUID operationId. Retry the SAME operationId and payload after a lost reply. On conflict read the list again; never overwrite a newer name blindly. This changes only the group display name, preserving messages, members, sessions and tasks. Do not operate the GUI or edit files to rename a group.',parameters:{roomId:{type:'string',required:true},expectedName:{type:'string',required:true},name:{type:'string',required:true},operationId:{type:'string',required:true}},output,execute:(args,exec)=>{const m=member(exec);if(m.role!=='lead')throw Error('BOT_GROUP_LEAD_REQUIRED');exec.signal?.throwIfAborted();let input;try{input=commands.parse({action:'rename',...args});}catch{throw Error('BOT_GROUP_INVALID_REQUEST');}return service.rename(input,{kind:'agent',sessionId:m.root.id});}}),
 ];
}

export function installBotGroups(ctx, directory, getTasks) {
  return ctx.inject(['agents','webServer','connection','systemPrompt'], scope => {
    let store;
    try { store = new BotGroupStore(join(dirname(directory.file), 'bot-groups.sqlite')); }
    catch { scope.logger.warn('BOT_GROUP_STORAGE_UNAVAILABLE'); return; }
    const service = new BotGroupService({directory,store,getTasks,onError:() => scope.logger.warn('BOT_GROUP_BACKGROUND_ERROR')});
    const alignPrimary=()=>service.alignPrimary();
    alignPrimary();
    scope.effect(()=>directory.subscribe?.(alignPrimary)??(()=>{}));
    const resolveOwner = sessionId => store.member(sessionId)?.botId;
    directory.groupSessionOwner = resolveOwner;
    const installed = new Map();
    const install = agent => {
      if (installed.has(agent)) return;
      const disposers=[];
      if(scope.agentTeams?.tryMembership(agent)&&agent.ctx.tools){
        for(const tool of createBotGroupTools(scope,service))disposers.push(agent.ctx.tools.register(tool));
        disposers.push(agent.ctx.systemPrompt.section({name:'naumi:group-management',order:agent.ctx.systemPrompt.getSectionOrder('TEAM_POLICY')+3,text:'Chat group names are managed by bot_group_list and bot_group_rename. When the user asks to rename a group, use those tools directly, including from a Bot private chat. Do not use desktop/browser tools, screenshots, shell commands, source searches or file edits for group naming. Group rename is not bot_update or conversation-title rename. Resolve duplicate names by asking the user; report the returned current name only after the persisted operation succeeds.'}));
      }
      if(store.member(agent.id))disposers.push(agent.ctx.systemPrompt.context({name:'naumi:bot-group',required:true,
        order:agent.ctx.systemPrompt.getContextOrder('TEAM_IDENTITY')+4,text:() => service.context(agent.id)}));
      if(disposers.length)installed.set(agent,()=>{for(const dispose of disposers.reverse())dispose();});
    };
    scope.on('agent/created', ({agent}) => install(agent));
    scope.on('agent/disposed', ({agent}) => { installed.get(agent)?.(); installed.delete(agent); });
    scope.on('session/event', (session,event) => { if (event.type === 'turn/end' && store.member(session.id)) void service.kick(); });
    scope.on('agent/status', ({agent,status}) => { if (status === 'idle' && store.member(agent.id)) void service.kick(); });
    for (const agent of scope.agents.list()) install(agent);
    scope.effect(() => {
      const timer = setInterval(() => { if (store.pending().length) void service.kick(); }, 2000);
      timer.unref?.();
      void service.kick();
      return async () => {
        clearInterval(timer);
        for (const dispose of installed.values()) dispose();
        installed.clear();
        if (directory.groupSessionOwner === resolveOwner) delete directory.groupSessionOwner;
        await service.close();
      };
    });
    scope.effect(() => scope.webServer.register({kind:'exact',path:'/naumi/bot-groups',handler:async (req,res) => {
      res.setHeader('Cache-Control','private, no-store');
      res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('X-Naumi-Group-Collaboration','1');
      const admission = scope.connection.admit(req);
      if ('rejection' in admission) { res.writeHead(admission.rejection).end(); return; }
      if (admission.peer.principal.kind !== 'owner') { res.writeHead(403).end(); return; }
      res.setHeader('Content-Type','application/json; charset=utf-8');
      const send = (status,data) => { if (!res.destroyed) res.writeHead(status).end(JSON.stringify(data)); };
      try {
        if (req.method === 'GET') {
          const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
          const roomId = query.get('roomId');
          const rawBefore = query.get('before');
          const before = rawBefore === null ? undefined : Number(rawBefore);
          if (roomId !== null && (!requestId.safeParse(roomId).success || before !== undefined && (!Number.isSafeInteger(before) || before <= 0))) {
            send(400,{error:'BOT_GROUP_INVALID_REQUEST'}); return;
          }
          send(200,roomId === null ? {rooms:store.rooms()} : service.read(roomId,before)); return;
        }
        if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); send(405,{error:'BOT_GROUP_METHOD'}); return; }
        if (req.headers['x-naumi-bot-groups'] !== '1' || req.headers.origin && ![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)) {
          send(403,{error:'BOT_GROUP_SAME_ORIGIN_REQUIRED'}); return;
        }
        if (!getTasks()) { send(503,{error:'BOT_GROUP_UNAVAILABLE'}); return; }
        let size = 0;
        const chunks = [];
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) { send(413,{error:'BOT_GROUP_REQUEST_TOO_LARGE'}); return; }
          chunks.push(chunk);
        }
        let input;
        try { input = commands.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { send(400,{error:'BOT_GROUP_INVALID_REQUEST'}); return; }
        if(input.action==='create'){send(200,service.create(input));return;}
        if(input.action==='rename'){send(200,service.rename(input));return;}
        if(input.action==='prepare'){send(200,await service.prepare(input.roomId));return;}
        if(input.action==='interrupt'){send(200,await service.interrupt(input.roomId,input.replyId));return;}
        const requestAttachments=input.attachments??[];
        if(store.hasPost(input.id)){
          send(202,service.post({...input,attachments:[],requestAttachments}));return;
        }
        if(requestAttachments.length){
          // Resolve receipts only in the actual native composer's Session, never
          // accept a filesystem path or another Session's upload grant.
          const {sessionId}=await service.prepare(input.roomId);
          const prepared=await getTasks().runtime.admitGroupAttachments(sessionId,requestAttachments,input.id);
          try{const value=service.post({...input,attachments:prepared.content,requestAttachments});prepared.commit();send(202,value);}
          finally{prepared.dispose();}
        }else send(202,service.post(input));
      } catch (error) {
        const code = /^BOT_GROUP_[A-Z_]+$/.test(error.message) ? error.message : 'BOT_GROUP_UNAVAILABLE';
        send(code === 'BOT_GROUP_CONFLICT' ? 409 : code === 'BOT_GROUP_NOT_FOUND' ? 404 : code === 'BOT_GROUP_UNAVAILABLE' ? 503 : 400,{error:code});
      }
    }}));
  });
}
