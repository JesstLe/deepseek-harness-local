#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
// The launcher runs inside the packaged backend. It never uses a global dws or user config.
const root=path.resolve(__dirname,'..'),home=process.env.DSH_HOME;
if(!home||!path.isAbsolute(home)){console.error('DINGTALK_PROFILE_REQUIRED');process.exit(1);}
void(async()=>{
 const {resolveDingTalk,dingTalkEnvironment,materializeDingTalk}=await import('../plugins/naumi-enterprise/dingtalk-runtime.js');
 const runtime=materializeDingTalk(resolveDingTalk({manifestPath:path.join(root,'node_modules/dingtalk-workspace-cli/package.json')}),home);
 const env=dingTalkEnvironment(home);fs.mkdirSync(env.DWS_CONFIG_DIR,{recursive:true});
 const child=spawn(runtime.command,process.argv.slice(2),{env,cwd:process.cwd(),stdio:'inherit',windowsHide:true,shell:false});
 let failed=false;child.on('error',()=>{failed=true;console.error('DINGTALK_EXEC_FAILED');});
 const forward=()=>child.kill();process.on('SIGINT',forward);process.on('SIGTERM',forward);
 child.on('close',code=>{process.off('SIGINT',forward);process.off('SIGTERM',forward);process.exitCode=failed||code===null?1:code;});
})().catch(e=>{console.error(/^DINGTALK_[A-Z_]+$/.test(e.message)?e.message:'DINGTALK_EXEC_FAILED');process.exitCode=1;});
