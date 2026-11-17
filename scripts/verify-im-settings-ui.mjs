import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {stringify} from 'yaml';
import {chromium} from '../desktop/node_modules/playwright/index.mjs';
import {BotDirectory} from '../plugins/naumi-enterprise/bots.js';

const root=process.cwd(),out=process.env.IM_EVIDENCE??'E:/tmp/naumi-im-gateway-20261117',temporary=path.join(out,'ui-fixture-'+randomUUID()),home=path.join(temporary,'home'),profile=path.join(home,'profiles/web');
fs.mkdirSync(path.join(profile,'node_modules/@naumi'),{recursive:true});
for(const[name,folder]of [['dsh-enterprise','naumi-enterprise'],['dsh-ui-layout','naumi-ui-layout'],['dsh-sidebar-browser','naumi-sidebar-browser']])fs.symlinkSync(path.join(root,'plugins',folder),path.join(profile,'node_modules/@naumi',name),'junction');
fs.symlinkSync(path.join(root,'node_modules/@deepseek-ai'),path.join(profile,'node_modules/@deepseek-ai'),'junction');
fs.writeFileSync(path.join(profile,'package.json'),JSON.stringify({name:'naumi-im-fixture',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@deepseek-ai/dsh-experimental-agent-team-profile','@naumi/dsh-enterprise']}}}));
fs.writeFileSync(path.join(home,'cordis.patch.yml'),stringify([{id:'ui-theme',config:{preference:'light'}},{id:'session-log-deepseek',disabled:true}]));
fs.writeFileSync(path.join(profile,'cordis.patch.yml'),stringify([{id:'ui-settings-general',config:{welcomeNoticeVersion:'2026-09-28.1'}}]));
const directory=new BotDirectory(path.join(home,'naumi/bots.json'));
await directory.create({sessionId:'fixture-home',cwd:temporary},{name:'项目主管',kind:'agent',purpose:'IM 设置验收'});await directory.choosePrimary(directory.list().bots[0].id,directory.list().revision);await directory.close();
const sock=http.createServer();await new Promise(r=>sock.listen(0,'127.0.0.1',r));const port=sock.address().port;await new Promise(r=>sock.close(r));const base='http://127.0.0.1:'+port;
let output='',browser;const child=spawn(process.execPath,[path.join(root,'node_modules/@deepseek-ai/dsh/lib/bin.js'),'web','--host','127.0.0.1','--port',String(port),'--no-open'],{cwd:root,env:{...process.env,DSH_HOME:home,DSH_TELEMETRY_MODE:'DISABLED'},windowsHide:true});
child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
const checks=[];function check(name,value){assert(value,name);checks.push(name);console.log('IM_UI_PASS '+name);}
try{
 let launch;for(let i=0;i<150;i++){launch=output.match(new RegExp('http://127\\.0\\.0\\.1:'+port+'/?\\?token=[A-Za-z0-9_~.%-]+'))?.[0];if(launch)break;if(child.exitCode!==null)throw Error('FIXTURE_BOOT_FAILED');await new Promise(r=>setTimeout(r,200));}assert(launch,'FIXTURE_BOOT_TIMEOUT');
 const exchange=await fetch(launch,{redirect:'manual'}),cookie=exchange.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
 const api=async()=>{const r=await fetch(base+'/naumi/im',{headers:{cookie}});assert.equal(r.status,200);return r.json();};
 check('real_owner_gateway_route',(await api()).connections.length===0);check('unauthenticated_401',(await fetch(base+'/naumi/im')).status===401);
 browser=await chromium.launch({headless:true,channel:'chrome'});const context=await browser.newContext({viewport:{width:1360,height:900},colorScheme:'light'}),page=await context.newPage(),errors=[],inference=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname==='/api/session/prompt')inference.push(r.url());});
 await page.route('**/*',route=>{const u=new URL(route.request().url());return ['http:','https:'].includes(u.protocol)&&u.origin!==base?route.abort():route.continue();});
 await page.goto(launch);await page.waitForTimeout(1500);await page.keyboard.press('Control+Alt+,');
 await page.getByRole('button',{name:'消息接入',exact:true}).click();await page.locator('.nim-settings').waitFor();check('public_settings_slot',await page.getByRole('heading',{name:'消息接入',exact:true}).isVisible());
 await page.getByRole('button',{name:'添加飞书',exact:true}).click();await page.getByLabel('连接名称',{exact:true}).fill('飞书工作消息');await page.getByLabel('App ID',{exact:true}).fill('cli_fixture_disabled');await page.getByLabel('App Secret',{exact:true}).fill('fixture-only-secret');
 check('secret_password_field',await page.getByLabel('App Secret',{exact:true}).getAttribute('type')==='password');
 await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('heading',{name:'飞书工作消息',exact:true}).waitFor();const saved=await api();
 check('real_save_persisted_disabled',saved.connections.length===1&&saved.connections[0].configured&&!saved.connections[0].enabled);check('secret_not_in_response',!JSON.stringify(saved).includes('fixture-only-secret')&&!JSON.stringify(saved).includes('secretRef'));
 await page.locator('.nim-panel').getByRole('button',{name:'编辑',exact:true}).click();check('edit_never_hydrates_secret',await page.getByLabel('App Secret',{exact:true}).inputValue()==='');await page.getByLabel('连接名称',{exact:true}).fill('飞书 · 项目协作');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('heading',{name:'飞书 · 项目协作',exact:true}).waitFor();check('rename_retains_secret',(await api()).connections[0].configured);
 await page.getByRole('button',{name:'添加钉钉',exact:true}).click();await page.getByLabel('连接名称',{exact:true}).fill('钉钉 · 工作通知');await page.getByLabel('Client ID',{exact:true}).fill('ding_fixture_disabled');await page.getByLabel('Client Secret',{exact:true}).fill('fixture-only-secret');await page.getByRole('button',{name:'保存',exact:true}).click();await page.getByRole('heading',{name:'钉钉 · 工作通知',exact:true}).waitFor();
 check('both_platforms_operable',(await api()).connections.length===2);check('pair_disabled_until_enabled',await page.getByRole('button',{name:'配对',exact:true}).first().isDisabled());
 await page.screenshot({path:path.join(out,'im-settings-desktop.png')});
 for(const width of [1360,580,360]){await page.setViewportSize({width,height:900});check('responsive_'+width,await page.locator('.nim-settings').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}));}
 await page.screenshot({path:path.join(out,'im-settings-mobile.png')});check('zero_page_errors',errors.length===0);check('no_model_calls',inference.length===0);
 fs.writeFileSync(path.join(out,'UI_VERIFICATION.json'),JSON.stringify({tier:'isolated REAL Harness host, real SQLite/credentials HTTP save; no external platform account',checks,errors,inference:0,connections:await api()},null,2)+'\n');console.log('IM_UI_COMPLETE checks='+checks.length+' errors='+errors.length+' inference=0');
}finally{await browser?.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('close',r));fs.writeFileSync(path.join(out,'UI_FIXTURE.log'),output.replace(/\?token=[A-Za-z0-9_~.%-]+/g,'?token=REDACTED'));}
