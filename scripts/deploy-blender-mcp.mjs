import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
import {botLiveApi} from './bot-live-api.mjs';

// Apply only this module's delta to the installed plugin, retaining local extensions.
const root=process.cwd(),runtime=path.resolve(process.argv[2]??root),target=path.join(runtime,'.dsh/profiles/web/node_modules/@naumi/dsh-enterprise');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=p=>fs.readFileSync(p),norm=p=>read(p).toString().replaceAll('\r\n','\n');
assert.equal(execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),'main');
execFileSync('git',['diff','--exit-code','HEAD'],{stdio:'pipe'}); // Unrelated untracked evidence is retained.
assert(fs.realpathSync(target).startsWith(fs.realpathSync(runtime)+path.sep));
const sdk=path.join(runtime,'node_modules/@modelcontextprotocol/server/package.json');
assert.equal(JSON.parse(read(sdk)).version,'2.2.0','INSTALL_EXACT_SDK_FIRST');
const backup=path.join(runtime,'runtime','blender-load-'+randomUUID());fs.mkdirSync(backup,{recursive:true});
const inventory=()=>Object.fromEntries(fs.readdirSync(target,{recursive:true}).filter(f=>fs.statSync(path.join(target,f)).isFile()).map(f=>[f.replaceAll('\\','/'),sha(read(path.join(target,f)))]));
const before=inventory(),files=['host.js','client.js','package.json','blender.js','blender-runtime.js','blender-bridge/client.js','blender-bridge/server.mjs','blender-bridge/addon.py','blender-skills/naumi-blender/SKILL.md','assets/blender-settings.js','assets/blender-settings.css','third-party/blender-mcp/LICENSE','third-party/blender-mcp/NOTICE','third-party/blender-mcp/UPSTREAM.json'],rows=[];
for(const file of files){
 const source=path.join(root,'plugins/naumi-enterprise',file),dest=path.join(target,file),original=fs.existsSync(dest)?read(dest):null;let next=read(source);
 if(original){const p=path.join(backup,'before',file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,original);}
 if(file==='host.js'){
  let text=norm(dest);assert(!text.includes('installBlender'));
  text="import {installBlender} from './blender.js';\n"+text;
  const anchor='  installAgentDesktop(ctx);';assert(text.includes(anchor));text=text.replace(anchor,anchor+'\n  installBlender(ctx);');
  const assets="  assets.set('model-connections.js'";assert(text.includes(assets));text=text.replace(assets,"  assets.set('blender-settings.js','text/javascript; charset=utf-8');\n  assets.set('blender-settings.css','text/css; charset=utf-8');\n"+assets);
  const css='<link rel="stylesheet" href="/naumi/assets/style.css">';assert(text.includes(css));text=text.replace(css,css+'<link rel="stylesheet" href="/naumi/assets/blender-settings.css">');next=Buffer.from(text);
 }
 if(file==='client.js'){
  let text=norm(dest);assert(!text.includes("import('/naumi/assets/blender-settings.js')"));
  const anchor='function installNaumiContextUI(ctx,React,createPortal,Icon){',addition=norm(source).split('\n').find(l=>l.includes("import('/naumi/assets/blender-settings.js')"));
  assert(text.includes(anchor)&&addition);next=Buffer.from(text.replace(anchor,anchor+'\n'+addition));
 }
 if(file==='package.json'){
  const p=JSON.parse(original);for(const name of ['blender.js','blender-runtime.js','blender-bridge','blender-skills']){assert(!p.files.includes(name));p.files.push(name);}
  p.peerDependencies['@modelcontextprotocol/server']='2.2.0';next=Buffer.from(JSON.stringify(p,null,2)+'\n');
 }
 const p=path.join(backup,'after',file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,next);rows.push({file,before:original?sha(original):null,after:sha(next)});
}
async function idle(){
 const api=await botLiveApi(runtime),sessions=await api.rpc('session/list',{_request:{}}),tasks=await api.json('/naumi/bot-tasks');
 assert(!sessions.items.some(s=>s.running),'RUNNING_SESSIONS');assert(!tasks.tasks.some(t=>['queued','starting','running','waiting'].includes(t.status)),'ACTIVE_TASKS');
 const db=new DatabaseSync(path.join(runtime,'.dsh/naumi/bot-groups.sqlite'),{readOnly:true});try{assert.equal(db.prepare("SELECT count(*) AS n FROM replies WHERE state IN ('queued','starting','sent')").get().n,0,'ACTIVE_GROUP_REPLIES');}finally{db.close();}
 return sessions.items.length;
}
function shell(file){const r=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-File',path.join(runtime,file)],{encoding:'utf8',windowsHide:true,timeout:150000});process.stdout.write(r.stdout??'');assert.equal(r.status,0,r.stderr);}
let changed=false,complete=false;
try{
 const sessions=await idle();console.log('BLENDER_DEPLOY_IDLE sessions='+sessions+' running=0 tasks=0 group_replies=0');shell('Stop-Naumi.ps1');changed=true;
 for(const row of rows){const p=path.join(target,row.file);assert.equal(fs.existsSync(p)?sha(read(p)):null,row.before,'RUNTIME_DRIFT '+row.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(backup,'after',row.file),p);}
 shell('Start-Naumi.ps1');const api=await botLiveApi(runtime);let state;
 for(let i=0;i<40;i++){state=await api.json('/naumi/blender');if(state.toolRegistered)break;await new Promise(r=>setTimeout(r,250));}
 assert.equal(state.toolCount,6);assert.equal(state.connected,false);assert.equal(state.running,false);
 const after=inventory();for(const row of rows)assert.equal(after[row.file],row.after);for(const [file,hash]of Object.entries(before))if(!files.includes(file))assert.equal(after[file],hash,'UNRELATED_CHANGED '+file);
 complete=true;const result={status:'PASS',mainCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sessions,running:0,toolCount:state.toolCount,engine:state.engine,connected:false,engineAutoLaunched:false,files:rows,unrelatedFilesUnchanged:Object.keys(before).filter(f=>!files.includes(f)).length,unrelatedChanged:0,backup,modelCalls:0,installerRebuilt:false};
 fs.writeFileSync(path.join(root,'evidence/blender-mcp/DEPLOYMENT.json'),JSON.stringify(result,null,2)+'\n');console.log('BLENDER_DEPLOY_COMPLETE tools=6 connected=false auto_launch=0 unrelated_changed=0 model_calls=0');
}finally{
 if(changed&&!complete){try{shell('Stop-Naumi.ps1');}catch{}for(const row of rows){const p=path.join(target,row.file);if(row.before)fs.copyFileSync(path.join(backup,'before',row.file),p);else if(fs.existsSync(p))fs.unlinkSync(p);}shell('Start-Naumi.ps1');console.log('BLENDER_DEPLOY_FAILED original_plugin_restored=1');}
}
