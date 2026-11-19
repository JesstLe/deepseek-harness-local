import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CuaRuntime,DesktopLease} from '../plugins/naumi-enterprise/cua-runtime.js';
import {installCua,cuaSchema} from '../plugins/naumi-enterprise/cua.js';
import {resolveDesktopRuntime,CUA_VERSION,desktopSkillConfig} from '../plugins/naumi-enterprise/desktop-runtime.js';
import {assertSupportedJsonSchema} from '@deepseek-ai/dsh-tools';
import {managedRuntimeHost} from './helpers/managed-runtime-host.mjs';
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const image=()=>({content:[{type:'image',mimeType:'image/png',data:png}],structuredContent:{capture_id:'native-capture'}});
const ok=()=>({content:[{type:'text',text:'dispatched'}],structuredContent:{dispatched:true}});
function fixture(overrides={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-cua-test-')),calls=[];let now=1000,closed=0;
 const runtime=new CuaRuntime({clock:()=>now,lease:new DesktopLease({directory:dir,clock:()=>now}),open:async()=>({call:async(n,a,s)=>{calls.push({n,a,s});return overrides.call?overrides.call(n,a,s):n.startsWith('get_')?image():ok();},close:async()=>{closed++;}})});
 return {runtime,calls,dir,time:n=>now=n,closed:()=>closed,close:async()=>{await runtime.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
const observe=(f,id='A',args={})=>f.runtime.perform(id,{action:'observe',...args});
const click=(f,o,id='A')=>f.runtime.perform(id,{action:'click',x:0,y:0,observationId:o.structuredContent.observationId});
test('offline CUA runtime pin, supported platform and tamper rejection',()=>{
 assert.equal(resolveDesktopRuntime().version,CUA_VERSION);assert.deepEqual(resolveDesktopRuntime().args,['mcp','--direct','--embedded']);
 assert.throws(()=>resolveDesktopRuntime({platform:'linux'}),/PLATFORM/);assert.throws(()=>resolveDesktopRuntime({readFile:()=>Buffer.from('tamper')}),/HASH/);assert.throws(()=>resolveDesktopRuntime({readFile:()=>{throw Error();}}),/MISSING/);
});
test('default host, dependency graph and package no longer mount agent-desktop',()=>{
 for(const p of ['package.json','plugins/naumi-enterprise/package.json']){const m=JSON.parse(fs.readFileSync(p));assert(!m.dependencies['agent-desktop']);assert.equal(m.dependencies['@modelcontextprotocol/client'],'2.2.0');}
 assert(!fs.existsSync('plugins/naumi-enterprise/agent-desktop.js'));assert(!fs.readFileSync('plugins/naumi-enterprise/host.js','utf8').includes('installAgentDesktop'));
 assert(fs.readFileSync('plugins/naumi-enterprise/host.js','utf8').includes('installCua(ctx)'));assert(!JSON.stringify(JSON.parse(fs.readFileSync('package-lock.json')).packages).includes('node_modules/agent-desktop'));
});
test('one native tool schema, isolated skill root and no raw script/browser/AX operations',()=>{
 assertSupportedJsonSchema(cuaSchema);assert.equal(cuaSchema.additionalProperties,false);assert(!cuaSchema.properties.session);assert(!cuaSchema.properties.element_token);
 const skill=desktopSkillConfig();assert(!skill.includeDefaultRoots);assert(fs.readFileSync(path.join(skill.customSkillDirs[0],'naumi-desktop/SKILL.md'),'utf8').includes('naumi_cua'));
});
test('observe binds authoritative Session, exact target and real screenshot; action returns another image',async()=>{const f=fixture();try{
 const o=await observe(f,'A',{pid:12,window_id:34});const result=await click(f,o);assert.equal(result.structuredContent.verificationRequired,true);assert(result.content.some(x=>x.type==='image'));
 const c=f.calls.find(c=>c.n==='click');assert.equal(c.a.pid,12);assert.equal(c.a.window_id,34);assert.equal(c.a.capture_id,'native-capture');assert.equal(c.a.delivery_mode,'background');assert.equal(c.a.session,f.runtime.session('A'));
 assert.deepEqual(f.calls.map(c=>c.n),['get_window_state','click','get_window_state']);assert.equal(f.calls[0].a.include_accessibility_tree,false);
}finally{await f.close();}});
test('all eight input verbs use the same CUA client and post-observation',async()=>{const f=fixture();try{
 for(const action of ['click','double_click','right_click','type_text','press_key','hotkey','scroll','drag']){const o=await observe(f);await f.runtime.perform('A',{action,observationId:o.structuredContent.observationId,x:0,y:0,from_x:0,from_y:0,to_x:0,to_y:0,text:'test',key:'enter',keys:['ctrl','a'],direction:'down'});}
 assert(f.calls.some(c=>c.n==='click'&&c.a.count===2));assert(f.calls.some(c=>c.n==='click'&&c.a.button==='right'));assert(f.calls.filter(c=>c.n==='get_desktop_state').length===16);
}finally{await f.close();}});
test('no observation, consumed observation and expired observation never dispatch',async()=>{const f=fixture();try{
 await assert.rejects(click(f,{structuredContent:{observationId:'fake'}}),/FRESH/);const o=await observe(f);await click(f,o);await assert.rejects(click(f,o),/FRESH/);const fresh=await observe(f);f.time(32000);await assert.rejects(click(f,fresh),/FRESH/);assert.equal(f.calls.filter(c=>c.n==='click').length,1);
}finally{await f.close();}});
test('cross Session lease blocks concurrent Bots; release frees it without exposing another screenshot',async()=>{const f=fixture();try{
 const a=await observe(f);await assert.rejects(observe(f,'B'),/BUSY/);assert.equal(f.calls.length,1);await assert.rejects(click(f,a,'B'),/BUSY/);await f.runtime.perform('A',{action:'release'});await observe(f,'B');assert(f.calls.at(-1).a.session!==f.calls[0].a.session);
}finally{await f.close();}});
test('an observation from an earlier lease is invalid after another Bot used the desktop',async()=>{const f=fixture();try{
 const a=await observe(f);f.time(122000);await observe(f,'B');await f.runtime.perform('B',{action:'release'});await assert.rejects(click(f,a),/FRESH/);
}finally{await f.close();}});
test('OS-level lease blocks a second backend instance and never steals the current process',async()=>{const f=fixture(),second=new DesktopLease({directory:f.dir});try{
 await observe(f);assert.throws(()=>second.acquire('B'),/BUSY/);await f.runtime.perform('A',{action:'release'});second.acquire('B');assert.throws(()=>f.runtime.lease.acquire('A'),/BUSY/);second.release('B');
}finally{await f.close();}});
test('incomplete lock record is not removed; dead PID recovery is bounded',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cua-lock-'));try{
 const lease=new DesktopLease({directory:dir});fs.writeFileSync(lease.file,'');assert.throws(()=>lease.acquire('A'),/BUSY/);assert.equal(fs.readFileSync(lease.file,'utf8'),'');fs.writeFileSync(lease.file,JSON.stringify({pid:2147483647,nonce:'dead'}));lease.acquire('A');lease.release('A');assert(!fs.existsSync(lease.file));
}finally{fs.rmSync(dir,{recursive:true,force:true});}});
test('out-of-bounds and non-finite coordinates never reach native input',async()=>{const f=fixture();try{
 const o=await observe(f);for(const x of [-1,1,Infinity,NaN])await assert.rejects(f.runtime.perform('A',{action:'click',x,y:0,observationId:o.structuredContent.observationId}),/COORDINATES|INPUT_INVALID/);assert(!f.calls.some(c=>c.n==='click'));
}finally{await f.close();}});
test('Session/AX/script injection and incomplete targets fail closed',async()=>{const f=fixture();try{
 await assert.rejects(f.runtime.perform('',{action:'status'}),/SESSION_REQUIRED/);await assert.rejects(f.runtime.perform('A',{action:'run_script'}),/ACTION_INVALID/);await assert.rejects(observe(f,'A',{pid:12}),/EXACT_WINDOW/);await assert.rejects(f.runtime.perform('A',{action:'status',session:'other'}),/HOST_SCOPE/);
}finally{await f.close();}});
test('native write failure is UNKNOWN, has no automatic replay and pins its lease beyond TTL',async()=>{const f=fixture({call:async n=>n==='click'?Promise.reject(Error('transport lost')):n.startsWith('get_')?image():ok()});try{
 const o=await observe(f);await assert.rejects(click(f,o),/UNKNOWN/);assert.equal(f.closed(),1);await assert.rejects(click(f,o),/OBSERVE_REQUIRED_AFTER_UNKNOWN/);await assert.rejects(f.runtime.perform('A',{action:'release'}),/OBSERVE_REQUIRED/);f.time(999999);await assert.rejects(observe(f,'B'),/BUSY/);assert.equal(f.calls.filter(c=>c.n==='click').length,1);await observe(f);assert(!f.runtime.unknown.has('A'));
}finally{await f.close();}});
test('native isError and failed post-capture are not reported as successful actions',async()=>{let captures=0;const f=fixture({call:async n=>n.startsWith('get_')?++captures===1?image():{isError:true,content:[{type:'text',text:'capture failed'}]}:ok()});try{
 const o=await observe(f);assert.equal((await click(f,o)).isError,true);assert(f.runtime.unknown.has('A'));
}finally{await f.close();}});
test('cancellation before dispatch produces no desktop call',async()=>{const f=fixture();try{
 const c=new AbortController();c.abort();await assert.rejects(f.runtime.perform('A',{action:'observe'},{signal:c.signal}),/abort/i);assert.equal(f.calls.length,0);
}finally{await f.close();}});
test('in-flight action cannot interleave, disposed Session cancels and drains before release',async()=>{let entered;const started=new Promise(r=>entered=r);const f=fixture({call:async(n,a,s)=>{if(n==='click'){entered();return new Promise((r,reject)=>s.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));}return n.startsWith('get_')?image():ok();}});try{
 const o=await observe(f),pending=click(f,o);await started;await assert.rejects(observe(f,'B'),/IN_FLIGHT/);const removing=f.runtime.remove('A');await assert.rejects(pending,/UNKNOWN/);await removing;assert.equal(f.runtime.lease.owner,null);await assert.rejects(observe(f),/DISPOSED/);await f.runtime.attach('A');await observe(f);
}finally{await f.close();}});
test('close drains the owned client and removes lock; no post-close action',async()=>{const f=fixture();try{await observe(f);await f.runtime.close();assert.equal(f.closed(),1);assert(!fs.existsSync(f.runtime.lease.file));await assert.rejects(observe(f),/DISPOSED/);}finally{await f.close();}});

function host({vision=true,admission={peer:{principal:{kind:'owner'}}},installed=true,runtime}={}){
 const definitions=new Map(),routes=new Map(),events=new Map(),cleanup=[],saved=[];const rt=runtime??{connected:false,perform:async()=>image(),remove:async()=>{},attach:async()=>{},close:async()=>{}};
 const attachments={saveImages:async imgs=>{saved.push(...imgs);return imgs.map((x,i)=>({id:'durable-'+i,mimeType:x.mediaType}));}};
 const scope={plugin:()=>{},get:n=>n==='attachments'?attachments:n==='llm'?{resolveModelInfo:async()=>({inputModalities:vision?['text','image']:['text']})}:undefined,tools:{register:def=>{definitions.set(def.name,def);return()=>definitions.delete(def.name);},definitions:()=>[...definitions.values()]},effect:fn=>{const d=fn();if(d)cleanup.push(d);},on:(n,f)=>events.set(n,f),connection:{admit:()=>admission},webServer:{register:r=>{routes.set(r.path,r.handler);return()=>routes.delete(r.path);}}};
 installCua({inject:(_services,fn)=>fn(scope)},{runtime:rt,resolve:()=>{if(!installed)throw Error();return{};}});
 return {definitions,routes,events,saved,close:async()=>{for(const d of cleanup.reverse())await d();}};
}
const exec=()=>({agent:{id:'real-session',options:{provider:'fixture',model:'vision'},session:{requestHeader:()=>({})}},signal:new AbortController().signal});
test('original Harness MCP image projection creates native durable attachments for the real Session',async()=>{const h=host();try{
 assert.deepEqual([...h.definitions.keys()],['naumi_cua']);const def=h.definitions.get('naumi_cua'),e=exec(),value=await def.execute({action:'observe'},e),content=def.output.render({},value);const projection=def.projectContent(e,{value,content});assert.equal(h.saved.length,1);assert.equal(projection[0].type,'image');assert.equal(projection[0].attachment.id,'durable-0');assert.equal(def.projectContent(e,{value,content}),undefined);
}finally{await h.close();}});
test('nonvision route is rejected before capture; Session identity is mandatory',async()=>{let calls=0;const h=host({vision:false,runtime:{perform:async()=>{calls++;return image();},close:async()=>{}}});try{
 const def=h.definitions.get('naumi_cua');await assert.rejects(def.execute({action:'observe'},exec()),/CUA_MODEL_IMAGE_INPUT_REQUIRED/);await assert.rejects(def.execute({action:'status'},{signal:exec().signal}),/SESSION_REQUIRED/);assert.equal(calls,0);
}finally{await h.close();}});
test('real Harness Tools/NativeExecutor and enterprise gate deny CUA without dispatch, then honor explicit allowlist',async()=>{
 const f=await managedRuntimeHost();let registration,skillsProvider,dispatch=0;
 try{
  f.ctx.provide('skills',{registerProvider:create=>{skillsProvider=create({invalidate:()=>{},signal:new AbortController().signal});}});
  registration=installCua(f.ctx,{runtime:{connected:false,perform:async()=>{dispatch++;return ok();},remove:async()=>{},attach:async()=>{},close:async()=>{}},resolve:()=>({})});await registration;
  assert(f.ctx.tools.definitions(f.root).some(t=>t.name==='naumi_cua'));assert(!f.ctx.tools.definitions(f.root).some(t=>t.name.startsWith('mcp__naumi_desktop__')));
  await f.attach();await f.resume();assert.equal((await f.invoke('naumi_cua',f.root,{action:'status'})).isError,true);assert.equal(dispatch,0);
  let b=f.runtime.gate.binding(f.root.id);await f.command('pause',{expectedRevision:b.revision});b=f.runtime.gate.binding(f.root.id);await f.command('configure',{expectedRevision:b.revision,allowedTools:['naumi_cua'],allowOfflineLocal:true});await f.resume();
  assert.equal((await f.invoke('naumi_cua',f.root,{action:'status'})).isError,false);assert.equal(dispatch,1);assert.equal(f.modelCalls,0);
 }finally{await registration?.dispose();await skillsProvider?.dispose();await f.cleanup();}
});
async function request(h,method='GET'){const r={setHeader(){},writeHead(s){this.status=s;return this;},end(b){this.body=JSON.parse(b);return this;}};await h.routes.get('/naumi/desktop')({method},r);return r;}
test('status HTTP is owner-only/read-only and distinguishes installed from ready',async()=>{
 for(const config of [{},{installed:false},{admission:{rejection:401}},{admission:{peer:{principal:{kind:'guest'}}}}]){const h=host(config);try{const r=await request(h);if(config.admission)assert([401,403].includes(r.status));else{assert.equal(r.body.ready,false);assert.equal(r.body.legacyDesktop,false);assert.equal(r.status,config.installed===false?503:200);assert.equal((await request(h,'POST')).status,405);}}finally{await h.close();}}
});
