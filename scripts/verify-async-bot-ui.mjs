import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';

const runtime='E:/Workspace/naumi-desktop',root=path.resolve('plugins/naumi-enterprise'),e=path.resolve(process.env.NAUMI_ASYNC_UI_EVIDENCE??'evidence/async-bot');
const directory=JSON.parse(fs.readFileSync(runtime+'/.dsh/naumi/bots.json','utf8')),source=directory.bots.find(b=>b.name.includes('主管'))??directory.bots[0],target=directory.bots.find(b=>b.id!==source.id);
const task={id:'async-ui-fixture',sourceBotId:source.id,sourceSessionId:source.homeSessionId,targetBotId:target.id,targetSessionId:target.sessionIds.at(-1),status:'running',revision:1,attempt:1,replyMode:'background',subject:'整理本周活动文案',createdAt:'2026-11-17T04:00:00Z',updatedAt:'2026-11-17T04:00:00Z'};
let tasks=[task],feeds=new Set(),feedCount=0,posts=0;
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});feeds.add(res);feedCount++;res.write('data: changed\n\n');req.on('close',()=>feeds.delete(res));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const eventUrl='http://127.0.0.1:'+server.address().port+'/events';
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:980},colorScheme:'light'}),page=await context.newPage(),checks=[],errors=[];
page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
const check=(name,value)=>{assert(value,name);checks.push(name);console.log('UI_PASS '+name);};
const baseline=fs.readFileSync(runtime+'/.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/client.js','utf8').replaceAll('\r\n','\n'),candidate=fs.readFileSync(root+'/client.js','utf8').replaceAll('\r\n','\n');
if(!process.env.NAUMI_ASYNC_UI_LIVE_ASSETS)await page.route('**/plugins/**',async route=>{if(!decodeURIComponent(route.request().url()).includes('@naumi/dsh-enterprise/client.js'))return route.continue();const r=await route.fetch(),body=(await r.text()).replaceAll('\r\n','\n');assert(body.includes(baseline),'CANDIDATE_BASELINE_MISMATCH');await route.fulfill({response:r,body:body.replace(baseline,candidate)});});
if(!process.env.NAUMI_ASYNC_UI_LIVE_ASSETS)await page.route('**/naumi/assets/**',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1),p=root+'/assets/'+name;if(!fs.existsSync(p))return route.continue();await route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/javascript',body:fs.readFileSync(p)});});
await page.route('**/naumi/bot-tasks*',async route=>{if(route.request().method()!=='GET'){posts++;return route.fulfill({status:409,contentType:'application/json',body:'{"error":"FIXTURE_READ_ONLY"}'});}const url=new URL(route.request().url());await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(url.searchParams.has('taskId')?{...task,result:'已完成的后台成果',delivery:{files:[]}}:{version:1,revision:task.revision,tasks})});});
await page.addInitScript(({eventUrl})=>{localStorage.setItem('naumi.navigationMode.v1','bot');const Native=window.EventSource;window.EventSource=class extends Native{constructor(url,options){super(String(url).includes('/naumi/bot-tasks/events')?eventUrl:url,options);}};},{eventUrl});
const logs=['server.out.log','server.err.log'].map(n=>fs.readFileSync(runtime+'/logs/'+n,'utf8')).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
try{
  await page.goto(launch,{waitUntil:'domcontentloaded'});if(!process.env.NAUMI_ASYNC_UI_LIVE_ASSETS)await page.addStyleTag({content:fs.readFileSync(root+'/assets/bot-task.css','utf8')});
  const row=page.locator('.naumi-bot-entry[data-bot-id="'+source.id+'"]');await row.locator('.naumi-bot-open').click();
  const card=page.locator('.naumi-task-dock').locator('[data-task-id="'+task.id+'"]');await card.waitFor();
  check('background_task_visible_without_waiting',await card.getAttribute('data-task-state')==='running');
  check('source_reception_session_preserved',await page.locator('[data-naumi-context-session="'+source.homeSessionId+'"]').count()>0);
  const employee=page.locator('.naumi-bot-entry[data-bot-id="'+target.id+'"]');await page.waitForFunction(id=>document.querySelector('[data-bot-id="'+id+'"]')?.dataset.botState==='running',target.id);
  check('worker_avatar_running',await employee.getAttribute('data-bot-state')==='running');
  await employee.locator('.naumi-character svg[data-emotion="32"]').waitFor();check('avatar_motion_tracks_real_work_state',await employee.locator('.naumi-character svg').getAttribute('data-emotion')==='32');check('legacy_working_frame_removed',await employee.locator('.naumi-bot-avatar').evaluate(el=>getComputedStyle(el,'::after').content==='none'&&getComputedStyle(el,'::after').animationName==='none'));
  const motionBefore=await employee.locator('.naumi-character svg').evaluate(svg=>svg.outerHTML);await page.waitForTimeout(180);check('new_svg_motion_actually_advances',await employee.locator('.naumi-character svg').evaluate(svg=>svg.outerHTML)!==motionBefore);await employee.locator('.naumi-bot-row').screenshot({path:e+'/working-bot-new-motion.png'});
  const model=page.locator('[data-slot="conversation.input.model"] button');check('model_selector_original_position',await model.count()===1);const modelName=await model.getAttribute('aria-label');
  const composer=page.locator('[contenteditable="true"]').first();await composer.fill('另一个话题，保留草稿');
  await card.getByRole('button',{name:'详情',exact:true}).click();await card.getByText('已完成的后台成果',{exact:true}).waitFor();check('task_details_operable',await card.getByText('已完成的后台成果',{exact:true}).isVisible());
  task.status='completed';task.revision++;task.updatedAt='2026-11-17T04:01:00Z';for(const res of feeds)res.write('data: changed\n\n');
  await page.waitForFunction(id=>document.querySelector('[data-task-id="'+id+'"]')?.dataset.taskState==='completed',task.id);
  check('completion_updates_original_task_card',await card.getAttribute('data-task-state')==='completed');check('new_topic_draft_not_replaced',await composer.innerText()==='另一个话题，保留草稿');check('model_choice_unchanged',await model.getAttribute('aria-label')===modelName);
  await page.waitForFunction(id=>document.querySelector('[data-bot-id="'+id+'"]')?.dataset.botState!=='running',target.id);check('avatar_returns_to_idle',await employee.getAttribute('data-bot-state')!=='running');
  check('one_event_feed_for_sidebar_and_cards',feedCount===1);check('employee_menu_retained',await row.getByRole('button',{name:source.name+'的设置',exact:true}).count()===1);
  await page.emulateMedia({reducedMotion:'reduce'});task.status='running';task.revision++;for(const res of feeds)res.write('data: changed\n\n');await page.waitForFunction(id=>document.querySelector('[data-bot-id="'+id+'"]')?.dataset.botState==='running',target.id);await page.waitForTimeout(100);const frozen=await employee.locator('.naumi-character svg').evaluate(svg=>svg.outerHTML);await page.waitForTimeout(180);check('reduced_motion_supported',await employee.locator('.naumi-character svg').evaluate(svg=>svg.outerHTML)===frozen);
  for(const width of [1000,580,360]){await page.setViewportSize({width,height:950});await card.waitFor();check('task_layout_'+width,await card.evaluate(el=>el.scrollWidth<=el.clientWidth+2&&el.getBoundingClientRect().right<=innerWidth+2));}
  await page.locator('.naumi-task-dock').screenshot({path:e+'/async-task-narrow.png',animations:'disabled'});await page.setViewportSize({width:1440,height:980});await page.locator('.naumi-task-dock').screenshot({path:e+'/async-task-desktop.png',animations:'disabled'});
  await composer.fill('');check('no_business_or_model_posts',posts===0);check('no_page_errors',errors.length===0);
  fs.writeFileSync(e+'/UI_VERIFICATION.json',JSON.stringify({status:'PASS',tier:'real Harness shell with candidate frontend, controlled read-only task catalog and real local SSE; no model or business writes',checks,errors,eventFeedConnections:feedCount},null,2)+'\n');
  console.log('UI_COMPLETE checks='+checks.length+' errors='+errors.length);
}catch(error){await page.screenshot({path:e+'/ui-failure.png',animations:'disabled'}).catch(()=>{});fs.writeFileSync(e+'/UI_FAILURE.json',JSON.stringify({error:error.message,checks,errors,body:(await page.locator('body').innerText()).slice(-4500)},null,2));throw error;}
finally{await context.close();await browser.close();for(const res of feeds)res.end();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
