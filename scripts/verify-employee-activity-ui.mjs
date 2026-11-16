import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {employeeHost} from '../tests/helpers/employee-host.mjs';
import {EmployeeWorkStore} from '../plugins/naumi-enterprise/employee-work-store.js';

const e=path.resolve('evidence/proactive-runtime');await fs.mkdir(e,{recursive:true});
const {chromium}=await import(pathToFileURL('E:/Workspace/naumi/node_modules/playwright/index.mjs').href),f=await employeeHost();
let now=Date.parse('2031-01-06T10:00:00Z');f.store.clock=()=>new Date(now);
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1460,height:1080},colorScheme:'light'}),errors=[],checks=[];
page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
const check=(name,value)=>{assert(value,name);checks.push(name);console.log('UI_PASS '+name);};
try{
  await page.route('**/naumi/assets/employee-*',async route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);await route.fulfill({status:200,contentType:name.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile('plugins/naumi-enterprise/assets/'+name)});});
  await page.route('**/naumi/bots/events',()=>{});
  await page.route('**/naumi/bots',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(f.directory.list())}));
  for(const pattern of ['**/naumi/employees*','**/naumi/employee-work*','**/naumi/employee-activity*'])await page.route(pattern,async route=>{
    const request=route.request(),u=new URL(request.url()),r=await fetch(f.origin+u.pathname+u.search,{method:request.method(),headers:{cookie:'fixture-owner',origin:f.origin,'Content-Type':'application/json','x-naumi-employees':'1','x-naumi-employee-work':'1','x-naumi-employee-activity':'1'},...(request.method()==='POST'?{body:request.postData()}:{})});
    await route.fulfill({status:r.status,contentType:'application/json',body:await r.text()});
  });
  const logs=(await Promise.all(['server.out.log','server.err.log'].map(n=>fs.readFile('E:/Workspace/deepseek-harness-local/logs/'+n,'utf8')))).join('\n'),launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
  await page.goto(launch,{waitUntil:'domcontentloaded'});await page.getByText('员工中心',{exact:true}).first().click();await page.getByRole('tab',{name:'运行',exact:true}).click();
  const panel=page.locator('[data-employee-activity]');await panel.getByRole('heading',{name:'主动规则',exact:true}).waitFor();await panel.getByText('钉钉 CLI',{exact:true}).waitFor();
  check('capability_states_are_independent',await panel.getByText('未核验',{exact:true}).count()>0);
  await panel.getByRole('button',{name:'新增规则',exact:true}).click();const form=panel.locator('.emp-rule-form');
  await form.getByLabel('规则名称',{exact:true}).fill('每日资料核对');await form.getByLabel('间隔（秒）',{exact:true}).fill('60');await form.getByLabel('通知内容',{exact:true}).fill('核对已授权工作清单');await form.getByLabel('工作时区',{exact:true}).fill('UTC');await form.getByLabel('开始',{exact:true}).fill('00:00');await form.getByLabel('结束',{exact:true}).fill('23:59');await form.getByLabel('冷却（秒）',{exact:true}).fill('60');
  await form.getByRole('button',{name:'保存为停用规则',exact:true}).click();await panel.getByRole('heading',{name:'每日资料核对',exact:true}).waitFor();check('creation_does_not_auto_approve',!f.runtime.activityRuntime.activity.rules(f.sourceBot.id)[0].enabled);
  await panel.getByRole('button',{name:'确认启用',exact:true}).click();await panel.getByText('已启用',{exact:true}).waitFor();check('explicit_owner_approval',f.runtime.activityRuntime.activity.rules(f.sourceBot.id)[0].enabled);
  now+=60000;f.runtime.activityRuntime.tick();await panel.getByRole('button',{name:'刷新运行状态',exact:true}).click();await panel.getByText('核对已授权工作清单',{exact:true}).waitFor();
  check('timer_effect_is_persisted_with_receipt',f.runtime.activityRuntime.activity.runs(f.sourceBot.id).length===1);
  await panel.getByRole('button',{name:'标为已读',exact:true}).click();await panel.getByRole('button',{name:'标为已读',exact:true}).waitFor({state:'hidden'});check('notification_read_persists',!!f.runtime.activityRuntime.activity.notifications(f.sourceBot.id)[0].readAt);
  await panel.getByRole('button',{name:'编辑',exact:true}).click();await form.getByLabel('规则名称',{exact:true}).fill('已调整的核对规则');await form.getByRole('button',{name:'保存为停用规则',exact:true}).click();await panel.getByText('已停用',{exact:true}).waitFor();check('editing_revokes_approval',!f.runtime.activityRuntime.activity.rules(f.sourceBot.id)[0].enabled);
  f.sender.tools.get('employee_activity_report').execute({state:'waiting_dependency',note:'等待任务资料',operationId:'ui-wait'},{agent:f.sender});await panel.getByRole('button',{name:'刷新运行状态',exact:true}).click();await panel.getByText('等待依赖',{exact:true}).waitFor();check('waiting_state_is_not_stalled',!f.runtime.activityRuntime.observation.read(f.sourceBot.id).sessions[0].noProgress);
  await panel.getByRole('button',{name:'新增规则',exact:true}).click();await form.getByLabel('规则名称',{exact:true}).fill('周度待办');await form.getByLabel('间隔（秒）',{exact:true}).fill('60');await form.getByLabel('行动',{exact:true}).selectOption('queue_goal');await form.getByLabel('新目标名称',{exact:true}).fill('整理任务资料');await form.getByLabel('验收条件（每行一项）',{exact:true}).fill('完整清单\n来源可核验');await form.getByLabel('工作时区',{exact:true}).fill('UTC');await form.getByLabel('开始',{exact:true}).fill('00:00');await form.getByLabel('结束',{exact:true}).fill('23:59');await form.getByRole('button',{name:'保存为停用规则',exact:true}).click();await panel.getByRole('heading',{name:'周度待办',exact:true}).waitFor();const card=panel.locator('.emp-rule-list article').filter({has:page.getByRole('heading',{name:'周度待办',exact:true})});await card.getByRole('button',{name:'确认启用',exact:true}).click();await card.getByText('已启用',{exact:true}).waitFor();now+=60000;f.runtime.activityRuntime.tick();await panel.getByRole('button',{name:'刷新运行状态',exact:true}).click();await panel.getByText('已入队',{exact:true}).waitFor();
  check('queued_goal_is_planned_and_not_accepted',new EmployeeWorkStore(f.store).goals(f.sourceBot.id).some(g=>g.title==='整理任务资料'&&g.status==='planned'));check('no_agent_wakeup',f.creations.length===0);
  await page.screenshot({path:e+'/ACTIVITY_RULES.png',animations:'disabled'});await page.locator('.emp-main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:e+'/ACTIVITY_UI.png',animations:'disabled'});await page.setViewportSize({width:680,height:1000});await page.waitForFunction(()=>{const frame=document.querySelector('[data-sidebar-drawer]'),sidebar=frame?.querySelector('[class*=sidebarCol]');return frame?.hasAttribute('data-sidebar-collapsed')&&(!sidebar||sidebar.getBoundingClientRect().right<=1);});await page.locator('.emp-main').evaluate(el=>el.scrollTop=0);await page.screenshot({path:e+'/ACTIVITY_NARROW.png',animations:'disabled'});
  check('narrow_page_has_no_horizontal_overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));check('narrow_rules_remain_clickable',await panel.getByRole('button',{name:'新增规则',exact:true}).isVisible());check('no_page_errors',errors.length===0);
  await fs.writeFile(e+'/UI_VERIFICATION.json',JSON.stringify({status:'PASS',tier:'real Harness shell + candidate assets + real isolated Cordis/SQLite/HTTP, explicit test-clock advance',checks,pageErrors:errors,productionMutations:0},null,2));
  console.log(`UI activity_checks=${checks.length} page_errors=${errors.length} production_mutations=0`);
}catch(error){await fs.writeFile(e+'/UI_FAILURE.txt',JSON.stringify({errors,message:error.message,body:await page.locator('[data-employee-center]').innerText()},null,2));await page.screenshot({path:e+'/UI_FAILURE.png'});throw error;}
finally{await browser.close();await f.cleanup();}
