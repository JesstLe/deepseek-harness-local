import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable,PassThrough} from 'node:stream';
import {EventEmitter} from 'node:events';
import http from 'node:http';
import fs from 'node:fs';
import {browserURL,validateBrowserInput,EgoBrowserRuntime,resolveBrowserRuntime,BROWSER_LOCK} from '../plugins/naumi-enterprise/browser-runtime.js';
import {installEgoBrowser,createBrowserTool} from '../plugins/naumi-enterprise/browser.js';

test('browser accepts HTTP(S), loopback and blank but no executable URLs/credentials',()=>{
  assert.equal(browserURL('localhost:3112/workbench'),'http://localhost:3112/workbench');assert.equal(browserURL('example.com'),'https://example.com/');assert.equal(browserURL('about:blank'),'about:blank');
  for(const url of ['javascript:alert(1)','file:///C:/a','data:text/html,x','https://u:p@example.com','blob:https://x'])assert.throws(()=>browserURL(url));
});
test('structured action validation rejects arbitrary script, large text and bad viewport',()=>{
  assert.throws(()=>validateBrowserInput({action:'evaluate',code:'x'}));assert.throws(()=>validateBrowserInput({action:'text',text:'x'.repeat(17000)}));assert.throws(()=>validateBrowserInput({action:'resize',width:1,height:600}));assert.throws(()=>validateBrowserInput({action:'click',x:NaN,y:0}));
  const v=validateBrowserInput({action:'navigate',url:'https://example.com',code:'evil',frame:true});assert.equal(v.code,undefined);assert.equal(v.frame,true);
});
test('runtime is pinned, packaged, verified and explicitly platform-bounded',()=>{
  assert.equal(BROWSER_LOCK.browserVersion,'0.6.3.14');assert.equal(BROWSER_LOCK.skillVersion,'2.2.1');assert.throws(()=>resolveBrowserRuntime({platform:'linux'}),/PLATFORM/);assert.throws(()=>resolveBrowserRuntime({root:'NONEXISTING_TEST_RUNTIME'}),/INCOMPLETE/);
  assert(!fs.readFileSync('plugins/naumi-enterprise/browser-runtime.js','utf8').includes('npx '));
});
function harness(admission={peer:{principal:{kind:'owner'}}}){
  const routes=new Map(),calls=[],plugins=[],effects=[];
  const runtime={status:()=>({status:'installed',engine:'ego-lite'}),perform:async(...args)=>{calls.push(args);return {title:'fixture'};},dispose:async()=>{}};
  const ctx={connection:{admit:()=>admission},webServer:{register:r=>{routes.set(r.path,r.handler);return()=>routes.delete(r.path);}},effect:f=>{effects.push(f());},inject:(names,fn)=>{if(names[0]==='tools')fn({effect:f=>f(),tools:{register:t=>{calls.push(['register',t.name]);return()=>{};}}});else fn({plugin:(...args)=>plugins.push(args)});}};
  installEgoBrowser(ctx,{runtime});return {handler:routes.get('/naumi/browser'),calls,plugins,runtime};
}
async function req(h,{method='GET',body='',headers={}}={}){
  const request=Readable.from([Buffer.from(body)]);request.method=method;request.headers={host:'127.0.0.1:3080',...headers};
  const response=new EventEmitter();Object.assign(response,{headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s){this.status=s;},end(b){this.body=JSON.parse(b);this.writableEnded=true;}});await h.handler(request,response);return response;
}
test('browser endpoint requires Harness owner, not merely upstream website login',async()=>{
  for(const admission of [{rejection:401},{peer:{principal:{kind:'guest'}}}]){const r=await req(harness(admission));assert([401,403].includes(r.status));}
  const r=await req(harness());assert.equal(r.status,200);assert.equal(r.body.title,undefined);
});
test('mutation endpoint rejects cross-origin and missing browser-intent header',async()=>{
  const h=harness();assert.equal((await req(h,{method:'POST'})).status,403);
  assert.equal((await req(h,{method:'POST',headers:{'x-naumi-browser':'1',origin:'https://evil.test'}})).status,403);
  assert.equal((await req(h,{method:'DELETE'})).status,405);assert.equal(h.calls.length,1);
});
test('bounded JSON body and session identity fail before touching browser',async()=>{
  const h=harness(),headers={'x-naumi-browser':'1'};
  assert.equal((await req(h,{method:'POST',body:'{',headers})).status,400);assert.equal((await req(h,{method:'POST',body:'x'.repeat(65537),headers})).status,413);assert.equal((await req(h,{method:'POST',body:'{}',headers})).status,400);
  const r=await req(h,{method:'POST',headers,body:JSON.stringify({sessionId:'session-1',action:'state'})});assert.equal(r.status,200);assert.equal(h.calls.at(-1)[0],'session-1');
});
test('native tool uses executor agent identity, excludes images and shares session view',async()=>{
  const seen=[],tool=createBrowserTool({perform:async(...args)=>{seen.push(args);return {ok:true};}}),signal=new AbortController().signal;
  await assert.rejects(tool.execute({action:'state'},{signal}),/SESSION_REQUIRED/);
  await tool.execute({action:'snapshot'},{agent:{id:'real-session'},signal});assert.equal(seen[0][0],'real-session');assert.equal(seen[0][1].frame,false);assert.equal(seen[0][2].signal,signal);
});
test('separate filesystem skill provider never overrides model settings or desktop provider',()=>{
  const h=harness();assert.equal(h.plugins[0][1].providerName,'naumi-browser');assert.equal(h.plugins[0][1].includeDefaultRoots,false);assert(h.plugins[0][1].bundledSkillDir.endsWith('browser-skills'));
});
test('persistent worker JSON transport is lossless and same-scope mutations serialize',async()=>{
  let active=0,max=0;const server=http.createServer((req,res)=>{assert.equal(req.headers.authorization,'Bearer fixture');active++;max=Math.max(max,active);setTimeout(()=>{active--;res.end(JSON.stringify({ok:true,data:{title:'中文',label:'p1'}}));},5);});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const runtime=new EgoBrowserRuntime();runtime.ensureWorker=async()=>({url:'http://127.0.0.1:'+server.address().port,token:'fixture'});
  try{const results=await Promise.all([runtime.perform('a',{action:'state'}),runtime.perform('a',{action:'state'})]);assert.equal(max,1);assert.equal(results[0].title,'中文');await runtime.dispose();await assert.rejects(runtime.perform('a',{action:'state'}),/DISPOSED/);}finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
test('UI is real-engine presentation, uses native slots, preserves browser/model separation',()=>{
  const s=fs.readFileSync('plugins/naumi-enterprise/assets/browser-client.js','utf8');assert(s.includes("kind:'browser'"));assert(s.includes("sidebar.right.pane.tab"));assert(!s.includes('<iframe'));assert(s.includes('onCompositionEnd'));assert(s.includes('scheduler.current.dispose()'));assert(s.includes('tab.visible'));assert(!/setModel\(|setPermission\(/.test(s));
});
