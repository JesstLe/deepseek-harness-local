import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
import {botLiveApi} from './bot-live-api.mjs';
const evidence='E:/Workspace/naumi-design-ops-digital-employees/evidence/digital-employees',api=await botLiveApi();
const status=await api.json('/naumi/employee-sync');assert.equal(status.registered,false);assert.equal(status.enabled,false);assert.equal(status.syncState,'local_only');
const unauthorized=await fetch(api.base+'/naumi/employee-sync');assert.equal(unauthorized.status,401);
const {chromium}=await import(pathToFileURL('E:/Workspace/naumi/node_modules/playwright/index.mjs').href),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const runtime='E:/Workspace/naumi-desktop',logs=['server.out.log','server.err.log'].map(p=>fs.readFileSync(path.join(runtime,'logs',p),'utf8')).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
try{
 await page.goto(launch,{waitUntil:'domcontentloaded'});await page.getByText('员工中心',{exact:true}).first().click();await page.getByRole('tab',{name:'企业',exact:true}).click();const panel=page.locator('[data-employee-enterprise]');await panel.getByRole('button',{name:'登记设备',exact:true}).waitFor();
 assert(await panel.getByText('仅本地',{exact:true}).isVisible());assert.equal(errors.length,0);await page.screenshot({path:evidence+'/LIVE_EMPLOYEE_ENTERPRISE.png',animations:'disabled'});
 fs.writeFileSync(evidence+'/LIVE_HARNESS.json',JSON.stringify({status:'PASS',tier:'actual deployed Harness; no route mocking; read only',registered:status.registered,enabled:status.enabled,anonymousStatus:unauthorized.status,pageErrors:errors,productionMutations:0},null,2));
 console.log('LIVE_HARNESS enterprise_tab=PASS sync_api=200 anonymous=401 enrollment=off upload=off mutations=0');
}finally{await browser.close();}
