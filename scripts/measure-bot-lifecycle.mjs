import fs from 'node:fs';
import * as module from '../plugins/naumi-enterprise/bots.js';
import {botRuntime} from '../tests/helpers/bot-runtime.mjs';

const durations=[];
for(let i=0;i<25;i++){
  const f=await botRuntime(module);
  try{
    const start=performance.now();
    await f.invoke('bot_create',{name:'性能验证 Bot',kind:'agent',purpose:'仅验证本地身份保存，不启动模型或业务任务'});
    durations.push(performance.now()-start);
  }finally{await f.dispose();}
}
durations.sort((a,b)=>a-b);
const result={tier:'real Cordis container with fixture host adapters and real disk; no model call',
  samples:durations.length,p50Ms:+durations[12].toFixed(3),p95Ms:+durations[23].toFixed(3),maxMs:+durations[24].toFixed(3),
  modelCalls:0,liveBotWrites:0,targetMs:3000,pass:durations[24]<3000};
fs.writeFileSync('evidence/bot-lifecycle/latency.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));if(!result.pass)process.exitCode=1;
