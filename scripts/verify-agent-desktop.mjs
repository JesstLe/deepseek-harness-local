import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {Context} from '@deepseek-ai/cordis';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import {resolveDesktopRuntime,desktopMcpConfig} from '../plugins/naumi-enterprise/desktop-runtime.js';
const runtime=resolveDesktopRuntime(),report={version:runtime.version,platform:runtime.platform,arch:runtime.arch,artifacts:runtime.checks};
const envelope=JSON.parse(execFileSync(runtime.command,['status'],{encoding:'utf8',windowsHide:true}));assert.equal(envelope.ok,true);assert.equal(envelope.data.version,'1.3.1');
report.platformStatus={platform:envelope.data.platform,permissions:envelope.data.permissions,tracing:envelope.data.tracing};
console.log('DESKTOP_CLI version=1.3.1 checksum=pass platform='+runtime.platform+' status=ok');
const ctx=new Context(),definitions=new Map();
ctx.provide('tools');ctx.set('tools',{register(def){definitions.set(def.name,def);return()=>definitions.delete(def.name);}});
try{
 await ctx.plugin(mcpClient,{...desktopMcpConfig(runtime),failOnStartupError:true});
 report.toolCount=definitions.size;report.toolNames=[...definitions.keys()];
 for(const name of ['desktop_status','desktop_snapshot','desktop_click','desktop_skills_get'])assert(definitions.has('mcp__naumi_desktop__'+name));
 const exec={signal:new AbortController().signal};
 const status=await definitions.get('mcp__naumi_desktop__desktop_status').execute({},exec);
 const data=status.structuredContent??JSON.parse(status.content.find(x=>x.type==='text').text);assert.equal(data.ok,true);
 const guide=await definitions.get('mcp__naumi_desktop__desktop_skills_get').execute({name:'platform'},exec);
 const g=guide.structuredContent??JSON.parse(guide.content.find(x=>x.type==='text').text);assert.equal(g.ok,true);assert(g.data.content.length>1000);
 report.bridgeStatus='pass';report.platformGuide='pass';
 console.log('DESKTOP_MCP tools='+definitions.size+' native_status=ok platform_guide=ok harness_bridge=ok');
}finally{await ctx.fiber.dispose();}
assert.equal(definitions.size,0);console.log('DESKTOP_DISPOSE tools_remaining=0');
report.dispose='pass';fs.writeFileSync('evidence/agent-desktop/MCP_CHECK.json',JSON.stringify(report,null,2));
