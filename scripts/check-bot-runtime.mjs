import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

// Read-only application probe. Never prints or saves launch tokens, cookies or task contents.
const root=path.resolve(process.argv[2]??'E:/Workspace/deepseek-harness-local');
const expectedContract=process.argv[3],base='http://127.0.0.1:3080';
const logs=['server.out.log','server.err.log'].map(p=>fs.readFileSync(path.join(root,'logs',p),'utf8')).join('\n');
const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];
assert(launch,'launch URL missing');
const exchange=await fetch(launch,{redirect:'manual',signal:AbortSignal.timeout(5000)});
assert.equal(exchange.status,303);
const cookie=exchange.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
assert(cookie,'owner cookie missing');
const sessionsResponse=await fetch(base+'/api/session/list',{method:'POST',headers:{cookie,'Content-Type':'application/json'},
  body:JSON.stringify({type:'client-request',rpcId:'bot-lifecycle-read-only',method:'session/list',payload:{args:{_request:{}}}}),signal:AbortSignal.timeout(10000)});
assert.equal(sessionsResponse.status,200);
const sessions=(await sessionsResponse.json()).result;assert(sessions.ok,'session listing failed');
assert(Array.isArray(sessions.value.items),'session listing invalid');
const running=sessions.value.items.filter(s=>s.running===true).length;
const response=await fetch(base+'/naumi/bots',{headers:{cookie},signal:AbortSignal.timeout(5000)});
assert.equal(response.status,200);const catalog=await response.json();
assert.equal(catalog.version,1);assert(Array.isArray(catalog.bots));
const contract=response.headers.get('x-naumi-bots-contract');
if(expectedContract)assert.equal(contract,expectedContract,'runtime still uses previous module');
console.log(`RUNTIME sessions=${sessions.value.items.length} running=${running} bots=${catalog.bots.length} revision=${catalog.revision} http=200 contract=${contract??'legacy'}`);
if(running!==0)process.exitCode=2;
