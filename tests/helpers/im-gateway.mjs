import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {IMStore} from '../../plugins/naumi-enterprise/im-store.js';
import {IMService} from '../../plugins/naumi-enterprise/im-service.js';
import {BotGroupStore} from '../../plugins/naumi-enterprise/bot-group-store.js';
import {BotGroupService} from '../../plugins/naumi-enterprise/bot-group-service.js';

export function imFixture(t){
 const home=mkdtempSync(join(tmpdir(),'naumi-im-')),file=join(home,'im.sqlite'),vault=new Map(),deliveries=[],sends=[],stops=[],sessions=new Map(),receipts=new Map(),handlers=new Map(),warnings=[],tasks=[],taskOutbox=[];
 const bots=[{id:'bot-a',name:'主管',status:'active',homeSessionId:'home-a',cwd:home},{id:'bot-b',name:'编辑',status:'active',homeSessionId:'home-b',cwd:home}];
 let store,service,sendError;
 const credentials={set:async(k,v)=>vault.set(k,v),unset:async k=>vault.delete(k),resolve:async k=>({value:vault.get(k)}),describe:async k=>({configured:vault.has(k),writable:true})};
 const directory={file:join(home,'bots.json'),list:()=>({bots}),forSession:id=>bots.find(b=>b.id===(groupStore.member(id)?.botId??store.bindings().find(b=>b.sessionId===id)?.target.id))};
 const runtime={profile:async bot=>({agentPreset:'preset-'+bot.id,model:{provider:'fixture',model:bot.id},permissions:[]}),snapshot:async id=>sessions.get(id)??null,
  ensure:async(id,options)=>{if(!sessions.has(id))sessions.set(id,{header:{cwd:home,agentPreset:options.profile?.agentPreset},events:[]});},
  inspect:async(_id,messageId)=>receipts.get(messageId)??null,
  deliver:async input=>{await runtime.ensure(input.sessionId,{profile:input.profile});if(!receipts.has(input.messageId)){deliveries.push(input);receipts.set(input.messageId,{seen:true,pending:true});}return receipts.get(input.messageId);},
  delivery:async()=>({status:'not_required',files:[]}),interrupt:async(sessionId,messageId)=>{stops.push({sessionId,messageId});const old=receipts.get(messageId);if(old&&!old.end){receipts.set(messageId,{...old,end:{kind:'cancelled'},text:''});return {interrupted:true};}return {interrupted:false};}};
 const taskService={runtime,store:{read:()=>({tasks,outbox:taskOutbox})}};
 const groupStore=new BotGroupStore(join(home,'groups.sqlite')),groups=new BotGroupService({directory,store:groupStore,getTasks:()=>taskService,onError:()=>warnings.push('GROUP')});
 const platforms=Object.fromEntries(['feishu','dingtalk'].map(platform=>[platform,{check:async()=>({account:{id:'fixture'}}),connect:(_fields,_env,h)=>{handlers.set(platform,h);h.onStatus({state:'ready'});return {send:async(chat,payload)=>{if(sendError){const e=sendError;sendError=null;throw e;}sends.push({platform,chat,payload});return {messageId:'sent-'+sends.length};},stop:()=>stops.push({platform})};},sendFile:async(_fields,_env,chat,file)=>{sends.push({platform,chat,file});return {messageId:'file'};}}]));
 const ctx={workspaceFiles:{stat:async(_scope,path)=>({absolutePath:path,bytes:3,version:'v1'}),readBytes:async()=>({data:Buffer.from('abc'),version:'v1'})}};
 function open(){store=new IMStore(file);service=new IMService({store,directory,getTasks:()=>taskService,getGroups:()=>groups,credentials,ctx,platforms,environment:()=>({}),onError:e=>warnings.push(e)});}
 open();
 t.after(async()=>{await service.close();await groups.close();rmSync(home,{recursive:true,force:true});});
 async function command(body){return service.execute({...body,expectedRevision:store.revision()});}
 async function connection(platform='feishu'){const id=randomUUID();await command({action:'save',id,platform,appId:randomUUID(),name:platform,secret:'fixture-secret'});await command({action:'enable',id,enabled:true});return id;}
 function event(data={}){return {chat:{key:'chat-1',kind:'direct',title:'IM 会话'},sender:{id:'user-1',name:'人类'},messageId:randomUUID(),text:'请处理',mentioned:true,images:[],...data};}
 async function pair(connectionId,target={kind:'bot',id:'bot-a'},data={}){const v=await command({action:'pair',connectionId,chatKind:target.kind==='bot'?'direct':'group',target});const e=event({chat:{key:randomUUID(),kind:target.kind==='bot'?'direct':'group',title:'工作群'},...data,text:'/pair '+v.pair.code});await service.receive(connectionId,e);await service.kick();return store.findBinding(connectionId,e.chat);}
 return {home,file,bots,vault,deliveries,sends,stops,sessions,receipts,handlers,warnings,tasks,taskOutbox,runtime,credentials,groups,ctx,directory,command,connection,pair,event,
  get store(){return store;},get service(){return service;},failSend(e){sendError=e;},
  async receive(connectionId,binding,text='请处理',extra={}){const e=event({chat:binding.chat,text,...extra});const input=await service.receive(connectionId,e);await service.kick();return input;},
  async reopen(){await service.close();open();await service.sync();},
  finish(input,text='实际回复'){receipts.set(input.messageId,{seen:true,pending:false,consumed:true,turn:1,end:{kind:'completed'},text});},
 };
}
