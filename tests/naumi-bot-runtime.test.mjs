import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as module from '../plugins/naumi-enterprise/bots.js';
import {botRuntime} from './helpers/bot-runtime.mjs';

const input={name:'运营助手',kind:'agent',purpose:'运营规划与复盘'};
for(const lateAgent of [false,true])test(`real Cordis dependency injection creates Bot (lateAgent=${lateAgent})`,async()=>{
  const f=await botRuntime(module,{lateAgent});
  try{
    assert.equal(f.tools.size,6);
    assert(f.tools.has('bot_group_list'));assert(f.tools.has('bot_group_rename'));
    assert.match(f.prompts.get('naumi:group-management').text,/use those tools directly/);
    const bot=await f.invoke('bot_create',input);
    assert.equal(bot.agentPreset,'standard');assert.equal(f.presetReads(),1);
    assert.equal(bot.homeSessionId,f.root.id);assert.equal(f.directory.list().bots.length,1);
    assert.match(f.prompts.get('naumi:bot-identity').text(),/运营助手/);
  }finally{await f.dispose();}
  assert.equal(f.tools.size,0);assert.equal(f.routes.size,0);
});
test('an unselected preset remains absent rather than inventing a default or changing model/permissions',async()=>{
  const f=await botRuntime(module,{preset:null});
  try{
    const before=structuredClone(f.root.session),bot=await f.invoke('bot_create',input);
    assert(!Object.hasOwn(bot,'agentPreset'));assert.deepEqual(f.root.session,before);
  }finally{await f.dispose();}
});
test('concurrent identical retries produce one write, one event and one stable identity',async()=>{
  const f=await botRuntime(module);
  try{
    let writes=0,events=0;const write=f.directory.write;
    f.directory.write=async next=>{writes++;await write(next);};f.directory.subscribe(()=>events++);
    const bots=await Promise.all(Array.from({length:8},()=>f.invoke('bot_create',input)));
    assert.equal(new Set(bots.map(b=>b.id)).size,1);assert.equal(writes,1);assert.equal(events,1);
    assert.equal(f.directory.list().revision,1);assert.equal(bots.at(-1).revision,1);
  }finally{await f.dispose();}
});
test('retry after host restart returns the saved Bot and publishes no second creation',async()=>{
  const f=await botRuntime(module);
  try{
    const bot=await f.invoke('bot_create',input),file=path.join(f.dir,'bots.json');
    const before=fs.readFileSync(file,'utf8'),restored=new module.BotDirectory(file);
    try{
      const again=await restored.create({sessionId:f.root.id,cwd:f.dir,agentPreset:'standard'},input);
      assert.equal(again.id,bot.id);assert.equal(fs.readFileSync(file,'utf8'),before);
    }finally{await restored.close();}
  }finally{await f.dispose();}
});
test('retry cannot rename, replace responsibility, switch preset/workspace or revive an archived Bot',async()=>{
  const f=await botRuntime(module);
  try{
    await f.invoke('bot_create',input);
    for(const patch of [{name:'另一个名字'},{kind:'team'},{purpose:'其他职责'}])await assert.rejects(f.invoke('bot_create',{...input,...patch}),/BOT_SESSION_ALREADY_BOUND/);
    await assert.rejects(f.directory.create({sessionId:f.root.id,cwd:f.dir,agentPreset:'other'},input),/BOT_SESSION_ALREADY_BOUND/);
    await assert.rejects(f.directory.create({sessionId:f.root.id,cwd:path.dirname(f.dir),agentPreset:'standard'},input),/BOT_SESSION_ALREADY_BOUND/);
    await f.invoke('bot_update',{expectedRevision:1,status:'archived'});
    await assert.rejects(f.invoke('bot_create',input),/BOT_ARCHIVED/);
    assert.equal(f.directory.list().bots.length,1);assert.equal(f.directory.list().bots[0].status,'archived');
  }finally{await f.dispose();}
});
test('failed disk persistence leaves no false ready Bot and the same request succeeds after recovery',async()=>{
  const f=await botRuntime(module);
  try{
    const write=f.directory.write;f.directory.write=async()=>{throw Error('fixture disk failure');};
    await assert.rejects(f.invoke('bot_create',input),/fixture disk failure/);
    assert.equal(f.directory.list().bots.length,0);assert(!fs.existsSync(path.join(f.dir,'bots.json')));
    f.directory.write=write;await f.invoke('bot_create',input);assert.equal(f.directory.list().bots.length,1);
  }finally{await f.dispose();}
});
test('cancelled tool call does not create a Bot or read the selected preset',async()=>{
  const f=await botRuntime(module);
  try{
    await assert.rejects(f.tools.get('bot_create').execute(input,{agent:f.root,signal:AbortSignal.abort()}),{name:'AbortError'});
    assert.equal(f.presetReads(),0);assert.equal(f.directory.list().bots.length,0);
  }finally{await f.dispose();}
});
test('creation is documented as a bounded product operation, not a source-code repair job',async()=>{
  const f=await botRuntime(module);
  try{
    const policy=f.prompts.get('naumi:bots').text;
    assert.match(policy,/bot_create directly/);assert.match(policy,/check bot_directory once/);
    assert.match(policy,/do not search source code, run shell commands or edit internal files/);
    assert.match(policy,/without additional setup interviews/);
  }finally{await f.dispose();}
});
