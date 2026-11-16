import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {botRuntime} from '../tests/helpers/bot-runtime.mjs';

const [filename='plugins/naumi-enterprise/bots.js',mode='modified']=process.argv.slice(2);
const module=await import(pathToFileURL(path.resolve(filename)).href);
const f=await botRuntime(module);
const input={name:'运营助手',kind:'agent',purpose:'运营规划与复盘'};
try{
  if(mode==='baseline'||mode==='rollback'){
    await assert.rejects(Promise.resolve().then(()=>f.invoke('bot_create',input)),/cannot get property "agentPresets" without inject/);
    assert.equal(f.directory.list().bots.length,0);
    console.log(`${mode.toUpperCase()} reproduced=1 bots=0 error=cannot get property "agentPresets" without inject`);
  }else{
    const start=performance.now();
    const bot=await f.invoke('bot_create',input);
    assert.equal(bot.agentPreset,'standard');assert.equal(f.directory.list().bots.length,1);
    const again=await f.invoke('bot_create',input);
    assert.equal(bot.id,again.id);assert.equal(again.revision,1);
    const reopened=new module.BotDirectory(path.join(f.dir,'bots.json'));
    assert.deepEqual(reopened.list(),f.directory.list());await reopened.close();
    assert(performance.now()-start<3000,'local product operation exceeds 3s');
    console.log('MODIFIED created=1 preset=standard retry=same-id revision=1 persistence=PASS local-under-3s=PASS');
  }
}finally{await f.dispose();}
