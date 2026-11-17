import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {botLiveApi} from './bot-live-api.mjs';

const root=path.resolve(process.argv[2]??'E:/Workspace/naumi-desktop'),api=await botLiveApi(root),e=path.resolve('evidence/async-bot');
const bots=(await api.json('/naumi/bots')).bots,tasks=(await api.json('/naumi/bot-tasks?view=activity')).tasks;
const source=bots.find(b=>tasks.some(t=>t.sourceSessionId===b.homeSessionId));assert(source,'A real reception task is required');
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:980},colorScheme:'light'}),page=await context.newPage();
const checks=[],errors=[],assets=new Set();let feeds=0,writes=0;
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
page.on('request',r=>{const u=new URL(r.url());if(u.pathname.startsWith('/naumi/assets/'))assets.add(u.pathname.split('/').at(-1));if(u.pathname==='/naumi/bot-tasks/events')feeds++;if(r.method()==='POST'&&/\/api\/session\/(?:prompt|send|submit)|\/naumi\/bot-tasks$/.test(u.pathname))writes++;});
await page.addInitScript(()=>localStorage.setItem('naumi.navigationMode.v1','bot'));
const check=(name,value)=>{assert(value,name);checks.push(name);};
const logs=['server.out.log','server.err.log'].map(n=>fs.readFileSync(path.join(root,'logs',n),'utf8')).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
try{
  await page.goto(launch,{waitUntil:'domcontentloaded'});
  const row=page.locator('[data-bot-id="'+source.id+'"]');await row.locator('.naumi-bot-open').click();
  const dock=page.locator('.naumi-task-dock');await dock.waitFor();
  check('actual_runtime_assets_without_routes', ['bot-task-ui.js','bot-task-model.js','bot-task.css'].every(n=>assets.has(n)));
  check('actual_task_cards',await dock.locator('[data-task-id]').count()>0);
  check('actual_reception_session',await page.locator('[data-naumi-context-session="'+source.homeSessionId+'"]').count()===1);
  const model=page.locator('[data-slot="conversation.input.model"] button');check('one_native_model_selector',await model.count()===1);const before=await model.getAttribute('aria-label');
  await dock.getByRole('button',{name:'详情',exact:true}).first().click();await dock.locator('.nbt-detail pre').first().waitFor();check('actual_detail_loaded',await dock.locator('.nbt-detail pre').first().isVisible());
  check('task_css_loaded',await dock.evaluate(el=>getComputedStyle(el).maxHeight==='270px'));
  await row.getByRole('button',{name:source.name+'的设置',exact:true}).click();await page.locator('.nx-bot-menu').waitFor();check('original_employee_menu',await page.locator('.nx-bot-menu button').count()>0);await page.keyboard.press('Escape');
  check('model_unchanged',before===await model.getAttribute('aria-label'));check('shared_sse',feeds===1);check('no_business_writes',writes===0);check('zero_page_errors',errors.length===0);
  fs.writeFileSync(path.join(e,'LOADED_UI_VERIFICATION.json'),JSON.stringify({tier:'actual loaded runtime, real owner HTTP and UI; no mocks, no source routes, no model/business writes',checks,errors,eventFeedConnections:feeds,finishedAt:new Date().toISOString()},null,2)+'\n');
  console.log('LOADED_UI checks='+checks.length+' errors='+errors.length+' mocks=0 model_writes='+writes+' contexts_closed=1');
}finally{await context.close();await browser.close();}
