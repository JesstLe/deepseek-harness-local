import {_electron as electron} from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),mode=process.argv[2];
assert(['baseline','modified'].includes(mode));
const evidence=path.join(root,'evidence/browser-style');fs.mkdirSync(evidence,{recursive:true});
const bundle=fs.readFileSync(path.join(root,'plugins/naumi-sidebar-browser/client.js'),'utf8'),styleInjection=bundle.slice(bundle.indexOf('const css ='),bundle.indexOf('var Browser_module_css_default'));
const reserve=net.createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
const env={...process.env,NAUMI_ROOT:root,NAUMI_DSH_HOME:path.join(root,'.dsh/desktop-test/harness'),NAUMI_HOST_URL:`http://127.0.0.1:${port}`,NAUMI_USER_DATA:path.join(root,`.dsh/style-test-${mode}-${Date.now()}`),NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[path.join(root,'desktop')],env,timeout:90000});
const errors=[];let page;
const measure=()=>page.locator('.SB_kFW_root:visible').last().evaluate(root=>{
 const toolbar=root.querySelector('form'),input=toolbar.querySelector('input'),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};};
 return {root:rect(root),toolbar:rect(toolbar),input:rect(input),toolbarDisplay:getComputedStyle(toolbar).display,rootDisplay:getComputedStyle(root).display,buttons:[...toolbar.querySelectorAll('button')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden').map(rect),owners:[...document.querySelectorAll('style[data-plugin]')].filter(e=>e.textContent.includes('.SB_kFW_toolbar')).map(e=>({owner:e.dataset.plugin,id:e.dataset.pluginCss}))};
});
try{
 page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.waitForURL(env.NAUMI_HOST_URL+'/**',{timeout:120000});
 await page.addLocatorHandler(page.getByRole('dialog').filter({hasText:'开始使用'}),async dialog=>dialog.getByRole('button',{name:'关闭',exact:true}).click());
 await page.getByRole('button',{name:'AI 协作',exact:true}).click();
 await page.locator('button[aria-label="打开右侧边栏"],button[aria-label="收起右侧边栏"]').first().waitFor();
 const toggle=page.getByRole('button',{name:'打开右侧边栏',exact:true});if(await toggle.isVisible())await toggle.click();
 await page.getByText('浏览器',{exact:true}).last().click();
 await page.getByRole('textbox',{name:'输入 HTTP(S) 地址',exact:true}).waitFor();
 const before=await measure();
 // Same disposal operation as dsh-client-modules removeOwnedStyles(id).
 await page.evaluate(()=>{for(const el of document.querySelectorAll('style[data-plugin]'))if(el.getAttribute('data-plugin')==='@deepseek-ai/dsh-client-ui-sidebar-browser')el.remove();});
 const after=await measure(),cases=[];
 if(mode==='baseline'){
   assert(before.owners.some(s=>s.owner==='@deepseek-ai/dsh-client-ui-sidebar-browser'));
   assert.equal(after.toolbarDisplay,'block');assert.equal(after.owners.length,0);
   console.log('BASELINE cleanup=upstream toolbar=block owned_styles=0 defect_reproduced=1');
 }else{
   assert.equal(after.toolbarDisplay,'flex');assert.equal(after.owners.length,1);assert.equal(after.owners[0].owner,'@naumi/dsh-sidebar-browser');
   assert.equal(after.owners[0].id,'@naumi/dsh-sidebar-browser/Browser.module.css');
   await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click();await page.getByRole('button',{name:'打开右侧边栏',exact:true}).click();
   assert.equal((await measure()).toolbarDisplay,'flex');
   for(const width of [320,550,800]){
     await page.locator('.naumi-native-browser:visible').last().evaluate((e,width)=>{e.style.cssText=`position:fixed;left:0;top:0;width:${width}px;height:380px;z-index:999;`;},width);
     const s=await measure();assert.equal(s.toolbarDisplay,'flex');assert(s.input.width>100);assert(s.toolbar.height<=50);assert(s.buttons.every(b=>b.y>=s.toolbar.y&&b.bottom<=s.toolbar.bottom));assert(s.input.right<=s.toolbar.right);cases.push({width,inputWidth:s.input.width,singleRow:true});
   }
   // A Naumi HMR dispose/re-materialize must recreate exactly its own style.
   await page.evaluate(code=>{for(const e of document.querySelectorAll('style[data-plugin]'))if(e.dataset.plugin==='@naumi/dsh-sidebar-browser')e.remove();new Function(code)();},styleInjection);
   assert.equal((await measure()).owners.length,1);assert.equal((await measure()).toolbarDisplay,'flex');
   console.log('MODIFIED cleanup=upstream toolbar=flex owned_styles=1 widths=3 hmr=PASS');
 }
 await page.locator('.naumi-native-browser:visible').last().evaluate(e=>{e.style.cssText='position:fixed;left:0;top:0;width:550px;height:380px;z-index:999;';});
 await page.locator('.naumi-native-browser:visible').last().screenshot({path:path.join(evidence,mode+'.png')});
 fs.writeFileSync(path.join(evidence,mode+'.json'),JSON.stringify({before,after,cases,errors},null,2)+'\n');
 assert.deepEqual(errors,[]);
}catch(error){if(page){console.error('STYLE_TEST_UI '+(await page.locator('body').innerText()).slice(-1800));}throw error;}
finally{await app.close();}
