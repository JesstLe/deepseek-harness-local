import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {resolveDesktopRuntime,desktopMcpConfig,desktopSkillConfig,AGENT_DESKTOP_VERSION} from '../plugins/naumi-enterprise/desktop-runtime.js';
import {installAgentDesktop} from '../plugins/naumi-enterprise/agent-desktop.js';
const digest=x=>createHash('sha256').update(x).digest('hex');
function fake(platform='win32',arch='x64',version=AGENT_DESKTOP_VERSION){
 const manifest=path.resolve('TEST_INSTALL','agent-desktop','package.json');const files=new Map([[manifest,JSON.stringify({version})]]);const bin=path.join(path.dirname(manifest),'bin');
 const add=name=>{const p=path.join(bin,name),bytes=Buffer.from(name);files.set(p,bytes);files.set(p+'.sha256',digest(bytes));};
 add(`agent-desktop-${platform}-${arch}${platform==='win32'?'.exe':''}`);
 if(platform==='darwin')add(`agent-desktop-macos-helper-${platform}-${arch}`);
 if(platform==='linux')add(`agent-desktop-linux-clipboard-owner-${platform}-${arch}`);
 return {files,options:{manifestPath:manifest,platform,arch,exists:p=>files.has(p),readFile:(p,encoding)=>{if(!files.has(p))throw Error('Missing fixture '+p);const b=Buffer.from(files.get(p));return encoding?b.toString(encoding):b;}}};
}
test('pinned packaged executable resolves without PATH or shell',()=>{const f=fake();const r=resolveDesktopRuntime(f.options);assert(r.command.endsWith('agent-desktop-win32-x64.exe'));assert.equal(r.checks.length,1);assert.deepEqual(r.env,{});});
test('six supported platform/architecture combinations include required helpers',()=>{for(const p of ['win32','darwin','linux'])for(const a of ['x64','arm64']){const r=resolveDesktopRuntime(fake(p,a).options);assert.equal(r.checks.length,p==='win32'?1:2);if(p==='darwin')assert(path.isAbsolute(r.env.AGENT_DESKTOP_MACOS_HELPER_PATH));}});
test('version drift and unsupported platform fail explicitly',()=>{assert.throws(()=>resolveDesktopRuntime(fake('win32','x64','999').options),/version mismatch/);assert.throws(()=>resolveDesktopRuntime(fake('sunos').options),/Unsupported/);});
test('missing or tampered executable and missing helper fail before spawn',()=>{for(const scenario of ['checksum','missing','helper']){const f=fake(scenario==='helper'?'linux':'win32');const key=[...f.files.keys()].find(p=>p.endsWith('.sha256'));if(scenario==='checksum')f.files.set(key,'0'.repeat(64));else if(scenario==='missing')f.files.delete(key);else f.files.delete([...f.files.keys()].find(p=>p.includes('clipboard-owner')&&!p.endsWith('.sha256')));assert.throws(()=>resolveDesktopRuntime(f.options),/checksum|Missing/);}});
test('MCP config is stdio, stable namespace, no automatic physical input or trace',()=>{const r=resolveDesktopRuntime(fake().options),c=desktopMcpConfig(r);assert.equal(c.command,r.command);assert.equal(c.serverName,'naumi_desktop');assert.deepEqual(c.args,['mcp','--session','naumi']);assert(!c.args.some(x=>/headed|force|trace/.test(x)));assert.equal(c.reconnect.enabled,true);assert.deepEqual(c.env,{});});
test('bundled skill provider adds one isolated root, not an override of employee skills',()=>{const c=desktopSkillConfig();assert.equal(c.providerName,'naumi-desktop');assert.equal(c.includeDefaultRoots,false);assert.equal(c.watch,false);assert.equal(c.customSkillDirs.length,1);assert(path.isAbsolute(c.customSkillDirs[0]));assert(fs.existsSync(path.join(c.customSkillDirs[0],'naumi-desktop','SKILL.md')));});
function host(admission={peer:{principal:{kind:'owner'}}},names=['mcp__naumi_desktop__desktop_status']){
 const plugins=[],routes=new Map(),scope={plugin:(...a)=>plugins.push(a),effect:fn=>fn(),tools:{definitions:()=>names.map(name=>({name}))},connection:{admit:()=>admission},webServer:{register:r=>{routes.set(r.path,r.handler);return()=>routes.delete(r.path);}}};
 const ctx={inject:(names,fn)=>{assert.deepEqual(names,['tools','skills']);fn(scope);return()=>{};}};installAgentDesktop(ctx);return {plugins,routes};
}
async function request(handler,method='GET'){const r={headers:{},setHeader(k,v){this.headers[k]=v;},writeHead(s){this.status=s;return this;},end(b){this.body=JSON.parse(b);}};await handler({method,headers:{}},r);return r;}
test('integration mounts only existing MCP and filesystem-skill plugins',()=>{const h=host();assert.equal(h.plugins.length,2);assert.equal(h.plugins[0][1].serverName,'naumi_desktop');assert.equal(h.plugins[1][1].providerName,'naumi-desktop');});
test('readiness requires owner admission and never exposes paths or desktop content',async()=>{const h=host(),r=await request(h.routes.get('/naumi/desktop'));assert.equal(r.status,200);assert.equal(r.body.toolCount,1);assert(!JSON.stringify(r.body).includes(os.homedir()));for(const admission of [{rejection:401},{peer:{principal:{kind:'guest'}}}]){const s=host(admission);const a=await request(s.routes.get('/naumi/desktop'));assert([401,403].includes(a.status));}});
test('readiness is read-only and honest while tools are not registered',async()=>{const h=host(undefined,[]);assert.equal((await request(h.routes.get('/naumi/desktop'))).status,503);assert.equal((await request(h.routes.get('/naumi/desktop'),'POST')).status,405);});
test('root and plugin use exact dependency versions; no lifetime install downloads',()=>{for(const p of ['package.json','plugins/naumi-enterprise/package.json'])assert.equal(JSON.parse(fs.readFileSync(p)).dependencies['agent-desktop'],'1.3.1');const source=fs.readFileSync('plugins/naumi-enterprise/desktop-runtime.js','utf8');assert(!/\bfetch\s*\(|execSync\(|npx\s+-y/.test(source));assert(fs.readFileSync('plugins/naumi-enterprise/third-party/agent-desktop/LICENSE','utf8').includes('Apache License'));});
