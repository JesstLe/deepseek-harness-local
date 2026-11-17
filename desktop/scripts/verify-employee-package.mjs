import {_electron as electron} from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),exe=path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe');
const env={...process.env,NAUMI_USER_DATA:path.join(root,'.dsh/employee-runtime-test-'+Date.now()),NAUMI_HOST_URL:'http://127.0.0.1:3082',NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
for(const key of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','ELECTRON_RUN_AS_NODE'])delete env[key];
// No development Node/pnpm/Python on PATH: the package must boot its own runtime.
env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot+';'+process.env.SystemRoot+'\\System32\\WindowsPowerShell\\v1.0';
const app=await electron.launch({executablePath:exe,args:[],env,timeout:90000});
const fixture=http.createServer((_q,r)=>{r.setHeader('Content-Type','text/html;charset=utf-8');r.setHeader('X-Frame-Options','DENY');r.end('<title>Packaged Naumi Browser</title><h1>Naumi</h1><input aria-label="Package input">');});await new Promise(r=>fixture.listen(0,'127.0.0.1',r));
try{
 const page=await app.firstWindow();await Promise.race([page.waitForURL('http://127.0.0.1:3082/**',{timeout:120000}),page.waitForURL('**/startup.html?error=**',{timeout:120000}).then(()=>{throw Error('PACKAGED_STARTUP '+new URL(page.url()).searchParams.get('error'));})]);
 await page.getByRole('button',{name:'工作台',exact:true}).first().waitFor();
 const result=await app.evaluate(({app})=>({packaged:app.isPackaged,product:app.getName(),version:app.getVersion(),node:process.versions.node,chromium:process.versions.chrome,backend:globalThis.__naumiTest?.settings.root,owned:globalThis.__naumiTest?.settings.home}));
 assert(result.packaged);assert.equal(result.product,'Naumi');assert(result.backend.includes('resources'));assert(result.owned.includes('employee-runtime-test'));
 assert.equal(await page.evaluate(()=>window.naumiDesktop.engine),'chromium');
 assert.equal(await page.evaluate(()=>('dshDesktop' in globalThis)),false);assert.equal(await page.locator('[data-desktop-onboarding]').count(),0);
 await page.addLocatorHandler(page.getByRole('dialog').filter({hasText:'开始使用'}),async dialog=>{await dialog.getByRole('button',{name:'关闭',exact:true}).click();});
 await page.getByRole('button',{name:'AI 协作',exact:true}).click();
 await page.locator('button[aria-label="打开右侧边栏"],button[aria-label="收起右侧边栏"]').first().waitFor();
 const toggle=page.getByRole('button',{name:'打开右侧边栏',exact:true});if(await toggle.isVisible())await toggle.click();
 await page.getByText('浏览器',{exact:true}).last().click();
 const address=page.getByRole('textbox',{name:'输入 HTTP(S) 地址',exact:true});await address.fill('http://127.0.0.1:'+fixture.address().port);await address.press('Enter');
 await page.locator('webview').waitFor({state:'attached'});
 const deadline=Date.now()+15000;let loaded=false;while(Date.now()<deadline){loaded=await app.evaluate(()=>[...globalThis.__naumiTest.guests.leases.values()].some(e=>e.guest&&!e.guest.isDestroyed()&&e.guest.getTitle()==='Packaged Naumi Browser'));if(loaded)break;await new Promise(r=>setTimeout(r,50));}assert(loaded,'packaged native guest did not load');
 const home=path.join(env.NAUMI_USER_DATA,'harness');assert(!fs.existsSync(path.join(home,'.credentials.yaml'))||!fs.readFileSync(path.join(home,'.credentials.yaml'),'utf8').match(/CCS_|apiKey:/));
 const vendor=path.join(result.backend,'node_modules/dingtalk-workspace-cli/vendor'),beforeVendor=fs.readdirSync(vendor).sort();
 const cli=spawnSync(path.join(result.backend,'node.exe'),[path.join(result.backend,'runtime/dingtalk-cli.cjs'),'auth','status','--readonly','--format','json'],{env:{SystemRoot:process.env.SystemRoot,PATH:env.PATH,DSH_HOME:home},cwd:home,encoding:'utf8',timeout:15000});
 assert.equal(cli.status,0,cli.stderr);const cliStatus=JSON.parse(cli.stdout);assert.equal(cliStatus.success,true);assert.equal(cliStatus.authenticated,false);assert.deepEqual(fs.readdirSync(vendor).sort(),beforeVendor);
 await page.screenshot({path:path.join(root,'evidence/employee-package/packaged-startup.png')});
 const sanitized={...result,backend:'bundled resources/backend',owned:'isolated package-test profile',devToolsOnPATH:false,credentialsBundled:false,dingtalk:{installed:true,healthy:true,authenticated:false,installationResourcesUnchanged:true},acceptance:'unpacked executable only, not NSIS installation'};
 fs.writeFileSync(path.join(root,'evidence/employee-package/DESKTOP_SMOKE.json'),JSON.stringify(sanitized,null,2)+'\n');
 console.log('PACKAGED_STARTUP product=Naumi native_browser=1 bundled_node=1 bundled_dingtalk=1 development_path=0 credentials_bundled=0 installation_test=0');
}catch(error){const page=await app.firstWindow();console.log('PACKAGE_DIAGNOSTIC '+(await page.locator('body').innerText()).slice(0,3000));await page.screenshot({path:path.join(root,'evidence/employee-package/package-failure.png'),timeout:5000}).catch(()=>{});throw error;}finally{await app.close();fixture.closeAllConnections();await new Promise(r=>fixture.close(r));}
