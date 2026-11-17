import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {botGroupHttpFixture} from '../tests/helpers/bot-group-http.mjs';

// Accept an existing dependency directory. This fixture does not require a running backend.
const deps = resolve(process.argv[2] ?? 'desktop/node_modules');
const require = createRequire(join(deps,'../package.json'));
const {build} = require('esbuild');
const {chromium} = require('playwright');
const origin = 'http://localhost';
const plugin = resolve('plugins/naumi-enterprise');
const assets = new Set(['bot-groups.js','bot-task-model.js','bot-groups.css','style.css']);
const bootstrap = await build({bundle:true,write:false,define:{'process.env.NODE_ENV':'"production"'},nodePaths:[deps],stdin:{contents:`
  import React from 'react';
  import * as reactDom from 'react-dom';
  import {createRoot} from 'react-dom/client';
  const root = createRoot(document.getElementById('root'));
  const panels = new Map(), nav = new Map(), panelListeners = new Set();
  let activePanelId;
  const noop = () => {};
  const opened = window.fixtureOpened = {sessions:[],resources:[]};
  function selectPanel(id) {
    activePanelId = id;
    root.render(React.createElement(React.Fragment,null,
      React.createElement('nav',{'aria-label':'产品导航'},[...nav.values()].map(entry =>
        React.createElement('button',{key:entry.id,onClick:() => selectPanel(entry.id)},entry.label()))),panels.get(id)?.()));
    for (const listener of panelListeners) listener();
  }
  const ctx = {
    effect:noop,inject:noop,
    slots:{
      inject(_name,cb) { const effect = cb(); if (effect?.[Symbol.iterator]) for (const _ of effect) {} return noop; },
      register(slot,render) { if (slot.name === 'main') panels.set(slot.key,render); if (slot.name === 'sidebar.panellist') nav.set(slot.id,slot); return noop; },
    },
    layout:{selectPanel,panelInfo:{getSnapshot:() => ({activePanelId}),subscribe(listener) { panelListeners.add(listener); return () => panelListeners.delete(listener); }}},
    uiWorkspace:{openSession:id => opened.sessions.push(id)},
    get:name => name === 'sidebarRight' && {openResource:address => opened.resources.push(address)},
  };
  window.__NAUMI__ = {collaborationOrigin:location.origin,designOrigin:location.origin};
  window.__ModuleLoader__ = {load:({factory}) => factory(name => name === 'react' ? React : reactDom).apply(ctx)};
`,resolveDir:deps}});
const fixture = await botGroupHttpFixture();
let browser;

