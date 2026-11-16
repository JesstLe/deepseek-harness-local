import {_electron as electron} from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),exe=path.join(root,'runtime/naumi-desktop-release/win-unpacked/Naumi.exe');
const env={...process.env,NAUMI_USER_DATA:path.join(root,'.dsh/desktop-package-test'),NAUMI_HOST_URL:'http://127.0.0.1:3082',NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};
for(const key of ['NAUMI_ROOT','NAUMI_DSH_HOME','NAUMI_NODE','ELECTRON_RUN_AS_NODE'])delete env[key];
// No development Node/pnpm/Python on PATH: the package must boot its own runtime.
env.PATH=process.env.SystemRoot+'\\System32;'+process.env.SystemRoot;
const app=await electron.launch({executablePath:exe,args:[],env,timeout:90000});
try{
 const page=await app.firstWindow();await Promise.race([page.waitForURL('http://127.0.0.1:3082/**',{timeout:120000}),page.waitForURL('**/startup.html?error=**',{timeout:120000}).then(()=>{throw Error('PACKAGED_STARTUP '+new URL(page.url()).searchParams.get('error'));})]);
 await page.getByRole('button',{name:'工作台',exact:true}).first().waitFor();
 const result=await app.evaluate(({app})=>({packaged:app.isPackaged,product:app.getName(),version:app.getVersion(),node:process.versions.node,chromium:process.versions.chrome,backend:globalThis.__naumiTest?.settings.root,owned:globalThis.__naumiTest?.settings.home}));
 assert(result.packaged);assert.equal(result.product,'Naumi');assert(result.backend.includes('resources'));assert(result.owned.includes('desktop-package-test'));
 assert.equal(await page.evaluate(()=>window.naumiDesktop.engine),'chromium');
 const home=path.join(env.NAUMI_USER_DATA,'harness');assert(!fs.existsSync(path.join(home,'.credentials.yaml'))||!fs.readFileSync(path.join(home,'.credentials.yaml'),'utf8').match(/CCS_|apiKey:/));
 await page.screenshot({path:path.join(root,'evidence/naumi-desktop/packaged-startup.png')});
 const sanitized={...result,backend:'bundled resources/backend',owned:'isolated package-test profile',devToolsOnPATH:false,credentialsBundled:false};
 fs.writeFileSync(path.join(root,'evidence/naumi-desktop/package-tests.json'),JSON.stringify(sanitized,null,2)+'\n');
 console.log('PACKAGED_STARTUP product=Naumi native_browser=1 bundled_node=1 development_path=0 credentials_bundled=0');
}finally{await app.close();}
