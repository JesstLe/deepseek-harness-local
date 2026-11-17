import fs from 'node:fs';import assert from 'node:assert/strict';import {EmployeeWorkStore} from '../plugins/naumi-enterprise/employee-work-store.js';import {employeeHost} from '../tests/helpers/employee-host.mjs';
const mode=process.argv[2]??'modified',e='evidence/employee-center/';
if(mode==='baseline'||mode==='rollback'){
 const base=e+(mode==='baseline'?'original/':'rollback-copy/');assert(!fs.readFileSync(base+'client.js','utf8').includes('employee-center.js'));assert(!JSON.parse(fs.readFileSync(base+'package.json','utf8')).files.includes('employee-work.js'));
 console.log(`${mode.toUpperCase()} employee_center=ABSENT goal_management=ABSENT business_acceptance=ABSENT`);
}else{
 const f=await employeeHost();try{const w=new EmployeeWorkStore(f.store),b=f.sourceBot.id,g=w.createGoal(b,{operationId:'g',title:'验证目标',criteria:['正文可核验']});let d=w.createDelivery(b,{operationId:'d',goalId:g.id,title:'验证正文',fileName:'正文.md',content:'第一版'});
 const move=(action,extras={})=>{d=w.transition(b,{deliveryId:d.id,expectedRevision:d.revision,operationId:action+'-'+d.revision,action,...extras});};move('submit');move('request_changes',{reason:'补充依据'});const original=d.currentArtifactId;d=w.reviseDelivery(b,{operationId:'revise',deliveryId:d.id,expectedRevision:d.revision,fileName:'正文.md',content:'第二版，依据完整'});move('submit');move('start_review');move('accept',{checkedCriteria:[0],reason:'依据充分'});assert.equal(w.artifact(b,original).content,'第一版');assert.equal(d.version,2);assert.equal(d.businessStatus,'accepted');
 console.log('MODIFIED goals=PASS immutable_versions=2 return_revise=PASS owner_acceptance=PASS');}finally{await f.cleanup();}
}