try {
  browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors = [];
  page.on('pageerror',error => errors.push(error.message));
  page.setDefaultTimeout(7000);
  await page.route(`${origin}/**`,async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/naumi/bot-groups') {
      const {status,headers,body} = await fixture.call(url.pathname+url.search,{
        method:request.method(),body:request.postData() ?? undefined,headers:request.headers(),
      });
      return route.fulfill({status,headers,body});
    }
    if (url.pathname === '/naumi/bots') return route.fulfill({json:{bots:fixture.bots}});
    if (url.pathname === '/bootstrap.js') return route.fulfill({contentType:'text/javascript',body:bootstrap.outputFiles[0].text});
    if (url.pathname === '/client.js') return route.fulfill({contentType:'text/javascript',body:await readFile(join(plugin,'client.js'),'utf8')});
    if (url.pathname.startsWith('/naumi/assets/')) {
      const name = url.pathname.split('/').at(-1);
      if (assets.has(name)) return route.fulfill({contentType:name.endsWith('.css')?'text/css':'text/javascript',body:await readFile(join(plugin,'assets',name),'utf8')});
    }
    if (url.pathname === '/') return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/naumi/assets/style.css"><link rel="stylesheet" href="/naumi/assets/bot-groups.css"><div id="root"></div><script src="/bootstrap.js"></script><script src="/client.js"></script>'});
    return route.fulfill({status:404});
  });
  await page.goto(origin);
  await page.getByRole('navigation',{name:'产品导航'}).getByRole('button',{name:'Bot 群聊',exact:true}).click();
  await page.getByRole('heading',{name:'Bot 群聊',exact:true}).waitFor();

  async function room(name, defaultBotId) {
    await page.getByRole('button',{name:'新建群聊',exact:true}).click();
    await page.getByLabel('群名',{exact:true}).fill(name);
    assert.equal(await page.getByRole('checkbox',{name:'归档助手'}).count(),0);
    await page.getByRole('checkbox',{name:'编辑',exact:true}).check();
    assert.equal(await page.getByRole('button',{name:'创建群聊',exact:true}).isEnabled(),false);
    await page.getByRole('checkbox',{name:'审稿',exact:true}).check();
    if (defaultBotId) await page.getByLabel('默认接话者',{exact:true}).selectOption(defaultBotId);
    await page.getByRole('button',{name:'创建群聊',exact:true}).click();
    await page.getByRole('heading',{name,exact:true}).waitFor();
  }

  const composer = page.getByRole('textbox',{name:'群消息',exact:true});
  const send = page.getByRole('button',{name:'发送',exact:true});
  await room('上新讨论');
  await composer.fill('请各自给出意见');
  await send.click();
  await page.getByRole('alert').getByText('请选择接话成员，或者在消息里 @ 一位成员。').waitFor();
  assert.equal(await composer.inputValue(),'请各自给出意见');
  await page.getByRole('button',{name:'@ 点名',exact:true}).click();
  await page.getByRole('button',{name:'@编辑',exact:true}).click();
  await page.getByRole('button',{name:'@审稿',exact:true}).click();
  await send.click();
  await page.getByText('请各自给出意见',{exact:true}).waitFor();
  await waitForReceipts(2);
  const [group] = (await fixture.call()).json.rooms;
  for (const [id,{input}] of fixture.receipts) fixture.finish(id,`${fixture.directory.forSession(input.sessionId).name}回复`);
  await page.getByText('编辑回复',{exact:true}).waitFor();
  await page.getByText('审稿回复',{exact:true}).waitFor();

  const issued = {id:'task-1',sourceSessionId:group.members[0].sessionId,targetBotId:'bot-1',targetSessionId:'child-session',
    status:'completed',attempt:1,task:'审核上新文案',result:'审核完成',updatedAt:new Date().toISOString(),
    delivery:{files:[{sessionId:'child-session',path:'审阅报告.md',seq:7,index:0}]}};
  fixture.tasks.push(issued);
  await page.getByText('群任务（1） · 0 进行中 · 1 已完成',{exact:true}).click();
  await page.getByRole('button',{name:'打开任务',exact:true}).click();
  await page.getByRole('button',{name:'审阅报告.md',exact:true}).click();
  const opened = await page.evaluate(() => window.fixtureOpened);
  assert.deepEqual(opened.sessions,['child-session']);
  assert.equal(decodeURIComponent(opened.resources[0]),'dsh-resource://file/session/child-session/审阅报告.md');

  await page.reload();
  await page.getByText('编辑回复',{exact:true}).waitFor();
  assert.equal(await page.getByText('请各自给出意见',{exact:true}).count(),1);
  for (const width of [1280,400]) {
    await page.setViewportSize({width,height:900});
    assert(await page.locator('.nbg-layout').evaluate(elem => elem.scrollWidth <= elem.clientWidth + 1),`group layout overflows at ${width}px`);
  }

  await room('销售会','bot-1');
  await composer.fill('请默认接话');
  await send.click();
  await page.getByText('请默认接话',{exact:true}).waitFor();
  await waitForReceipts(3);
  const last = [...fixture.receipts.values()].at(-1);
  assert.equal(fixture.directory.forSession(last.input.sessionId).id,'bot-1');
  assert.deepEqual(errors,[]);
  assert.deepEqual(fixture.warnings,[]);
  console.log('BOT_GROUPS_UI PASS desktop=1280 narrow=400 mentions=2 default=1 reload=1 task=1 resource=1 pageErrors=0');
} finally {
  await browser?.close();
  await fixture.close();
}

async function waitForReceipts(count) {
  for (let attempt=0; attempt<50 && fixture.receipts.size<count; attempt+=1) await delay(10);
  assert.equal(fixture.receipts.size,count);
}
