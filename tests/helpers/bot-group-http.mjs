import {EventEmitter} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {installBotGroups} from '../../plugins/naumi-enterprise/bot-groups.js';

export async function botGroupHttpFixture({management=false}={}) {
  const home = await mkdtemp(join(tmpdir(),'naumi-group-http-'));
  const bots = ['编辑','审稿','归档助手'].map((name,index) => ({id:`bot-${index}`,name,cwd:home,status:index === 2 ? 'archived' : 'active'}));
  const slots = new Map(), agents = new Map(), receipts = new Map(), tasks = [], effects = [], warnings = [];
  const events = new EventEmitter();
  const directory = {
    file:join(home,'bots.json'),
    list:() => ({bots}),
    forSession(sessionId) { return bots.find(bot => bot.id === this.groupSessionOwner?.(sessionId)); },
  };
  const runtime = {
    snapshot:async sessionId => agents.get(sessionId),
    profile:async bot => ({model:{model:bot.id}}),
    async ensure(sessionId, options) {
      const contexts = new Map(), tools=new Map(), sections=new Map();
      const systemPrompt = {getSectionOrder:()=>0,section(entry){sections.set(entry.name,entry);return()=>sections.delete(entry.name);},getContextOrder:() => 0,context(entry) { contexts.set(entry.name,entry); return () => contexts.delete(entry.name); }};
      const agent = {id:sessionId,options,contexts,tools,sections,ctx:{systemPrompt,...management?{tools:{register(tool){tools.set(tool.name,tool);return()=>tools.delete(tool.name);}}}:{}}};
      agents.set(sessionId,agent);
      events.emit('agent/created',{agent});
    },
    inspect:async (_sessionId,messageId) => receipts.get(messageId),
    async deliver(input) {
      const receipt = {seen:true,pending:true,input};
      receipts.set(input.messageId,receipt);
      return receipt;
    },
  };
  const scope = {
    ...management?{agentTeams:{tryMembership:agent=>({root:agent,role:'lead'}),membership:agent=>({root:agent,role:agent.role??'lead'})}}:{},
    agents:{list:() => [...agents.values()]},
    logger:{warn:code => warnings.push(code)},
    on:events.on.bind(events),
    effect(effect) { effects.push(effect()); },
    connection:{admit(req) {
      const kind = req.headers['x-fixture-principal'];
      return kind ? {peer:{principal:{kind}}} : {rejection:401};
    }},
    webServer:{register({path,handler}) { slots.set(path,handler); return () => slots.delete(path); }},
  };
  const taskRuntime = {runtime,store:{read:() => ({tasks})}};
  installBotGroups({inject:(_services,attach) => attach(scope)},directory,() => taskRuntime);

  async function call(url='/naumi/bot-groups',{body,method=body !== undefined ? 'POST' : 'GET',principal='owner',headers={}}={}) {
    const handler = slots.get(new URL(url,'http://localhost').pathname);
    const request = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]),{
      url,method,headers:{host:'localhost','x-fixture-principal':principal,...headers},
    });
    let status;
    const responseHeaders = {};
    let responseBody = '';
    const response = {
      destroyed:false,
      setHeader(name,value) { responseHeaders[name.toLowerCase()] = value; },
      writeHead(code) { status = code; return this; },
      end(value) { responseBody = value ?? ''; },
    };
    await handler(request,response);
    return {status,headers:responseHeaders,body:responseBody,json:responseBody ? JSON.parse(responseBody) : undefined};
  }

  function finish(messageId,text) {
    const receipt = receipts.get(messageId);
    if (!receipt) throw new Error('Unknown fixture message');
    receipts.set(messageId,{...receipt,pending:false,consumed:true,end:{kind:'completed'},text});
    events.emit('session/event',{id:receipt.input.sessionId},{type:'turn/end'});
  }

  return {events,bots,agents,receipts,tasks,warnings,directory,runtime,call,finish,
    async close() { for (const dispose of effects.reverse()) await dispose(); await rm(home,{recursive:true,force:true}); }};
}
