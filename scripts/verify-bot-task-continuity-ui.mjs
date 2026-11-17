import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {botLiveApi} from './bot-live-api.mjs';
const runtime='E:/Workspace/naumi-desktop',e=path.resolve('evidence/bot-task-continuity'),root=path.resolve('plugins/naumi-enterprise/assets');
const bots=JSON.parse(fs.readFileSync(runtime+'/.dsh/naumi/bots.json','utf8')).bots,source=bots.find(b=>b.name.includes('主管'))??bots[0],target=bots.find(b=>b.id!==source.id&&b.name.includes('运营'))??bots.find(b=>b.id!==source.id);
const api=await botLiveApi(runtime),sessions=await api.rpc('session/list',{_request:{}});
const job=[...target.sessionIds].reverse().find(id=>id!==target.homeSessionId&&sessions.items.some(s=>s.sessionId===id&&!s.blank));assert(job,'A real nonblank task Session is required');
const stamp=new Date(Date.now()-60000).toISOString(),task={id:'continuity-ui-task',sourceBotId:source.id,sourceSessionId:source.homeSessionId,targetBotId:target.id,targetSessionId:job,status:'running',attempt:1,revision:1,subject:'为新品推广修改原稿',updatedAt:stamp,createdAt:stamp};
let posts=[],modelWrites=0,creations=0,creationBaseline=0;
const browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:980},colorScheme:'light'}),page=await context.newPage(),checks=[],errors=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='POST'&&p==='/api/session/prompt')modelWrites++;if(r.method()==='POST'&&p==='/api/session/create')creations++;});
const check=(name,value)=>{assert(value,name);checks.push(name);console.log('UI_PASS '+name);};
await page.route('**/naumi/assets/**',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);if(!['bot-task-model.js','bot-task-ui.js','bot-task.css','bot-sidebar.js','bot-sidebar.css','team-panel.js','team-panel.css'].includes(name))return route.continue();await route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':'text/javascript',body:fs.readFileSync(path.join(root,name))});});
await page.route('**/naumi/bot-tasks*',async route=>{
  const req=route.request();if(req.method()==='POST'){
    const body=req.postDataJSON();posts.push(body);assert.equal(body.action,'continue');assert.equal(body.taskId,task.id);assert.equal(body.sourceSessionId,source.homeSessionId);
    if(posts.length===1){task.revision++;return route.fulfill({status:409,contentType:'application/json',body:'{"error":"BOT_TASK_CONFLICT"}'});}
    if(task.status==='completed')task.attempt++;task.status='running';task.revision++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(task)});
  }
  const detail=new URL(req.url()).searchParams.has('taskId');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(detail?{...task,result:'原稿与原任务会话保持关联',delivery:{files:[]}}:{version:1,revision:task.revision,tasks:[task]})});
});
await page.addInitScript(()=>{localStorage.setItem('naumi.navigationMode.v1','bot');const Native=window.EventSource;window.__taskFeeds=[];window.EventSource=class{constructor(url,opts){if(!String(url).includes('/naumi/bot-tasks/events'))return new Native(url,opts);window.__taskFeeds.push(this);}close(){this.closed=true;}};window.__refreshTaskCards=()=>window.__taskFeeds.filter(s=>!s.closed).forEach(s=>s.onmessage?.({data:'changed'}));});
const logs=['server.out.log','server.err.log'].map(n=>fs.readFileSync(runtime+'/logs/'+n,'utf8')).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
try{
  await page.goto(launch,{waitUntil:'domcontentloaded'});const row=page.locator('[data-bot-id="'+target.id+'"]');await row.locator('.naumi-bot-open').click();
  await page.locator('.naumi-context-toggle').waitFor();const opener=page.getByRole('button',{name:'打开智能体团队',exact:true});if(await opener.count())await opener.click();
  let panel=page.locator('[data-naumi-context-session="'+target.homeSessionId+'"]');await panel.waitFor();const card=()=>panel.locator('[data-task-id="'+task.id+'"]');await card().waitFor();creationBaseline=creations;
  check('employee_home_and_active_job_visible_together',await card().isVisible()&&await panel.locator('.naumi-team-tasks .naumi-count').innerText()==='1');
  check('no_false_empty_task_state',!await panel.getByText('暂无进行中的任务',{exact:true}).count());
  check('one_shared_subscription_in_sidebar_panel_and_dock',await page.evaluate(()=>window.__taskFeeds.filter(s=>!s.closed).length)===1);
  const composer=page.locator('[contenteditable="true"]').first(),model=page.locator('[data-slot="conversation.input.model"] button');await composer.fill('日常聊天草稿保持原样');const modelBefore=await model.getAttribute('aria-label');
  await card().getByRole('button',{name:'详情',exact:true}).click();await card().getByLabel('补充这项任务').fill('原稿压缩到 1500 字');await card().getByRole('button',{name:'补充要求',exact:true}).click();await card().getByRole('alert').waitFor();
  check('conflict_keeps_amendment_draft',await card().getByLabel('补充这项任务').inputValue()==='原稿压缩到 1500 字');await card().getByRole('button',{name:'补充要求',exact:true}).click();await card().getByRole('status').getByText('已受理',{exact:true}).waitFor();
  check('retry_reuses_idempotency_identity',posts.length===2&&posts[0].idempotencyKey===posts[1].idempotencyKey&&posts[1].expectedRevision>posts[0].expectedRevision);
  check('active_amendment_does_not_create_session',creations===creationBaseline&&task.attempt===1);
  check('main_chat_draft_and_model_untouched',await composer.innerText()==='日常聊天草稿保持原样'&&await model.getAttribute('aria-label')===modelBefore);
  await panel.locator('.naumi-team-tasks').screenshot({path:e+'/employee-current-task.png',animations:'disabled'});
  await composer.fill('');await row.getByRole('button',{name:'查看'+target.name+'的当前任务（1）',exact:true}).click();panel=page.locator('[data-naumi-context-session="'+job+'"]');await panel.waitFor();
  check('working_count_opens_execution_not_reception',await panel.isVisible());await panel.getByRole('button',{name:'与'+target.name+'聊天',exact:true}).click();panel=page.locator('[data-naumi-context-session="'+target.homeSessionId+'"]');await panel.waitFor();check('return_to_stable_employee_chat',await panel.isVisible());
  task.status='completed';task.revision++;await page.evaluate(()=>window.__refreshTaskCards());await panel.locator('.naumi-bot-task-history').waitFor();await panel.locator('.naumi-bot-task-history > summary').click();await card().getByRole('button',{name:'详情',exact:true}).click();await card().getByLabel('补充这项任务').fill('继续修改同一篇文章的标题');await card().getByRole('button',{name:'继续修改',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.naumi-team-tasks [data-task-id="continuity-ui-task"]')?.dataset.taskState==='running');
  check('completed_revision_returns_same_task_to_current_work',posts.length===3&&task.attempt===2&&creations===creationBaseline);
  for(const width of [1000,580,360]){await page.setViewportSize({width,height:950});const toggle=page.getByRole('button',{name:'打开智能体团队',exact:true});if(await toggle.count())await toggle.click();check('panel_fit_'+width,await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2&&el.getBoundingClientRect().right<=innerWidth+2));}
  await page.setViewportSize({width:1440,height:980});await row.waitFor();check('employee_menu_retained',await row.getByRole('button',{name:target.name+'的设置',exact:true}).count()===1);check('zero_model_calls',modelWrites===0);check('zero_page_errors',errors.length===0);
  fs.writeFileSync(e+'/UI_VERIFICATION.json',JSON.stringify({tier:'actual shell with seven candidate assets and controlled read-only catalog/continuation HTTP; no actual task/model writes',checks,errors,simulatedContinuationPosts:posts.length,sessionCreationRequestsDuringActions:creations-creationBaseline,bootstrapSessionRequests:creationBaseline},null,2)+'\n');console.log('CONTINUITY_UI checks='+checks.length+' errors='+errors.length+' simulated_continues='+posts.length+' model_calls='+modelWrites+' contexts_closed=1');
}catch(error){console.log('UI_DEBUG '+JSON.stringify({errors,panels:await page.locator('[data-naumi-context-session]').evaluateAll(nodes=>nodes.map(n=>({session:n.dataset.naumiContextSession,hidden:n.hidden,width:n.getBoundingClientRect().width}))),posts:posts.length,creations}));await page.screenshot({path:e+'/ui-failure.png'}).catch(()=>{});throw error;}finally{await context.close();await browser.close();}
