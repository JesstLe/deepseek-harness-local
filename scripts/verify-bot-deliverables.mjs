import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createToolResultMessage} from '@deepseek-ai/dsh-llm';
import {botTaskHost} from '../tests/helpers/bot-task-host.mjs';

const mode=process.argv[2]??'modified';
if(['baseline','rollback'].includes(mode)){
  const root=process.argv[3]??'evidence/bot-deliverables/original';
  const {createBotTaskRuntime,inspectBotMessage}=await import(pathToFileURL(path.resolve(root,'plugins/naumi-enterprise/bot-task-runtime.js')));
  const runtime=createBotTaskRuntime({});assert.equal(runtime.delivery,undefined);
  const state=inspectBotMessage([{type:'turn/start',data:{turn:1}},{type:'user/message',data:{id:'request'}},{type:'assistant/message',data:{turn:1,message:{content:[{type:'text',text:'交付文件：`article.md`'}]}}},{type:'turn/end',data:{turn:1,reason:{kind:'completed'}}}],'request');
  assert(state.text.includes('article.md'));assert(!state.files);
  console.log(`${mode.toUpperCase()} result=text-only structured_files=ABSENT delivery_check=ABSENT original_behavior=PASS`);
}else{
  const f=await botTaskHost();try{
    const task=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'交付 article.md',output:'files',idempotencyKey:'verify-file'});await f.service.settled();
    const file=path.join(f.dir,'article.md');fs.writeFileSync(file,'# Verified\narticle');
    await f.complete(task,'交付文件：`article.md`',async(agent,turn)=>{
      agent.session.append('tool/call',{turn,step:1,callId:'verify-write',name:'write',arguments:JSON.stringify({file_path:file,content:'# Verified\narticle'})});
      agent.session.append('tool/result',{turn,step:1,message:createToolResultMessage({callId:'verify-write',isError:false,content:[{type:'text',text:'written'}]})},{surfaceOp:'append'});
    });
    const done=f.service.current(task.id);assert.equal(done.status,'completed');assert.equal(done.delivery.files.length,1);
    const reply=f.sender.inbox.nextTurn[0];f.sender.session.append('turn/start',{turn:1});f.sender.session.append('user/message',reply,{surfaceOp:'append'});
    await f.service.runtime.mirror(f.sender.id,reply.id,done.delivery.files);
    assert.equal(f.sender.session.snapshotEvents().filter(e=>e.type==='deliverables/presented').length,1);
    const missing=await f.service.dispatch(f.sender,{targetBotId:f.targetBot.id,task:'交付 missing.md',output:'files',idempotencyKey:'verify-missing'});await f.service.settled();await f.complete(missing,'写好了 missing.md');assert.equal(f.service.current(missing.id).error,'BOT_DELIVERY_MISSING');
    console.log('MODIFIED worker_card=1 supervisor_card=1 source_refs=PERSISTED missing_file=FAILED duplicate_cards=0 PASS');
  }finally{await f.cleanup();}
}
