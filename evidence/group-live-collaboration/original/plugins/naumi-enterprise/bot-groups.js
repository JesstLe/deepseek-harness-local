import {dirname,join} from 'node:path';
import {z} from 'zod';
import {BotGroupStore} from './bot-group-store.js';
import {BotGroupService} from './bot-group-service.js';

const id = z.string().min(1).max(200);
const requestId = z.uuid();
const botIds = z.array(id).max(12).refine(ids => new Set(ids).size === ids.length);
const commands = z.discriminatedUnion('action', [
  z.object({action:z.literal('create'),id:requestId,name:z.string().trim().min(1).max(80),
    botIds:botIds.refine(ids => ids.length >= 2),defaultBotId:id.nullable()}).strict(),
  z.object({action:z.literal('post'),id:requestId,roomId:requestId,text:z.string().trim().min(1).max(8000),botIds}).strict(),
]);

export function installBotGroups(ctx, directory, getTasks) {
  return ctx.inject(['agents','webServer','connection','systemPrompt'], scope => {
    let store;
    try { store = new BotGroupStore(join(dirname(directory.file), 'bot-groups.sqlite')); }
    catch { scope.logger.warn('BOT_GROUP_STORAGE_UNAVAILABLE'); return; }
    const service = new BotGroupService({directory,store,getTasks,onError:() => scope.logger.warn('BOT_GROUP_BACKGROUND_ERROR')});
    const resolveOwner = sessionId => store.member(sessionId)?.botId;
    directory.groupSessionOwner = resolveOwner;
    const installed = new Map();
    const install = agent => {
      if (installed.has(agent) || !store.member(agent.id)) return;
      installed.set(agent, agent.ctx.systemPrompt.context({name:'naumi:bot-group',required:true,
        order:agent.ctx.systemPrompt.getContextOrder('TEAM_IDENTITY')+4,text:() => service.context(agent.id)}));
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
        send(input.action === 'create' ? 200 : 202, input.action === 'create' ? service.create(input) : service.post(input));
      } catch (error) {
        const code = /^BOT_GROUP_[A-Z_]+$/.test(error.message) ? error.message : 'BOT_GROUP_UNAVAILABLE';
        send(code === 'BOT_GROUP_CONFLICT' ? 409 : code === 'BOT_GROUP_NOT_FOUND' ? 404 : code === 'BOT_GROUP_UNAVAILABLE' ? 503 : 400,{error:code});
      }
    }}));
  });
}
