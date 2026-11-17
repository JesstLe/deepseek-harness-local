import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import {apply} from '../plugins/naumi-enterprise/host.js';
import {businessCookie,projectWorkspace,validateOrigin} from '../plugins/naumi-enterprise/domain.js';
const sample={actor:{id:'member',tenantId:'tenant',tenantName:'企业',name:'设计师',roles:['designer'],email:'private'},tasks:[{id:'task',title:'主图',status:'in_progress',privateNote:'secret'}],members:[{id:'member',name:'设计师',email:'private'}],assessments:[{score:1}],audit:[{secret:'hidden'}],submissions:[],assets:[{storageKey:'private'}]};
test('business projection keeps observable workflow state, excludes personal scoring and secrets',()=>{
  const result=projectWorkspace(sample);assert.equal(result.tasks[0].status,'in_progress');assert.equal(result.actor.email,undefined);assert.equal(result.assessments,undefined);assert.equal(result.audit,undefined);assert.equal(result.assets,undefined);assert.equal(result.members[0].email,undefined);assert.equal(result.tasks[0].privateNote,undefined);
});
test('missing actor or tasks fails before publishing data',()=>{assert.throws(()=>projectWorkspace({tasks:[]}));assert.throws(()=>projectWorkspace({actor:{id:'x'}}));});
test('business cookie forwards only one named bounded credential',()=>{
  const value='design_ops_session='+'x'.repeat(40);
  assert.equal(businessCookie('harness=not-forwarded; '+value+'; other=x'),value);
  for(const cookie of ['',value+'; '+value,'design_ops_session=short','design_ops_session=bad%0aheader'])assert.equal(businessCookie(cookie),'');
});
test('origin config refuses URL path, auth, non-http protocols and query',()=>{
  assert.equal(validateOrigin('http://127.0.0.1:3112'),'http://127.0.0.1:3112');
  for(const x of ['file:///etc','https://x/a','https://user:pass@x','https://x/?secret=x'])assert.throws(()=>validateOrigin(x));
});
function harness(admission={peer:{principal:{kind:'owner'}}}){
  const routes=new Map(),injections=[];
  const disposers=[];
  const ctx={inject:()=>()=>{},effect:fn=>{disposers.push(fn());},connection:{admit:()=>admission},webServer:{register:r=>{routes.set(r.path,r.handler);return()=>routes.delete(r.path);},tapIndex:fn=>{ctx.index=fn;return()=>{};}},on:(name,fn)=>{injections.push(fn);return()=>{};}};
  apply(ctx,{collaborationOrigin:'http://127.0.0.1:3112',designOrigin:'https://47.105.59.142'});
  return{ctx,routes,injections,disposers};
}
async function invoke(route,{cookie='',method='GET',url='/naumi/workspace'}={}){
  const res=new EventEmitter();res.headers={};res.setHeader=(k,v)=>res.headers[k]=v;res.writeHead=(s,h={})=>{res.status=s;Object.assign(res.headers,h);return res;};res.end=b=>{res.body=b;res.writableEnded=true;return res;};
  await route({headers:{cookie},method,url},res);return res;
}
test('bridge rejects unauthenticated Harness before any upstream call',async()=>{const {routes}=harness({rejection:401});const r=await invoke(routes.get('/naumi/workspace'));assert.equal(r.status,401);assert.match(r.body,/HARNESS_AUTH_REQUIRED/);});
test('bridge rejects non-owner API peers',async()=>{const {routes}=harness({peer:{principal:{kind:'guest'}}});assert.equal((await invoke(routes.get('/naumi/workspace'))).status,403);});
test('no business credential reports login state instead of fabricating data',async()=>{const {routes}=harness();const r=await invoke(routes.get('/naumi/workspace'));assert.equal(r.status,401);assert.equal(JSON.parse(r.body).error,'COLLABORATION_LOGIN_REQUIRED');});
test('all write methods are rejected; no business command proxy exists',async()=>{const {routes}=harness();for(const method of ['POST','PUT','DELETE'])assert.equal((await invoke(routes.get('/naumi/workspace'),{method})).status,405);assert.deepEqual([...routes.keys()].sort(),['/naumi/assets','/naumi/browser','/naumi/workspace']);});
test('authenticated projection uses fixed endpoint, only scoped Cookie and no-store',async()=>{
  const previous=global.fetch;let seen;
  global.fetch=async(url,options)=>{seen={url,options};return Response.json(sample);};
  try{const {routes}=harness();const r=await invoke(routes.get('/naumi/workspace'),{cookie:'harness=private; design_ops_session='+'a'.repeat(32)});assert.equal(r.status,200);assert.equal(seen.url,'http://127.0.0.1:3112/api/workspace');assert.deepEqual(seen.options.headers,{cookie:'design_ops_session='+'a'.repeat(32),accept:'application/json'});assert.equal(r.headers['Cache-Control'],'private, no-store');assert.equal(JSON.parse(r.body).actor.email,undefined);assert.equal(seen.options.redirect,'manual');}finally{global.fetch=previous;}
});
test('upstream role refusal remains 403; error does not expose upstream body',async()=>{
  const previous=global.fetch;global.fetch=async()=>new Response('sensitive stack',{status:403});
  try{const {routes}=harness();const r=await invoke(routes.get('/naumi/workspace'),{cookie:'design_ops_session='+'a'.repeat(32)});assert.equal(r.status,403);assert(!r.body.includes('sensitive'));}finally{global.fetch=previous;}
});
test('network failure remains unavailable, without last-user cached data',async()=>{
  const previous=global.fetch;global.fetch=async()=>{throw Error('secret token');};
  try{const {routes}=harness();const r=await invoke(routes.get('/naumi/workspace'),{cookie:'design_ops_session='+'a'.repeat(32)});assert.equal(r.status,502);assert.equal(r.body,'{"error":"COLLABORATION_UNAVAILABLE"}');}finally{global.fetch=previous;}
});
test('assets are allowlisted, traversal and upload are not served',async()=>{const {routes}=harness();assert.equal((await invoke(routes.get('/naumi/assets'),{url:'/naumi/assets/../../secret',method:'GET'})).status,404);assert.equal((await invoke(routes.get('/naumi/assets'),{url:'/naumi/assets/symbol.svg',method:'POST'})).status,404);const r=await invoke(routes.get('/naumi/assets'),{url:'/naumi/assets/symbol.svg'});assert.equal(r.status,200);assert.match(r.body.toString(),/<svg/);});
test('index title and globals are branded without user or credential fields',()=>{const {ctx,injections}=harness();const rows=[];injections[0](rows);assert.equal(rows[0].name,'__NAUMI__');assert.deepEqual(Object.keys(rows[0].value),['collaborationOrigin','designOrigin','version','product','productVersion']);assert.match(ctx.index('<title>DeepSeek Harness</title>'),/<title>Naumi<\/title>/);});
test('branded layout preserves the exact original AppFrame apart from two declared substitutions',()=>{
  const upstream=fs.readFileSync('node_modules/@deepseek-ai/dsh-client-ui-layout/lib/client.js','utf8');
  const branded=fs.readFileSync('plugins/naumi-ui-layout/client.js','utf8');
  assert.equal(branded.replace('id: "@naumi/dsh-ui-layout"','id: "@deepseek-ai/dsh-client-ui-layout"').replace('const productTitle = "Naumi";','const productTitle = "DeepSeek Harness";'),upstream);
});
