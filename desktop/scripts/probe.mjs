import { _electron as electron } from '../node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url));
const env={...process.env,NAUMI_ROOT:root,NAUMI_DSH_HOME:path.join(root,'.dsh/desktop-test/harness'),NAUMI_HOST_URL:'http://127.0.0.1:3081',NAUMI_USER_DATA:path.join(root,'.dsh/desktop-test/electron'),NAUMI_TEST:'1',NAUMI_TEST_HIDDEN:'1'};delete env.ELECTRON_RUN_AS_NODE;
const app=await electron.launch({args:[path.join(root,'desktop')],env,timeout:90000});
const messages=[];app.process().stderr.on('data',d=>messages.push(d.toString()));
try{
 const page=await app.firstWindow();page.on('pageerror',e=>messages.push('PAGEERROR '+e.message));page.on('console',m=>{if(m.type()==='error')messages.push('CONSOLE '+m.text());});
 await page.waitForURL('http://127.0.0.1:3081/**',{timeout:120000});
 await page.waitForSelector('button',{timeout:60000});
 await page.getByRole('button',{name:'AI 协作',exact:true}).click();
 await page.getByRole('button',{name:'打开右侧边栏',exact:true}).click();
 await page.getByText('浏览器',{exact:true}).last().click();
 await page.waitForTimeout(1200);
 console.log(JSON.stringify(await page.evaluate(()=>({url:location.origin+location.pathname,title:document.title,text:document.body.innerText.slice(0,5500),buttons:[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent?.slice(0,50),label:e.getAttribute('aria-label'),title:e.title})),desktop:!!window.naumiDesktop})),null,2));
 console.log('INPUTS '+JSON.stringify(await page.locator('input').evaluateAll(es=>es.map(e=>({label:e.getAttribute('aria-label'),placeholder:e.placeholder})))));
 console.log('NATIVE '+JSON.stringify(await page.locator('[data-naumi-native-browser]').count()));
 await page.screenshot({path:path.join(root,'evidence/naumi-desktop/initial-probe.png')});
}catch(e){console.log('PROBE_ERROR '+e.message);}finally{console.log(messages.join('\n').slice(-8000));await app.close();}
