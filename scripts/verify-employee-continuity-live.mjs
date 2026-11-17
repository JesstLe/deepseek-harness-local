// Explicit --live only. Own random-port Harness/home/Bots; no actual3080 writes.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {parse,stringify} from 'yaml';

const root=process.cwd(),runtime=path.resolve(process.argv[3]??'E:/Workspace/naumi-desktop'),out=path.join(root,'evidence/employee-continuity');
assert(['--prepare','--live'].includes(process.argv[2]),'EXPLICIT_PREPARE_OR_LIVE_REQUIRED');
const paths=['.dsh/cordis.patch.yml','.dsh/profiles/web/cordis.patch.yml','.dsh/.credentials.yaml'],raw=paths.map(p=>fs.readFileSync(path.join(runtime,p))),hash=b=>createHash('sha256').update(b).digest('hex');
const config=parse(raw[1].toString()),selection=config.find(c=>c.id==='agent-default-model')?.config,providers=config.find(c=>c.id==='llm-pi-ai')?.config.providers;
assert(selection?.provider&&selection.model,'EXISTING_SELECTION_MISSING');const provider=providers[selection.provider];assert(provider?.apiKeyEnv&&provider.baseURL,'EXISTING_PROVIDER_MISSING');
const key=parse(raw[2].toString()).refs?.[provider.apiKeyEnv];assert(typeof key==='string'&&key.length>10,'EXISTING_CREDENTIAL_MISSING');
const models=[selection.model,'deepseek-v4-pro'];assert(models.every(id=>provider.models.some(m=>m.id===id)),'EXPLICIT_SECOND_MODEL_NOT_IN_SELECTED_GROUP');
fs.mkdirSync(out,{recursive:true});if(process.argv[2]==='--prepare'){console.log('CONTINUITY_PREPARED existing_provider=1 selected_model='+models[0]+' second_model='+models[1]+' credential_disk_writes=0 inference=0');process.exit(0);}
const fixture=path.join(root,'runtime/employee-continuity-'+randomUUID()),home=path.join(fixture,'home'),profile=path.join(home,'profiles/web'),workspacePath=path.join(fixture,'workspace');fs.mkdirSync(path.join(profile,'node_modules/@naumi'),{recursive:true});fs.mkdirSync(workspacePath);
fs.writeFileSync(path.join(fixture,'.continuity-fixture'),'isolated-only');
for(const [name,folder]of [['dsh-enterprise','naumi-enterprise'],['dsh-ui-layout','naumi-ui-layout'],['dsh-sidebar-browser','naumi-sidebar-browser']])fs.symlinkSync(path.join(root,'plugins',folder),path.join(profile,'node_modules/@naumi',name),'junction');fs.symlinkSync(path.join(root,'node_modules/@deepseek-ai'),path.join(profile,'node_modules/@deepseek-ai'),'junction');
fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'naumi-continuity-fixture',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@deepseek-ai/dsh-experimental-agent-team-profile','@naumi/dsh-enterprise']}}}));
let supplierRequests=0;
const upstream=http.createServer(async(req,res)=>{
 try{assert(supplierRequests<60,'SUPPLIER_REQUEST_CEILING');supplierRequests++;let raw='';for await(const b of req)raw+=b;const body=JSON.parse(raw);assert(models.includes(body.model),'UNEXPECTED_MODEL');assert(body.max_tokens<=1024,'OUTPUT_CEILING');
 const target=new URL(req.url,new URL(provider.baseURL).origin),headers=Object.fromEntries(Object.entries(req.headers).filter(([k])=>!['host','connection','content-length','accept-encoding'].includes(k)));
 const r=await fetch(target,{method:'POST',headers,body:raw,signal:AbortSignal.timeout(120000)});res.writeHead(r.status,{'Content-Type':r.headers.get('content-type')??'application/json'});for await(const b of r.body)res.write(b);res.end();
 }catch(e){res.writeHead(503,{'Content-Type':'application/json'}).end(JSON.stringify({error:{type:'continuity_bound',message:'isolated inference bound or upstream unavailable'}}));}
});await new Promise(r=>upstream.listen(0,'127.0.0.1',r));
const providerId='continuity-existing',ref='NAUMI_CONTINUITY_EXISTING_API_KEY',modelConfig={displayName:'连续性隔离验收',api:provider.api,baseURL:'http://127.0.0.1:'+upstream.address().port+new URL(provider.baseURL).pathname,apiKeyEnv:ref,models:provider.models.filter(m=>models.includes(m.id)).map(m=>({...m,maxTokens:1024})),defaultMaxTokens:1024};
fs.writeFileSync(path.join(profile,'cordis.patch.yml'),stringify([{id:'agent-default-model',config:{provider:providerId,model:models[0]}},{id:'llm-pi-ai',config:{providers:{[providerId]:modelConfig}}}]));
const sock=http.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;assert.notEqual(port,3080);await new Promise(r=>sock.close(r));const base='http://127.0.0.1:'+port;
const receipt={status:'RUNNING',sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),fixture,home,port,providerGroup:'existing selected connection',models,checks:[],turns:[],realSupplier:true,real3080Requests:0,credentialDiskWrites:0,configWrites:0,enterpriseChanges:0},save=()=>fs.writeFileSync(path.join(out,'LIVE_VERIFICATION.json'),JSON.stringify(receipt,null,2)+'\n');
let child,output='',cookie='',boots=0;const check=(name,value)=>{assert(value,name);receipt.checks.push(name);save();console.log('CONTINUITY_LIVE_PASS '+name);};
const scrub=s=>s.replaceAll(key,'REDACTED').replace(/token=[A-Za-z0-9_~.%-]+/g,'token=REDACTED');
async function stop(){if(!child)return;if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('OWN_HOST_STOP_TIMEOUT')),30000);child.once('close',()=>{clearTimeout(timer);resolve();});});}fs.writeFileSync(path.join(out,'HOST_'+boots+'.log'),scrub(output));child=null;}
async function start(){
 output='';child=spawn(process.execPath,[path.join(root,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'web','--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:root,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_MODE:'DISABLED',[ref]:key},windowsHide:true});boots++;child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 let launch;for(let i=0;i<300;i++){launch=output.match(new RegExp(base.replaceAll('.','\\.')+'/?\\?token=[A-Za-z0-9_~.%-]+'))?.[0];if(launch)break;assert(child.exitCode===null&&child.signalCode===null,'OWN_HOST_EXITED');await new Promise(r=>setTimeout(r,300));}assert(launch,'OWN_HOST_START_TIMEOUT');
 const r=await fetch(launch,{redirect:'manual',signal:AbortSignal.timeout(10000)});assert.equal(r.status,303);cookie=r.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert(cookie);
}
async function request(url,body,header){const r=await fetch(base+url,{...body?{method:'POST',body:JSON.stringify(body)}:{},headers:{cookie,origin:base,'Content-Type':'application/json',...header?{[header]:'1'}:{}},signal:AbortSignal.timeout(45000)}),v=await r.json();assert(r.ok,scrub(JSON.stringify(v)));return v;}
async function rpc(method,args){const v=await request('/api/'+method,{type:'client-request',rpcId:randomUUID(),method,payload:{args}});assert(v.result?.ok,scrub(JSON.stringify(v)));return v.result.value;}
const employee=(botId,view='profile')=>request('/naumi/employees?'+new URLSearchParams({botId,view}));
const owner=(botId,body)=>request('/naumi/employees',{botId,operationId:randomUUID(),...body},'x-naumi-employees');
const events=async sessionId=>(await rpc('session/events',{request:{address:{kind:'session',sessionId},maxMessages:100}})).records.map(r=>r.event);
async function turn(sessionId,text,label){
 const before=await rpc('session/state',{request:{sessionId}});assert(!before.running,'OWN_SESSION_ALREADY_RUNNING');
 await rpc('session/prompt',{request:{sessionId,requestId:randomUUID(),mode:'queue',content:[{type:'text',text}]}});
 let last;for(let i=0;i<6;i++){last=await rpc('session/wait',{request:{sessionId,afterSeq:before.cursor,timeoutMs:30000,maxMessages:100}});if(last.reason!=='timeout')break;assert(last.state.running||last.state.queue?.length,'OBSERVED_IDLE_WITHOUT_TERMINAL_RECEIPT');}
 assert.equal(last.reason,'idle',label+' '+last.reason);const rows=(await events(sessionId)).filter(e=>e.seq>before.cursor),end=rows.findLast(e=>e.type==='turn/end');assert(end,label+' NO_TERMINAL_TURN');assert.equal(end.data.reason.kind,'completed',label+' '+JSON.stringify(end.data.reason));
 const blocks=rows.filter(e=>e.type==='assistant/message').flatMap(e=>e.data.message.content),tools=blocks.filter(b=>b.type==='tool-call').map(b=>b.name),answer=blocks.filter(b=>b.type==='text').map(b=>b.text).join('\n');
 receipt.turns.push({label,sessionId,modelRequests:rows.filter(e=>e.type==='assistant/message').length,toolCalls:tools,completed:true});save();return {answer,tools,rows};
}
async function newChat(bot){const {sessionId}=await rpc('session/create',{request:{cwd:bot.cwd}}),latest=(await request('/naumi/bots')).bots.find(b=>b.id===bot.id);assert(!latest.sessionIds.includes(sessionId),'NEW_CHAT_REUSED_OLD_SESSION');await request('/naumi/bots',{action:'bind',botId:bot.id,sessionId,expectedRevision:latest.revision},'x-naumi-bots');return sessionId;}
try{
 await start();const workspace=await rpc('workspace/create',{request:{path:workspacePath}}),bot=await request('/naumi/bots',{action:'create-primary',requestId:randomUUID(),expectedRevision:0,name:'连续性隔离员工',workspaceId:workspace.workspace.workspaceId},'x-naumi-bots');receipt.botId=bot.id;save();
 const marker='CONTINUITY_'+randomUUID().slice(0,8),memoryText='验收项目标记为'+marker;
 await turn(bot.homeSessionId,'记住我的偏好：'+memoryText,'learn_explicit_marker');
 await turn(bot.homeSessionId,'以后回复先给结论','learn_initial_style');await turn(bot.homeSessionId,'以后回复详细解释','replace_style');
 let memories=await employee(bot.id,'memories');check('native_explicit_learning_has_verified_source',memories.some(m=>m.text===memoryText&&m.source.kind==='user'));check('superseded_style_is_not_retrieved',(await employee(bot.id)).communicationStyle==='详细解释'&&!memories.some(m=>m.text==='先给结论'));
 const chat=await newChat(bot);receipt.newChat=chat;const recalled=await turn(chat,'请只用employee_profile和employee_memory_search查询已有信息。搜索“验收项目标记”，回复查到的完整原文及当前沟通风格；不要创建目标、记录新记忆或使用文件和命令。','fresh_chat_recall');
 check('fresh_session_native_search_recalls_unprompted_marker',recalled.tools.includes('employee_memory_search')&&recalled.answer.includes(marker));
 await turn(chat,'希望你的人物设定为耐心的资料研究员。请先用employee_profile取得当前这条真实消息的sourceMessageId和quote，再调用employee_profile_propose，patch只含persona=耐心的资料研究员，operationId用稳定标识。它仅为候选，等待我确认，不要直接生效或创建目标。','propose_persona');
 const candidates=await request('/naumi/employees?'+new URLSearchParams({botId:bot.id,view:'memories',status:'candidate'})),candidate=candidates.find(m=>m.proposedProfile?.persona==='耐心的资料研究员');check('persona_candidate_not_active_without_owner',!!candidate&&(await employee(bot.id)).persona==='');
 await owner(bot.id,{action:'memory_update',memoryId:candidate.id,expectedRevision:candidate.revision,profileRevision:(await employee(bot.id)).revision,patch:{status:'active'}});
 const selected=await rpc('session/selectModel',{request:{sessionId:chat,provider:providerId,model:models[1]}});check('native_model_switch_exact_selection',selected.selected.model===models[1]);
 const switched=await turn(chat,'请只用employee_profile和employee_memory_search，报告当前保存的人物设定，并搜索“验收项目标记”报告完整原文。不要修改设定、记忆或目标。','second_model_recall');check('second_model_sees_same_employee_persona_and_memory',switched.tools.includes('employee_profile')&&switched.tools.includes('employee_memory_search')&&switched.answer.includes(marker)&&switched.answer.includes('资料研究员'));
 const beforeRestart=await employee(bot.id,'export');await stop();await start();check('restart_keeps_exact_identity_and_employee_data',JSON.stringify({...await employee(bot.id,'export'),exportedAt:null})===JSON.stringify({...beforeRestart,exportedAt:null})&&(await request('/naumi/bots')).bots.some(b=>b.id===bot.id&&b.sessionIds.includes(chat)));
 const restarted=await turn(chat,'请只用employee_profile和employee_memory_search核对当前员工。搜索“验收项目标记”并报告完整标记和已保存人物设定，不要修改任何内容。','restart_recall');check('restored_native_session_recalls_memory_and_persona',restarted.tools.includes('employee_memory_search')&&restarted.answer.includes(marker)&&restarted.answer.includes('资料研究员'));
 const beforeTemp=await employee(bot.id,'export');await turn(chat,'这次回复简洁直接','temporary_instruction');const afterTemp=await employee(bot.id,'export');check('temporary_request_does_not_persist_preferences',JSON.stringify({...beforeTemp,exportedAt:null})===JSON.stringify({...afterTemp,exportedAt:null}));
 memories=await employee(bot.id,'memories');const remembered=memories.find(m=>m.text===memoryText);await owner(bot.id,{action:'memory_forget',memoryId:remembered.id,expectedRevision:remembered.revision,profileRevision:(await employee(bot.id)).revision});
 const fresh=await newChat(bot),forgotten=await turn(fresh,'请只用employee_memory_search搜索“验收项目标记”。只报告实际检索到的内容；没有则明确没有，不要编造、修改记忆或读取旧聊天和文件。','fresh_session_after_forgetting');check('forgotten_memory_not_retrieved_or_injected_in_fresh_session',forgotten.tools.includes('employee_memory_search')&&!forgotten.answer.includes(marker)&&!(await employee(bot.id,'memories')).some(m=>m.id===remembered.id));
 const directory=await request('/naumi/bots'),other=await request('/naumi/bots',{action:'create',requestId:randomUUID(),expectedRevision:directory.revision,fields:{name:'隔离对照员工',kind:'agent',purpose:'验证员工记忆隔离'}},'x-naumi-bots');const otherBot=other.bot??other;
 const foreign=await turn(otherBot.homeSessionId,'请只用employee_profile与employee_memory_search搜索“验收项目标记”，报告你实际保存的人物设定和检索结果。不要读取其他员工、文件或聊天，不要保存新信息。','other_employee_isolation');check('other_employee_has_no_private_persona_or_memory',foreign.tools.includes('employee_memory_search')&&!foreign.answer.includes(marker)&&(await employee(otherBot.id)).persona===''&&(await employee(otherBot.id,'memories')).length===0);
 check('original_user_configuration_hashes_unchanged',paths.every((p,i)=>hash(fs.readFileSync(path.join(runtime,p)))===hash(raw[i])));check('no_credentials_written_to_fixture',!fs.existsSync(path.join(home,'.credentials.yaml'))||!fs.readFileSync(path.join(home,'.credentials.yaml'),'utf8').includes(key));
 receipt.status='PASS';receipt.boots=boots;receipt.supplierRequests=supplierRequests;receipt.maxSupplierRequests=60;save();console.log('CONTINUITY_LIVE checks='+receipt.checks.length+' turns='+receipt.turns.length+' boots='+boots+' actual3080_writes=0 config_changes=0 credential_disk_writes=0');
}catch(error){receipt.status='FAIL';receipt.error=scrub(error.message);save();throw Error(scrub(error.message));}finally{await stop();upstream.closeAllConnections();await new Promise(r=>upstream.close(r));receipt.supplierRequests=supplierRequests;save();}
