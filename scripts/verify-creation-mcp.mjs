import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {Context} from '@deepseek-ai/cordis';import {createScope} from '@deepseek-ai/dsh-scope';import Tools from '@deepseek-ai/dsh-tools';import SystemPrompt from '@deepseek-ai/dsh-system-prompt';import Skills from '@deepseek-ai/dsh-skill';import LocalFileSystem from '@deepseek-ai/dsh-fs-local';import {NativeToolExecutor} from '@deepseek-ai/dsh-tool-executor-native';import * as present from '@deepseek-ai/dsh-tool-present';import {Session} from '@deepseek-ai/dsh-session';
import {CreationSessions} from '../plugins/naumi-enterprise/creation-runtime.js';import {digest} from '../plugins/naumi-enterprise/creation-bundle.js';

// Real fixed CLI subprocess, official MCP client, scoped ToolRuntime and native present.
// Only Gateway/provider/host account authority is a bounded loopback fixture.
const out=path.resolve(process.env.CREATION_EVIDENCE??'evidence/creation-mcp'),root=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-creation-chain-'));fs.mkdirSync(out,{recursive:true});
const token='nmk_'+'a'.repeat(43),other='nmk_'+'b'.repeat(43),calls=new Map(),bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2F0sAAAAASUVORK5CYII=','base64');
let supplier=0,artworks=0,ledger=0,drop=true,deny=false;const seen=[];
const server=http.createServer(async(req,res)=>{
 const send=(v,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(v));};
 const auth=req.headers.authorization?.slice(7),account=auth===token?'a@example.test':auth===other?'b@example.test':null;seen.push({path:req.url,workspace:req.headers['x-naumi-workspace']??'',account});if(!account||deny)return send({error:{code:'UNAUTHORIZED',message:'fixture revoked',submitted:false}},401);
 if(req.url.endsWith('/me'))return send({account:{email:account},token:{id:account.startsWith('a')?'token-a':'token-b',scope:'write'},budget:{remaining:100},balance:100});
 if(req.url.endsWith('/tools'))return send({tools:[{name:'get_balance',write:false,billed:false,available:true,description:'fixture read',parameters:{type:'object',properties:{}}},{name:'generate_image',write:true,billed:true,available:true,description:'fixture write',parameters:{type:'object',properties:{prompt:{type:'string'}}}}]});
 if(req.url.includes('/media?')){res.writeHead(200,{'Content-Type':'image/png','Content-Length':bytes.length});res.end(bytes);return;}
 if(req.url.endsWith('/uploads')){for await(const _ of req){}return send({url:'media/fixture-input.png',artworkId:'fixture-upload'});}
 if(req.url.endsWith('/calls')&&req.method==='POST'){
  let text='';for await(const b of req)text+=b;const input=JSON.parse(text),id=auth+input.operationId;
  if(!calls.has(id)){supplier++;artworks++;ledger++;calls.set(id,{operationId:input.operationId,state:'succeeded',credits:8,output:{text:'fixture completed',media:['media/fixture-output.png']},domainOperation:input.arguments.operation_id});}
  if(drop){drop=false;req.socket.destroy();return;}
  res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.end(JSON.stringify({type:'result',call:calls.get(id)})+'\n');return;
 }
 if(req.url.includes('/calls/')){const id=auth+decodeURIComponent(req.url.split('/').at(-1));return calls.has(id)?send(calls.get(id)):send({error:{code:'OPERATION_NOT_FOUND',submitted:false}},404);}
 send({error:'unexpected'},404);
});await new Promise(r=>server.listen(0,'127.0.0.1',r));const site='http://127.0.0.1:'+server.address().port;
const home=path.join(root,'harness'),tokenFile=path.join(root,'runtime.token');fs.mkdirSync(home);fs.writeFileSync(tokenFile,token);
let selected={version:1,bindingId:randomUUID(),site,account:'a@example.test',workspace:'team-a',tokenId:'token-a',tokenFile,ownerRoot:root,tokenFileSha256:digest(token)};
const ctx=new Context(),agents=[],scopes=[],checks=[];let manager;
const check=(name,value)=>{assert(value,name);checks.push(name);console.log('CREATION_CHAIN_PASS '+name);};
try{
 const services=await ctx.plugin({name:'creation-fixture-authority',apply(c){c.provide('agents',{list:()=>agents,turnBoundaryOf:()=>({openTurnStartSeq:0,lastTurn:1})});c.provide('workingDirectory',{ensure:async agent=>agent.session.header.cwd});}});
 await ctx.plugin(SystemPrompt,{includeRuntimeContext:false});await ctx.plugin(Tools);await ctx.plugin(Skills);await ctx.plugin(LocalFileSystem);await ctx.plugin(present,{maxFiles:8});
 let scopedHost;await ctx.inject(['tools','skills','workingDirectory','agents','systemPrompt','fs'],c=>{scopedHost=c;});
 const make=id=>{const cwd=path.join(root,id);fs.mkdirSync(cwd);const session=Session.create(id,[],{...Session.create(id).header,cwd});session.append('turn/start',{turn:1});const a={id,session};const scope=createScope(scopedHost,a);a.ctx=scope.ctx;scopes.push(scope);agents.push(a);return a;};const a=make('session-a'),b=make('session-b');
 manager=new CreationSessions({ctx:scopedHost,home,readBinding:()=>selected});await Promise.all([manager.ensure(a),manager.ensure(b)]);
 const exec=async(agent,name,args={})=>{const batch=await new NativeToolExecutor(agent.ctx).execute({agent,signal:new AbortController().signal,calls:[{type:'tool-call',id:randomUUID(),name,arguments:JSON.stringify(args)}]});return batch.results[0].result;};
 let health;for(let i=0;i<50;i++){health=await manager.health(a);if(health.ready)break;await new Promise(r=>setTimeout(r,100));}check('actual_Harness_namespace_and_account_ready',health.ready&&health.tokenId==='token-a');
 check('namespace_never_global',!scopedHost.tools.definitions().some(t=>t.name.startsWith('mcp__naumi_creation__')));check('both_sessions_have_own_tools',b.ctx.tools.definitions(b).some(t=>t.name==='mcp__naumi_creation__naumi_call'));
 const discovery=await exec(a,'mcp__naumi_creation__naumi_tools');check('real_schema_discovery',discovery.value.structuredContent.tools.some(t=>t.name==='generate_image'));
 const reference=path.join(a.session.header.cwd,'reference.png');fs.writeFileSync(reference,bytes);const uploaded=await exec(a,'mcp__naumi_creation__naumi_upload_image',{path:reference});check('local_reference_upload_original_receipt',uploaded.value?.structuredContent?.url==='media/fixture-input.png');
 const input={tool:'generate_image',arguments:{prompt:'fixture',operation_id:'domain-original',image_urls:[uploaded.value.structuredContent.url]},operationId:randomUUID()};const lost=await exec(a,'mcp__naumi_creation__naumi_call',input);check('lost_reply_unknown_original_intent_durable',lost.isError&&manager.intents.read(selected,input.operationId).input.arguments.operation_id==='domain-original');
 const recovered=await exec(a,'mcp__naumi_creation__naumi_call_status',{operationId:input.operationId});check('original_UUID_reconciled',recovered.value.structuredContent.state==='succeeded');
 const replay=await exec(a,'mcp__naumi_creation__naumi_call',input);check('original_replay_no_duplicate_work',!replay.isError&&supplier===1&&artworks===1&&ledger===1);
 const conflict=await exec(a,'mcp__naumi_creation__naumi_call',{...input,arguments:{prompt:'changed'}});check('changed_payload_rejected_before_HTTP',conflict.isError&&supplier===1);
 const foreign=await exec(b,'mcp__naumi_creation__naumi_call_status',{operationId:input.operationId});check('other_session_cannot_recover_receipt',foreign.isError);
 const file=path.join(a.session.header.cwd,'result.png'),download=await exec(a,'mcp__naumi_creation__naumi_download_media',{url:'media/fixture-output.png',out:file}),receipt=download.value?.structuredContent;
 check('download_verified_bytes_and_hash',receipt?.bytes===bytes.length&&receipt.sha256===digest(bytes));
 const denyPresent=a.ctx.on('tools/pre-execute',async(exec,next)=>exec.name==='present'?{kind:'deny',reason:'fixture native policy'}:next());const denied=await exec(a,'naumi_present_download',{receipt:{path:receipt.path,bytes:receipt.bytes,sha256:receipt.sha256}});check('native_present_policy_is_not_bypassed',denied.isError&&!a.session.snapshotEvents().some(e=>e.type==='deliverables/presented'));denyPresent();
 const delivery=await exec(a,'naumi_present_download',{receipt:{path:receipt.path,bytes:receipt.bytes,sha256:receipt.sha256}});check('original_native_present_executor_event',!delivery.isError&&a.session.snapshotEvents().some(e=>e.type==='deliverables/presented'&&e.data.files[0].path===file));check('no_delivery_in_other_session',!b.session.snapshotEvents().some(e=>e.type==='deliverables/presented'));
 fs.appendFileSync(file,'changed');check('changed_file_rejected_before_present',(await exec(a,'naumi_present_download',{receipt:{path:receipt.path,bytes:receipt.bytes,sha256:receipt.sha256}})).isError);
 selected={...selected,workspace:'team-b',bindingId:randomUUID()};await manager.ensure(a);const cross=await exec(a,'mcp__naumi_creation__naumi_call_status',{operationId:input.operationId});check('changed_tenant_keeps_original_receipt_binding',cross.isError);
 const accountA=selected;fs.writeFileSync(tokenFile+'-b',other);selected={...selected,account:'b@example.test',tokenId:'token-b',bindingId:randomUUID(),tokenFile:tokenFile+'-b',tokenFileSha256:digest(other)};await manager.ensure(a);
 let switched;for(let i=0;i<50;i++){switched=await manager.health(a);if(switched.ready)break;await new Promise(r=>setTimeout(r,100));}check('account_switch_awaits_old_dispose_and_new_ready',switched.ready&&switched.account==='b@example.test');
 check('new_token_does_not_adopt_old_operation',(await exec(a,'mcp__naumi_creation__naumi_call_status',{operationId:input.operationId})).isError);
 check('stale_other_session_is_blocked_after_account_change',(await exec(b,'mcp__naumi_creation__naumi_tools')).isError);
 deny=true;check('revoked_authorization_not_ready',!(await manager.health(a)).ready);deny=false;
 await manager.remove(a);check('dispose_one_session_preserves_other',!a.ctx.tools.definitions(a).some(t=>t.name.startsWith('mcp__naumi_creation__'))&&b.ctx.tools.definitions(b).some(t=>t.name.startsWith('mcp__naumi_creation__')));
 await manager.disconnect();check('logout_disposes_all_without_remote_cancel',!b.ctx.tools.definitions(b).some(t=>t.name.startsWith('mcp__naumi_creation__'))&&supplier===1&&!seen.some(r=>/cancel|revoke/.test(r.path)));
 fs.writeFileSync(path.join(out,'HOST_CHAIN.json'),JSON.stringify({tier:'fixed client1.1.0 real stdio MCP+official Harness scoped ToolRuntime+native present+real Session; loopback Gateway/provider authority fixture, no production',checks,supplierFixtureRequests:supplier,artworkFixtureCount:artworks,ledgerFixtureCount:ledger,productionCalls:0,download:{bytes:receipt.bytes,sha256:receipt.sha256},globalPersonalTools:0},null,2)+'\n');
 console.log('CREATION_HOST_COMPLETE checks='+checks.length+' supplier_fixture=1 native_present=1 production=0');
}finally{await manager?.close();for(const scope of scopes)await scope.dispose();await ctx.fiber.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
