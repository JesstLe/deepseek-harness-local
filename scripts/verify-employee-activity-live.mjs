import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {botLiveApi} from './bot-live-api.mjs';
const e='evidence/proactive-runtime',api=await botLiveApi(),catalog=await api.json('/naumi/bots'),botId=catalog.bots[0]?.id;assert(botId);
const data=await api.json('/naumi/employee-activity?'+new URLSearchParams({botId})),status=await api.json('/naumi/employee-sync');
assert.equal(data.domain,'local-owner');assert.equal(data.scheduler.modelCalls,0);assert.equal(data.scheduler.externalActions,0);assert.equal(data.capabilities.toolPermissionNotInferred,true);
assert(data.capabilities.records.length>=4);assert.equal(data.rules.length,0);assert.equal(status.registered,false);assert.equal(status.enabled,false);
const anonymous=await fetch(api.base+'/naumi/employee-activity?'+new URLSearchParams({botId}));assert.equal(anonymous.status,401);
const {chromium}=await import(pathToFileURL('E:/Workspace/naumi/node_modules/playwright/index.mjs').href),browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1460,height:1080},colorScheme:'light'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  const logs=(await Promise.all(['server.out.log','server.err.log'].map(n=>fs.readFile('E:/Workspace/naumi-desktop/logs/'+n,'utf8')))).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
  await page.goto(launch,{waitUntil:'domcontentloaded'});await page.getByText('员工中心',{exact:true}).first().click();await page.getByRole('tab',{name:'运行',exact:true}).click();const panel=page.locator('[data-employee-activity]');await panel.getByRole('heading',{name:'主动规则',exact:true}).waitFor();await panel.getByText('钉钉 CLI',{exact:true}).waitFor();assert.equal(errors.length,0);
  await page.screenshot({path:e+'/LIVE_ACTIVITY.png',animations:'disabled',mask:[page.locator('[data-user-phone],.naumi-user-phone')]});
  await fs.writeFile(e+'/LIVE_VERIFICATION.json',JSON.stringify({status:'PASS',tier:'actual deployed 3080, no route mocks, read only',http:200,anonymous:anonymous.status,rules:data.rules.length,modelCalls:data.scheduler.modelCalls,externalActions:data.scheduler.externalActions,registered:status.registered,privateUpload:status.enabled,capabilities:data.capabilities.records.map(({id,installed,connected,authorized,healthy,stale,reasonCode})=>({id,installed,connected,authorized,healthy,stale,reasonCode})),pageErrors:errors,businessMutations:0},null,2));
  console.log('LIVE_ACTIVITY http=200 anonymous=401 ui=PASS rules=0 model_calls=0 business_mutations=0 enrollment=off private_upload=off');
}finally{await browser.close();}
