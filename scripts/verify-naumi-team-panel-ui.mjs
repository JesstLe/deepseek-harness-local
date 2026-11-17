import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const root=path.resolve(import.meta.dirname,'..'),runtime=process.env.NAUMI_RUNTIME_ROOT??'E:/Workspace/deepseek-harness-local';process.chdir(root);
const dir=path.join(root,'evidence/naumi-team-panel');
const {chromium}=await import(pathToFileURL(process.env.NAUMI_PLAYWRIGHT_MODULE??'E:/Workspace/naumi/node_modules/playwright/index.mjs').href);
const logs=['logs/server.out.log','logs/server.err.log'].map(p=>fs.readFileSync(path.join(runtime,p),'utf8')).join('\n');
const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch,'Authenticated launch URL required');
const leadId='session-8378e175-ffcc-4edd-a380-c2ec9129c4e0';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:960},colorScheme:'light'});
const page=await context.newPage();page.setDefaultTimeout(12000);
const result={environment:'isolated local Chromium regression, no enterprise cookie or generation requests',live:{},fixture:{},errors:[]},requests=[];
page.on('console',message=>{if(message.type()==='error'&&/Naumi navigation|Naumi team panel|slot .*already declared/.test(message.text()))result.errors.push(message.text().split('\n')[0]);});page.on('pageerror',e=>result.errors.push(e.message));page.on('request',r=>{const u=new URL(r.url());if(u.origin==='http://127.0.0.1:3080')requests.push({method:r.method(),path:u.pathname});});
page.on('websocket',socket=>socket.on('framesent',frame=>{try{const value=JSON.parse(String(frame.payload));if(value.method)requests.push({method:'WS',path:'/api/'+value.method});}catch{}}));
page.on('console',message=>{if(message.text().startsWith('BOT_TEST_DIAGNOSTIC '))console.log(message.text());});
let tier='live';const check=(name,value)=>{result[tier][name]=!!value;assert(value,name);console.log(tier.toUpperCase()+'_PASS '+name);};
const selectParent=async()=>{
  const workspace=page.locator('[data-slot="sidebar.workspaces"] [role="treeitem"]').filter({hasText:'默认工作区'}).first();await workspace.waitFor();if(await workspace.getAttribute('aria-expanded')==='false')await workspace.click();
  await page.locator('[data-slot="sidebar.workspaces"] [role="treeitem"]').filter({hasText:'你好，介绍你的能力'}).first().click();
  await page.locator('[data-naumi-context-session="'+leadId+'"]').waitFor();
};
const closeDialog=()=>page.keyboard.press('Escape');
const ensureTeam=async()=>{
  // Native rightbar panes remain mounted while closed. Wait for geometry, not DOM removal.
  await page.waitForFunction(()=>{const r=document.querySelector('[data-naumi-context-root]')?.getBoundingClientRect();return r&&r.width>=780&&r.right>=innerWidth-1;});
  const toggle=page.locator('.naumi-context-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.locator('.naumi-context-panel').waitFor({state:'visible'});
};
try{
  await page.goto(launch,{waitUntil:'domcontentloaded'});await selectParent();
  const panel=page.locator('.naumi-context-panel'),model=page.locator('[data-slot="conversation.input.model"] button');
  const originalModel=await model.getAttribute('aria-label'),draft=await page.locator('[contenteditable="true"]').innerText();
  const modeGroup=page.getByRole('group',{name:'导航模式'});await modeGroup.waitFor();
  check('thread_mode_default',await page.locator('.naumi-navigation').getAttribute('data-navigation-mode')==='threads');
  const originalThreadRoot=await page.locator('[data-naumi-thread-content]').elementHandle();
  await modeGroup.getByRole('button',{name:'Bot',exact:true}).click();await page.getByText('暂无 Bot',{exact:true}).waitFor();
  check('bot_mode_is_not_a_thread_alias',await page.locator('.naumi-bot-entry').count()===0);
  check('mode_switch_keeps_thread_tree_mounted',await originalThreadRoot.evaluate(e=>e.isConnected&&e===document.querySelector('[data-naumi-thread-content]')&&getComputedStyle(e).display==='none'));
  check('mode_switch_keeps_current_conversation',await panel.getAttribute('data-naumi-context-session')===leadId);
  await page.screenshot({path:path.join(dir,'live-bot-empty.png'),animations:'disabled'});
  await page.reload({waitUntil:'domcontentloaded'});await modeGroup.waitFor();check('mode_preference_survives_reload',await page.locator('.naumi-navigation').getAttribute('data-navigation-mode')==='bot');
  await modeGroup.getByRole('button',{name:'线程',exact:true}).click();await selectParent();check('original_threads_return',await page.locator('[data-naumi-thread-content]').isVisible());
  check('new_panel_visible',await panel.isVisible());check('agent_name_not_invented',await page.locator('[data-team-name]').innerText()==='智能体团队');
  check('roster_collapsed',!(await page.locator('.naumi-team-roster').getAttribute('open'))&&!(await page.locator('.naumi-member').first().isVisible()));
  check('dynamic_roster_count',await page.locator('.naumi-member').count()===5);check('run_details_collapsed',!(await page.locator('.naumi-metrics').isVisible()));
  check('trajectory_hidden',await page.locator('[role=tab]').filter({hasText:'轨迹'}).isHidden());
  await page.locator('.naumi-environment-status').filter({hasText:'工具就绪'}).waitFor();
  check('desktop_true_readiness',true);check('browser_reports_installed_or_native_mode',await page.locator('.naumi-environment-status').filter({hasText:/^(已安装|原生模式)$/}).count()===1);
  await page.locator('.naumi-schedule-empty').waitFor();check('real_empty_schedules',true);
  await page.screenshot({path:path.join(dir,'live-activity.png'),animations:'disabled'});
  await page.locator('.naumi-team-roster>summary').click();check('dynamic_member_names',(await page.locator('.naumi-member-name').allTextContents()).some(x=>x==='impl-dev'));
  await page.locator('.naumi-team-native button').click();await page.locator('[data-team-panel]').waitFor();check('original_team_details',await page.locator('[data-team-panel]').innerText().then(x=>x.includes('共享任务')));await closeDialog();
  await page.locator('.naumi-completed-tasks>summary').click();check('four_real_completed_tasks',await page.locator('.naumi-team-task').count()===4);
  const task=page.locator('.naumi-team-task').first();await task.locator('summary').click();check('task_has_authoritative_description',await task.locator('.naumi-task-body').innerText().then(x=>x.includes('SPEC.md')));
  await task.getByRole('button',{name:'打开成员会话'}).click();await page.waitForFunction(id=>document.querySelector('.naumi-context-panel')?.dataset.naumiContextSession!==id,leadId);
  check('original_member_navigation',true);await selectParent();
  await page.getByRole('tab',{name:'资料',exact:true}).click();check('native_deliverables',await page.locator('.naumi-context-files button').count()===2);
  await page.screenshot({path:path.join(dir,'live-library.png'),animations:'disabled'});
  await page.locator('.naumi-context-files button').filter({hasText:'README.md'}).click();await page.locator('[data-slot="rightbar"]').getByText('dupefind',{exact:true}).first().waitFor();check('original_file_preview',true);
  await page.locator('[data-slot="rightbar"] button[aria-label="收起右侧边栏"]').click();
  await ensureTeam();
  await page.getByRole('tab',{name:'资料',exact:true}).click();await page.locator('.naumi-resource-row').filter({hasText:'工作区文件'}).click();await page.locator('[data-slot="rightbar"]').getByText('team-demo',{exact:true}).first().waitFor();check('original_workspace_files',true);
  await page.locator('[data-slot="rightbar"] button[aria-label="全屏"]').click();check('file_fullscreen_not_covered',await page.evaluate(()=>!document.elementFromPoint(innerWidth-80,160)?.closest('.naumi-context-panel')));
  await page.locator('[data-slot="rightbar"] button[aria-label="退出全屏"]').click();await page.locator('[data-slot="rightbar"] button[aria-label="收起右侧边栏"]').click();
  await ensureTeam();
  await page.locator('.naumi-run-details>summary').click();await page.locator('.naumi-advanced summary').click();check('original_preset_preserved',await page.locator('.naumi-preset-native').innerText().then(x=>x.includes('标准模式')));await page.locator('.naumi-advanced summary').click();
  await page.locator('.naumi-native-stat-details>summary').click();
  if(await page.locator('.naumi-native-stat-details button').count()){
    await page.locator('.naumi-native-stat-details button').first().click();await page.locator('[data-session-stats-details]').waitFor();check('original_usage_detail',true);await closeDialog();
  }else{
    // Native compact preference intentionally renders PlainPill, not a clickable DialogPill.
    check('original_compact_usage_preserved',await page.locator('.naumi-native-stat-details').innerText().then(x=>x.includes('tok/s')&&x.includes('缓存命中')));
  }
  await page.locator('.naumi-native-stat-details>summary').click();
  await page.locator('.naumi-context-capacity button').click();check('original_context_detail',await page.getByRole('dialog').innerText().then(x=>x.includes('系统提示词')));await closeDialog();await page.locator('.naumi-run-details>summary').click();
  check('one_model_selector',await model.count()===1);await model.click();await page.locator('[role="menu"]').waitFor();await page.locator('[role="menu"] [role="menuitem"], [role="menu"] button').first().click();await page.locator('input[placeholder="搜索模型…"]').waitFor();
  const catalog=await page.locator('[role="menu"]').innerText();check('nine_model_groups_preserved',(catalog.match(/^CC · /gm)??[]).length+(catalog.includes('DeepSeek 账号')?1:0)===9);await closeDialog();
  await page.locator('[data-slot="conversation.input.permission"] button').click();check('original_permission_menu',await page.getByText('工作区内修改',{exact:true}).last().isVisible());await closeDialog();
  check('model_inside_composer',await model.evaluate(e=>{const r=e.getBoundingClientRect(),c=document.querySelector('[data-composer-seat]').getBoundingClientRect();return r.left>=c.left&&r.right<=c.right;}));
  await page.getByRole('tab',{name:'动态',exact:true}).click();await page.getByRole('tab',{name:'动态',exact:true}).press('ArrowRight');check('keyboard_tabs',await page.getByRole('tab',{name:'资料',exact:true}).getAttribute('aria-selected')==='true');
  await page.locator('.naumi-context-head button').click();check('collapse_restores_center',await panel.isHidden()&&await model.isVisible());await page.locator('.naumi-context-toggle').click();
  await page.setViewportSize({width:390,height:844});
  // The original frame auto-collapses the left sidebar at this breakpoint; do not race its toggle.
  await page.waitForFunction(()=>{const r=document.querySelector('.naumi-context-panel')?.getBoundingClientRect();return r?.width>0&&r.left>=0&&r.right<=innerWidth+1;});
  check('mobile_panel_fits',await panel.evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:path.join(dir,'live-mobile.png'),animations:'disabled'});
  await page.locator('.naumi-context-head button').click();check('mobile_model_reachable',await model.isVisible());
  await page.setViewportSize({width:1440,height:960});check('model_selection_unchanged',await model.getAttribute('aria-label')===originalModel);check('draft_unchanged',await page.locator('[contenteditable="true"]').innerText()===draft);
  // HTTP response fixtures run in this isolated test page; no real schedule/profile writes are sent.
  const realRoots=await page.evaluate(async()=>{const method='session/list',response=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args:{_request:{}}}})});return (await response.json()).result.value.items.filter(s=>s.origin!=='subagent').map(s=>({sessionId:s.sessionId,cwd:s.cwd}));});
  const rootInfo=realRoots.find(s=>s.sessionId===leadId),otherRoot=realRoots.find(s=>s.sessionId!==leadId&&s.cwd===rootInfo.cwd)??realRoots.find(s=>s.sessionId!==leadId);assert(otherRoot,'Another real root is needed for read-only navigation fixture');
  tier='fixture';let row={id:'naumi-ui-fixture',kind:'daily',title:'Agent 生成的资料整理',prompt:'fixture only',status:'active',scheduledAt:'2026-12-17T09:00:00Z',time:'09:00:00.000',timeZone:'Asia/Shanghai',updatedAt:'2026-11-16T08:00:00.000Z',target:{kind:'session',sessionId:leadId},involvedSessionIds:[leadId]},name='资料整理与复核小组',conflict=false,edits=[],createdRequests=[],bindAttempts=[],botConflict=true;
  let bots=[{id:'bot-fixture-team',kind:'team',name:'研究与交付团队',purpose:'fixture',status:'active',revision:1,cwd:rootInfo.cwd,agentPreset:'standard',homeSessionId:leadId,sessionIds:[leadId],createdAt:row.updatedAt,updatedAt:row.updatedAt},{id:'bot-fixture-agent',kind:'agent',name:'资料复核助理',purpose:'fixture',status:'active',revision:1,cwd:rootInfo.cwd,homeSessionId:'fixture-unavailable-history',sessionIds:['fixture-unavailable-history'],createdAt:row.updatedAt,updatedAt:row.updatedAt}];
  await page.route('**/naumi/assets/bot-sidebar.js',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace("}catch(error){if(alive.current)setError", "}catch(error){console.log('BOT_TEST_DIAGNOSTIC '+error.message);if(alive.current)setError")});});
  await page.route('**/naumi/bots',async route=>{
    if(route.request().method()==='GET'){await route.fulfill({json:{version:1,revision:bots[0].revision,bots}});return;}
    const input=route.request().postDataJSON();bindAttempts.push(input);
    if(botConflict){bots[0]={...bots[0],revision:2};await route.fulfill({status:409,json:{error:'BOT_CONFLICT'}});return;}
    bots[0]={...bots[0],revision:bots[0].revision+1,sessionIds:[...new Set([...bots[0].sessionIds,input.sessionId])]};await route.fulfill({json:bots[0]});
  });
  await page.route('**/api/session/list',async route=>{const response=await route.fetch();const data=await response.json();const target=data.result.value.items.find(x=>x.sessionId===leadId);target.projections.values.naumiTeamProfile={teamId:leadId,revision:1,name,updatedAt:row.updatedAt};await route.fulfill({response,json:data});});
  await page.route('**/api/schedule/catalog',async route=>{const data=route.request().postDataJSON();await route.fulfill({json:{type:'server-response',rpcId:data.rpcId,result:{ok:true,value:[row,{...row,id:'foreign-task',title:'别的团队',involvedSessionIds:['foreign'],target:{kind:'session',sessionId:'foreign'}}]}}});});
  await page.route('**/api/schedule/edit',async route=>{const data=route.request().postDataJSON(),request=data.payload.args.request??data.payload.args;edits.push(request);if(!conflict)row={...row,status:request.patch.active?'active':'paused',updatedAt:'2026-11-16T08:01:00.000Z'};await route.fulfill({json:{type:'server-response',rpcId:data.rpcId,result:{ok:true,value:conflict?{id:row.id,code:'schedule_conflict'}:row}}});});
  // The web client normally uses Typert WebSocket RPC. Intercept its wire in the test context too.
  await page.routeWebSocket('ws://127.0.0.1:3080/**',socket=>{
    const server=socket.connectToServer(),methods=new Map();
    socket.onMessage(message=>{
      let data;try{data=JSON.parse(String(message));}catch{server.send(message);return;}
      if(data.rpcId&&data.method)methods.set(data.rpcId,data.method);
      if(data.method==='session/create'){
        createdRequests.push(data.payload.args.request??data.payload.args);socket.send(JSON.stringify({type:'server-response',rpcId:data.rpcId,result:{ok:true,value:{sessionId:otherRoot.sessionId,agentPreset:'standard'}}}));return;
      }
      if(data.method==='schedule/edit'){
        const request=data.payload.args.request??data.payload.args;edits.push(request);
        if(!conflict)row={...row,status:request.patch.active?'active':'paused',updatedAt:'2026-11-16T08:01:00.000Z'};
        socket.send(JSON.stringify({type:'server-response',rpcId:data.rpcId,result:{ok:true,value:conflict?{id:row.id,code:'schedule_conflict'}:row}}));return;
      }
      server.send(message);
    });
    server.onMessage(message=>{
      let data;try{data=JSON.parse(String(message));}catch{socket.send(message);return;}
      const inject=value=>{if(!value||typeof value!=='object')return;for(const key of Object.keys(value)){if(key==='naumiTeamProfile'&&value[key]?.teamId===leadId)value[key]={...value[key],name,revision:1};else inject(value[key]);}};
      inject(data);
      if(methods.get(data.rpcId)==='schedule/catalog'&&data.result?.ok)data.result.value=[row,{...row,id:'foreign-task',title:'别的团队',involvedSessionIds:['foreign'],target:{kind:'session',sessionId:'foreign'}}];
      socket.send(JSON.stringify(data));
    });
  });
  await page.reload({waitUntil:'domcontentloaded'});await selectParent();await page.locator('[data-team-name]').filter({hasText:bots[0].name}).waitFor();check('persistent_bot_name_displayed',true);
  await modeGroup.getByRole('button',{name:'Bot',exact:true}).click();await page.locator('.naumi-bot-entry').first().waitFor();check('two_distinct_bot_identities',await page.locator('.naumi-bot-entry').count()===2);
  const botEntry=page.locator('[data-bot-id="bot-fixture-team"]');check('current_bot_selected',await botEntry.getAttribute('data-selected')==='true');
  await page.screenshot({path:path.join(dir,'bot-mode-fixture.png'),animations:'disabled'});
  await botEntry.locator('.naumi-bot-history-toggle').click();await botEntry.getByRole('button',{name:'+ 新任务',exact:true}).click();await botEntry.getByRole('alert').waitFor();
  result.fixture.createRequests=createdRequests;result.fixture.bindAttempts=bindAttempts;
  check('new_task_uses_original_create_without_prompt',createdRequests.length===1&&!Object.hasOwn(createdRequests[0],'prompt')&&!Object.hasOwn(createdRequests[0],'model')&&createdRequests[0].agentPreset==='standard');
  check('binding_conflict_retains_created_session',bindAttempts.length===1&&bindAttempts[0].sessionId===otherRoot.sessionId);
  botConflict=false;await botEntry.getByRole('button',{name:'重试关联',exact:true}).first().click();await page.waitForFunction(id=>document.querySelector('.naumi-context-panel')?.dataset.naumiContextSession===id,otherRoot.sessionId);
  check('retry_does_not_create_another_session',createdRequests.length===1&&bindAttempts.length===2);check('one_bot_contains_two_tasks',await botEntry.locator('.naumi-bot-task-link').count()===2);
  await page.screenshot({path:path.join(dir,'bot-tasks-fixture.png'),animations:'disabled'});
  await modeGroup.getByRole('button',{name:'线程',exact:true}).click();await selectParent();check('switch_back_preserves_original_sessions',await page.locator('[data-naumi-thread-content]').isVisible());
  bots[0]={...bots[0],name:'Agent 自主更新后的 Bot 名称',revision:bots[0].revision+1};await page.reload({waitUntil:'domcontentloaded'});await selectParent();await page.locator('[data-team-name]').filter({hasText:bots[0].name}).waitFor();
  check('bot_rename_keeps_identity_and_task_bindings',bots[0].id==='bot-fixture-team'&&bots[0].sessionIds.length===2);
  await page.locator('[data-schedule-id="naumi-ui-fixture"]').waitFor();check('foreign_schedule_not_shown',await page.locator('[data-schedule-id="foreign-task"]').count()===0);
  await page.getByRole('switch').click();await page.waitForFunction(()=>document.querySelector('[role="switch"]')?.getAttribute('aria-checked')==='false');
  check('schedule_toggle_uses_cas',edits.length===1&&edits[0].expectedUpdatedAt==='2026-11-16T08:00:00.000Z'&&edits[0].patch.active===false&&Object.keys(edits[0].patch).length===1);
  conflict=true;await page.getByRole('switch').click();await page.getByText('任务已被更新，请重新操作',{exact:true}).waitFor();check('conflict_keeps_authoritative_pause',await page.getByRole('switch').getAttribute('aria-checked')==='false');
  // An unbound thread still displays its Agent-managed team profile rather than any Bot fixture name.
  bots=[];name='Agent 自主更新后的名字';row={...row,executionActive:true};await page.unroute('**/naumi/bots');await page.reload({waitUntil:'domcontentloaded'});await selectParent();await page.getByText(name,{exact:true}).waitFor();check('unbound_agent_name_not_hardcoded',true);check('running_schedule_locked',await page.getByRole('switch').isDisabled());
  check('no_frontend_errors',result.errors.length===0);
  check('no_generation_or_config_writes',!requests.some(r=>/\/api\/(?:session\/(?:prompt|send|submit)|credentials\/set|settings\/replace)(?:\/|$)/i.test(r.path)));
  result.fixture.scheduleWritesIntercepted=edits.length;result.completedAt=new Date().toISOString();
  result.fixture.botBindWritesIntercepted=bindAttempts.length;result.fixture.sessionCreateCallsIntercepted=createdRequests.length;
  console.log('UI_RESULT live='+Object.keys(result.live).length+' fixture='+Object.values(result.fixture).filter(x=>x===true).length+' errors='+result.errors.length+' real_schedule_writes=0');
}catch(error){result.error=String(error.message).replace(/token=[^\s"']+/g,'token=[redacted]');await page.screenshot({path:path.join(dir,'ui-failure.png')}).catch(()=>{});console.error(result.error);process.exitCode=1;}
finally{result.observedMethods=[...new Set(requests.map(r=>r.path))].filter(x=>x.startsWith('/api/')).sort();fs.writeFileSync(path.join(dir,'UI_CHECK.json'),JSON.stringify(result,null,2));await context.close();await browser.close();}
