import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {EmployeeStore} from '../plugins/naumi-enterprise/employee-store.js';
import {EmployeeHeartbeat} from '../plugins/naumi-enterprise/employee-service.js';

const mode=process.argv[2]??'modified',e='evidence/employee-foundation/';
if(['baseline','rollback'].includes(mode)){
  const dir=e+(mode==='baseline'?'original/':'rollback-copy/'),source=fs.readFileSync(dir+'bots.js','utf8'),manifest=JSON.parse(fs.readFileSync(dir+'package.json','utf8'));
  assert(!source.includes('installEmployees'));assert(!manifest.files.includes('employee-store.js'));
  console.log(`${mode.toUpperCase()} employee_profile=ABSENT local_memory=ABSENT work_heartbeat=ABSENT`);
}else{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-employee-proof-')),file=path.join(dir,'employees.sqlite');let store;
  try{
    store=new EmployeeStore(file);store.learnExplicit('bot-fixture','user-message-1','以后回复先给结论','session-fixture');
    assert.equal(store.profile('bot-fixture').communicationStyle,'先给结论');assert.equal(store.memories('bot-fixture',{query:'先给结论'}).length,1);
    store.close();store=new EmployeeStore(file);assert.equal(store.profile('bot-fixture').revision,1);
    assert.equal(store.memories('other-bot').length,0);
    const heartbeat=new EmployeeHeartbeat({agents:{list:()=>[]},directory:{list:()=>({bots:[]}),forSession:()=>null},store});heartbeat.tick();assert.equal(heartbeat.read().modelCalls,0);heartbeat.close();
    console.log('MODIFIED profile=PASS explicit_memory=PASS reopen=PASS bot_isolation=PASS heartbeat_llm_calls=0');
  }finally{store?.close();if(!path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('BAD_TEMP_PATH');fs.rmSync(dir,{recursive:true,force:true});}
}
