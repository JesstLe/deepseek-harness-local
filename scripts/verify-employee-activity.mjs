import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';
import {EmployeeActivityStore} from '../plugins/naumi-enterprise/employee-activity-store.js';

const root=path.resolve(process.argv[3]??'.'),mode=process.argv[2]??'modified',e=path.resolve('evidence/proactive-runtime');
if(mode==='baseline'){
  const source=fs.readFileSync(path.join(root,'plugins/naumi-enterprise/employees.js'),'utf8');assert(!source.includes('installEmployeeActivity'));assert(!fs.existsSync(path.join(root,'plugins/naumi-enterprise/employee-activity.js')));
  console.log('BASELINE proactive_rules=ABSENT capabilities=ABSENT progress_observer=ABSENT');
}else if(mode==='modified'){
  fs.mkdirSync(e,{recursive:true});const dir=fs.mkdtempSync(path.join(e,'crash-test-')),file=path.join(dir,'employees.sqlite');
  const storeURL=pathToFileURL(path.resolve('plugins/naumi-enterprise/employee-store.js')).href,activityURL=pathToFileURL(path.resolve('plugins/naumi-enterprise/employee-activity-store.js')).href;
  const script=`import fs from 'node:fs';import {EmployeeStore} from ${JSON.stringify(storeURL)};import {EmployeeActivityStore} from ${JSON.stringify(activityURL)};
    let ms=Date.parse('2031-01-06T10:00:00Z');const s=new EmployeeStore(${JSON.stringify(file)},{clock:()=>new Date(ms)}),a=new EmployeeActivityStore(s);
    if(process.env.CRASH_PHASE==='uncommitted'){
      let r=a.command({action:'rule_create',botId:'bot-fixture',operationId:'create',config:{title:'崩溃恢复',trigger:{kind:'every',seconds:60},action:{kind:'notify',text:'真实本地通知'},workWindow:{timeZone:'UTC',days:[1,2,3,4,5,6,7],startMinute:0,endMinute:1440},cooldownSeconds:60,maxActions:5}});
      a.command({action:'rule_enable',botId:r.botId,operationId:'approve',ruleId:r.id,expectedRevision:r.revision,enabled:true});ms+=60000;
      s.beforeCommit=()=>{fs.writeSync(1,'TX_OPEN\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);};a.tick(['bot-fixture']);
    }else{ms+=60000;const r=a.tick(['bot-fixture']);fs.writeSync(1,'COMMITTED '+r.actions+'\\n');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,30000);}`;
  const kills=[];
  async function killAt(phase,marker){return new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['--input-type=module','-e',script],{env:{...process.env,CRASH_PHASE:phase},stdio:['ignore','pipe','pipe']});let out='',err='',killed=false;
    const timeout=setTimeout(()=>{child.kill();reject(Error('CRASH_TEST_TIMEOUT'));},20000);
    child.stdout.on('data',b=>{out+=b;if(out.includes(marker)&&!killed){killed=true;child.kill('SIGKILL');}});child.stderr.on('data',b=>err+=b);
    child.on('error',reject);child.on('close',(code,signal)=>{clearTimeout(timeout);if(!killed)return reject(Error('EARLY_CHILD_EXIT '+code+' '+err));kills.push({phase,stdout:out.trim(),exitCode:code,signal});resolve();});
  });}
  try{
    await killAt('uncommitted','TX_OPEN');let s=new EmployeeStore(file,{clock:()=>new Date('2031-01-06T10:01:00Z')}),a=new EmployeeActivityStore(s);assert.equal(a.runs('bot-fixture').length,0);assert.equal(a.notifications('bot-fixture').length,0);s.close();
    await killAt('committed','COMMITTED 1');s=new EmployeeStore(file,{clock:()=>new Date('2031-01-06T10:01:00Z')});a=new EmployeeActivityStore(s);assert.equal(a.runs('bot-fixture').length,1);assert.equal(a.notifications('bot-fixture').length,1);assert.equal(a.tick(['bot-fixture']).actions,0);s.close();
    fs.writeFileSync(path.join(e,'PROCESS_RECOVERY.json'),JSON.stringify({status:'PASS',kills,uncommittedEffects:0,recoveredEffects:1,duplicateActions:0},null,2));
    console.log('MODIFIED kill_before_commit=PASS restart_no_replay=PASS committed_effects=1 duplicate_actions=0');
  }finally{assert(dir.startsWith(e+path.sep));fs.rmSync(dir,{recursive:true,force:true});}
}else throw Error('UNKNOWN_MODE');
