import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {botRuntime} from '../tests/helpers/bot-runtime.mjs';
import {botTaskHost} from '../tests/helpers/bot-task-host.mjs';

const mode=process.argv[2]??'modified';
if(['baseline','rollback'].includes(mode)){
  const file=path.resolve('evidence/bot-communication',mode==='baseline'?'original':'rollback-copy','bots.js');
  const f=await botRuntime(await import(pathToFileURL(file).href));
  try{assert.equal(f.tools.size,4);assert(!f.tools.has('bot_dispatch'));
    const bot=await f.invoke('bot_create',{name:'验证 Bot',kind:'agent',purpose:'验证身份创建仍有效'});assert.equal(bot.agentPreset,'standard');
    console.log(`${mode.toUpperCase()} directory_tools=4 create=PASS bot_dispatch=ABSENT result_return=ABSENT`);
  }finally{await f.dispose();}
}else{
  const f=await botTaskHost();
  try{
    const input={action:'dispatch',sourceSessionId:f.sender.id,targetBotId:f.targetBot.id,task:'返回验证文本',idempotencyKey:'verification-1'};
    const response=await f.request(input);assert.equal(response.status,200);const task=await response.json();await f.service.settled();
    assert.equal(f.directory.forSession(task.targetSessionId).id,f.targetBot.id);assert.equal(f.directory.list().bots.length,2);
    const again=await (await f.request(input)).json();assert.equal(again.id,task.id);
    await f.complete(task);assert.equal(f.service.current(task.id).status,'completed');
    assert.equal(f.sender.inbox.nextStep.length,1);assert.match(f.sender.inbox.nextStep[0].content[0].text,/真实会话格式交付/);
    console.log('MODIFIED dispatch=PASS target_bot=reused session=linked result_return=PASS duplicate_delivery=0');
  }finally{await f.cleanup();}
}
