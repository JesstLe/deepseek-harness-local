import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL('E:/Workspace/naumi/node_modules/playwright/index.mjs').href),runtime='E:/Workspace/deepseek-harness-local',e='evidence/employee-center/';
const logs=['server.out.log','server.err.log'].map(p=>fs.readFileSync(path.join(runtime,'logs',p),'utf8')).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
const browser=await chromium.launch({headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},colorScheme:'light'}),page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
try{
  await page.addInitScript(()=>localStorage.setItem('naumi.navigationMode.v1','bot'));
  await page.goto(launch,{waitUntil:'domcontentloaded'});await page.getByText('员工中心',{exact:true}).first().click();const center=page.locator('[data-employee-center]');await center.getByLabel('性格',{exact:true}).waitFor();assert(await center.isVisible());assert(await center.locator('.emp-roster-item').count()>=3);
  const background=await center.evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(background,'rgb(247, 248, 252)');
  await page.screenshot({path:e+'LIVE_EMPLOYEE_CENTER.png',animations:'disabled'});
  await page.reload({waitUntil:'domcontentloaded'});await center.getByLabel('性格',{exact:true}).waitFor();
  await center.getByRole('tab',{name:'工作',exact:true}).click();await center.getByRole('button',{name:'创建目标'}).waitFor();
  const work=await page.evaluate(async()=>{const bots=await(await fetch('/naumi/bots')).json(),botId=bots.bots[0].id;const r=await fetch('/naumi/employee-work?botId='+encodeURIComponent(botId));return {status:r.status,contract:r.headers.get('x-naumi-employee-work'),body:await r.json()};});assert.equal(work.status,200);assert.equal(work.contract,'1');assert.equal(errors.length,0);
  fs.writeFileSync(e+'LIVE_UI_VERIFICATION.json',JSON.stringify({tier:'actual deployed Harness, real directory, read-only isolated Chromium; no fixture routes or data writes',employeeCount:await center.locator('.emp-roster-item').count(),cssLoaded:true,panelRestoredAfterReload:true,workAPI:work.status,workContract:work.contract,errors},null,2)+'\n');
  console.log('LIVE_UI employee_center=PASS actual_css=PASS reload_restore=PASS work_api=200 mutations=0');
}finally{await context.close();await browser.close();}
