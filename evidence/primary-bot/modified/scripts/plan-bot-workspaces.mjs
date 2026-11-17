// Read-only migration inventory. A plan is not an authorization to move/delete shared files.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {zstdDecompressSync} from 'node:zlib';import {pathToFileURL} from 'node:url';
const sha=b=>createHash('sha256').update(b).digest('hex'),key=p=>path.resolve(p).toLowerCase();
export function planBotWorkspaces({home,catalog,eventsFor,ledger={tasks:[]}}){
 const roots=[...new Set(catalog.bots.map(b=>path.resolve(b.cwd)))],records=new Map(),warnings=[];
 const note=(bot,raw,kind,sessionId)=>{if(typeof raw!=='string'||!raw.trim())return;const source=path.resolve(bot.cwd,raw),relative=path.relative(bot.cwd,source);if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative)){warnings.push({botId:bot.id,kind:'outside-workspace-reference',source});return;}
  const k=key(source);if(!records.has(k))records.set(k,{source,writers:new Set(),presenters:new Set(),sessions:new Set()});const row=records.get(k);row[kind].add(bot.id);row.sessions.add(sessionId);
 };
 for(const bot of catalog.bots)for(const sessionId of bot.sessionIds){let events;try{events=eventsFor(sessionId);}catch{warnings.push({botId:bot.id,sessionId,kind:'session-not-readable'});continue;}
  for(const event of events){if(event.type==='deliverables/presented')for(const file of event.data.files??[])note(bot,file.path,'presenters',sessionId);
   if(event.type==='tool/call'&&['write','edit'].includes(event.data.name)){
    const result=events.find(e=>e.type==='tool/result'&&e.data.message?.toolCallId===event.data.callId);if(!result||result.data.message.isError)continue;
    let args=event.data.arguments;try{if(typeof args==='string')args=JSON.parse(args);}catch{continue;}note(bot,args?.file_path??args?.path,'writers',sessionId);
   }
  }
 }
 for(const task of ledger.tasks??[]){const bot=catalog.bots.find(b=>b.id===task.targetBotId);if(bot)for(const file of task.delivery?.files??[])note(bot,file.path,'writers',task.targetSessionId);}
 const files=[];for(const row of records.values()){
  const owners=[...(row.writers.size?row.writers:row.presenters)],targets=owners.map(id=>{const bot=catalog.bots.find(b=>b.id===id),relative=path.relative(bot.cwd,row.source);return{botId:id,destination:path.join(home,'naumi/workspaces',id,relative)};});
  let status='missing',bytes=null,hash=null;try{const stat=fs.lstatSync(row.source);if(stat.isSymbolicLink())status='link-review';else if(stat.isFile()){status=owners.length>1?'shared-review':'copy-candidate';bytes=stat.size;hash=sha(fs.readFileSync(row.source));}else status='not-regular-file';}catch{}
  if(/(?:^|[\\/])(?:\.env(?:\.|$)|\.credentials|credentials|id_rsa|id_ed25519)|(?:api[-_]?key|token|secret|cookie)/i.test(row.source))status='sensitive-review';
  files.push({source:row.source,status,bytes,sha256:hash,ownerBotIds:owners,viewerBotIds:[...row.presenters].filter(id=>!owners.includes(id)),sourceSessionIds:[...row.sessions],targets});
 }
 const known=new Set(files.map(f=>key(f.source))),unassigned=[];
 const walk=(root,dir=root)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isSymbolicLink()){unassigned.push({source:p,status:'link-review'});continue;}if(entry.isDirectory()){if(['.git','node_modules','.dsh'].includes(entry.name)){unassigned.push({source:p,status:'excluded-directory'});continue;}walk(root,p);}else if(entry.isFile()&&!known.has(key(p)))unassigned.push({source:p,status:'unassigned',bytes:fs.statSync(p).size});}};
 for(const root of roots)try{walk(root);}catch{warnings.push({source:root,kind:'workspace-inventory-incomplete'});}
 return {version:1,status:'PLAN_ONLY',catalogRevision:catalog.revision,primaryBotId:catalog.primaryBotId??null,bots:catalog.bots.map(b=>({botId:b.id,name:b.name,sourceWorkspace:b.cwd,destinationWorkspace:path.join(home,'naumi/workspaces',b.id),homeSessionId:b.homeSessionId,sessionIds:b.sessionIds})),files,unassigned,warnings,
  invariants:['Keep existing Session IDs, headers/cwd, task IDs and file preview references unchanged.','Copy verified historical deliverables before routing new work to dedicated workspaces.','Do not delete original files while old Session previews/continuations depend on them.','Shared, sensitive, unassigned or missing files require explicit resolution; never guess ownership.','Switch new reception homes and future task cwd atomically only after copy, hash, registry and model/permission verification.'],
  phases:['Freeze admission at running=0 with no queued task/group replies; checkpoint data and hashes.','Resolve review rows, copy each approved file without overwriting collisions, rehash source and target.','Create native dedicated Workspace and new reception Session for each Bot using its own recorded model/preset/permissions.','CAS-publish new home/cwd; retain old homes as history; old tasks keep original targetSessionId/targetCwd.','Verify old previews, new workspace creation, original-task amendment, account separation and rollback before retiring any originals.']};
}
export function readStoredEvents(home,id){const root=path.join(home,'sessions');let file;for(const p of fs.readdirSync(root)){const candidate=path.join(root,p,id,'session.v4.jsonl.zstd');if(fs.existsSync(candidate)){file=candidate;break;}}if(!file)throw Error('SESSION_MISSING');const input=fs.readFileSync(file),parts=[];let offset=0;while(offset<input.length){const result=zstdDecompressSync(input.subarray(offset),{info:true});if(!result.engine.bytesWritten)throw Error('SESSION_FRAME_INVALID');offset+=result.engine.bytesWritten;parts.push(result.buffer);}return Buffer.concat(parts).toString('utf8').split('\n').filter(Boolean).map(JSON.parse);}
if(import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const runtime=path.resolve(process.argv[2]??'E:/Workspace/naumi-desktop'),home=path.join(runtime,'.dsh'),output=path.resolve(process.argv[3]??path.join(runtime,'runtime/bot-workspace-migration-plan.json')),catalog=JSON.parse(fs.readFileSync(path.join(home,'naumi/bots.json'))),ledger=JSON.parse(fs.readFileSync(path.join(home,'naumi/bot-tasks.json')));
 const before=sha(fs.readFileSync(path.join(home,'naumi/bots.json'))),plan=planBotWorkspaces({home,catalog,ledger,eventsFor:id=>readStoredEvents(home,id)});fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(plan,null,2)+'\n');if(sha(fs.readFileSync(path.join(home,'naumi/bots.json')))!==before)throw Error('CATALOG_CHANGED_DURING_PLAN');
 console.log('WORKSPACE_PLAN bots='+plan.bots.length+' files='+plan.files.length+' copy_candidates='+plan.files.filter(f=>f.status==='copy-candidate').length+' review='+plan.files.filter(f=>f.status!=='copy-candidate').length+' unassigned='+plan.unassigned.length+' warnings='+plan.warnings.length+' source_writes=0 model_calls=0 output='+output);
}
