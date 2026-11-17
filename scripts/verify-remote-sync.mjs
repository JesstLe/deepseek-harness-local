import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import os from 'node:os';import {pathToFileURL} from 'node:url';
const mode=process.argv[2]??'modified',root=path.resolve(process.argv[3]??'plugins/naumi-enterprise'),expected=mode==='modified';
const group=fs.existsSync(path.join(root,'bot-groups.js')),handoff=fs.existsSync(path.join(root,'bot-task-handoff.js'));
assert.equal(group,expected);assert.equal(handoff,expected);const source=fs.readFileSync(path.join(root,'bot-task-service.js'),'utf8');assert(source.includes('BOT_TASK_SESSION_REQUIRED'));assert(source.includes('t.progress!==undefined'));
if(expected){
 assert(fs.readFileSync(path.join(root,'client.js'),'utf8').includes("['naumi-bot-groups','Bot 群聊','chat']"));
 assert(fs.readFileSync(path.join(root,'host.js'),'utf8').includes("assets.set('bot-groups.js'"));
 const {BotGroupStore}=await import(pathToFileURL(path.join(root,'bot-group-store.js')));const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-sync-sqlite-'));try{const s=new BotGroupStore(path.join(tmp,'groups.sqlite'));try{assert.deepEqual(s.rooms(),[]);}finally{s.close();}}finally{assert(path.resolve(tmp).startsWith(path.resolve(os.tmpdir())+path.sep));fs.rmSync(tmp,{recursive:true,force:true});}
 const {handoffSnapshot}=await import(pathToFileURL(path.join(root,'bot-task-handoff.js')));assert.equal(typeof handoffSnapshot,'function');
}
console.log(`${mode.toUpperCase()} group=${group?'REGISTERED':'ABSENT'} handoff=${handoff?'INSTALLED':'ABSENT'} integrity=PRESERVED model_calls=0`);
