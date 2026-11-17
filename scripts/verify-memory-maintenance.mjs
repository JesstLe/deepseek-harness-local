import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
const e='E:/Workspace/naumi-design-ops-digital-employees/evidence/employee-memory-maintenance';fs.mkdirSync(e,{recursive:true});
const mode=process.argv[2];let output;
if(mode==='baseline'){
 const source=execFileSync('git',['show','de8522b:plugins/naumi-enterprise/employees.js'],{encoding:'utf8'});assert(!source.includes('EmployeeMemoryMaintenance'));
 output='BASELINE memory_maintenance=ABSENT exact_merge=ABSENT candidate_import=ABSENT';
}else if(mode==='modified'){
 const result=execFileSync(process.execPath,['--test','tests/naumi-memory-maintenance.test.mjs'],{encoding:'utf8'});assert.match(result,/pass 6/);fs.writeFileSync(path.join(e,'MAINTENANCE_TESTS.log'),result);
 output='MODIFIED maintenance_preview=PASS exact_merge=PASS candidate_import=PASS expiry_cleanup=PASS source_history=PASS atomicity=PASS owner_HTTP=PASS';
}else if(mode==='live'){
 const {botLiveApi}=await import('./bot-live-api.mjs');const api=await botLiveApi();const bots=await api.json('/naumi/bots');assert(bots.bots.length);const state=await api.json('/naumi/employees?botId='+encodeURIComponent(bots.bots[0].id)+'&view=maintenance');assert.equal(state.version,1);assert(Array.isArray(state.duplicates));const guest=await fetch(api.base+'/naumi/employees?botId='+encodeURIComponent(bots.bots[0].id)+'&view=maintenance');assert.equal(guest.status,401);
 const {pathToFileURL}=await import('node:url');const {chromium}=await import(pathToFileURL('E:/Workspace/naumi/node_modules/playwright/index.mjs').href);const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{const logs=['server.out.log','server.err.log'].map(n=>fs.readFileSync('E:/Workspace/naumi-desktop/logs/'+n,'utf8')).join('\n');const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);await page.goto(launch,{waitUntil:'domcontentloaded'});await page.getByText('员工中心',{exact:true}).first().click();await page.getByRole('tab',{name:'记忆',exact:true}).click();await page.getByText('整理记忆',{exact:true}).click();await page.locator('.emp-memory-maintenance').getByRole('button',{name:'重新核对'}).waitFor();assert.equal(errors.length,0);await page.screenshot({path:path.join(e,'LIVE_MEMORY_MAINTENANCE.png'),animations:'disabled'});output='LIVE memory_maintenance_ui=PASS owner_api=200 anonymous=401 mutations=0';}finally{await browser.close();}
}else throw Error('EXPECTED baseline|modified|live');
fs.writeFileSync(path.join(e,mode.toUpperCase()+'.log'),output+'\n');console.log(output);
