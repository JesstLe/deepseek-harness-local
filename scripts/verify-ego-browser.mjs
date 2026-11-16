import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
import {EgoBrowserRuntime,resolveBrowserRuntime} from '../plugins/naumi-enterprise/browser-runtime.js';
const runtime=new EgoBrowserRuntime(),scope='naumi-browser-e2e-20261116';
const server=http.createServer((req,res)=>{
  res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"frame-ancestors 'none'");res.setHeader('Content-Type','text/html; charset=utf-8');
  if(req.url==='/cookie'){res.setHeader('Set-Cookie','naumi_ego_fixture=accepted; HttpOnly; SameSite=Lax; Path=/');res.end('<title>Cookie saved</title><h1>Cookie saved</h1>');return;}
  if(req.url==='/protected'){res.end(`<title>Session check</title><h1>${req.headers.cookie?.includes('naumi_ego_fixture=accepted')?'LOGIN_RETAINED':'LOGIN_MISSING'}</h1>`);return;}
  if(req.url==='/second'){res.end('<title>Second page</title><h1>Second page</h1>');return;}
  res.end('<!doctype html><html><meta charset="utf-8"><title>Naumi Browser Fixture</title><style>body{font:20px system-ui;background:#f6f8fc;padding:35px;color:#243550}button,input{font:inherit;padding:12px;margin:8px}h1{font-size:28px}</style><h1>Naumi Browser Fixture</h1><label>Name <input id="name"></label><button id="apply" onclick="document.querySelector(\'#result\').textContent=document.querySelector(\'#name\').value;document.querySelector(\'#count\').textContent=++window.count">Apply</button><p id="result"></p><p id="count">0</p><a href="/second">Next page</a><script>window.count=0</script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const op=args=>runtime.perform(scope,args),checks={};
try{
  resolveBrowserRuntime();await op({action:'resize',width:900,height:650});
  await op({action:'navigate',url:origin});await op({action:'fill',selector:'#name',text:'Naumi 企业浏览器'});await op({action:'click',selector:'#apply'});
  const shot=await op({action:'snapshot',frame:true});assert(shot.snapshot.includes('Naumi 企业浏览器'));assert(shot.snapshot.includes('1'));assert(shot.image.length>1000);checks.semantic_input=true;checks.frame_denied_site_works=true;
  fs.writeFileSync('evidence/ego-lite/fixture-page.jpg',Buffer.from(shot.image,'base64'));
  await op({action:'click',selector:'#name'});await op({action:'press',key:'Control+a'});await op({action:'text',text:'中文键盘输入'});await op({action:'click',selector:'#apply'});assert((await op({action:'snapshot'})).snapshot.includes('中文键盘输入'));checks.keyboard=true;
  await op({action:'navigate',url:origin+'/second'});await op({action:'back'});assert((await op({action:'state'})).title==='Naumi Browser Fixture');await op({action:'forward'});assert((await op({action:'state'})).title==='Second page');checks.history=true;
  await op({action:'navigate',url:origin+'/cookie'});await op({action:'navigate',url:origin+'/protected'});await op({action:'reload'});assert((await op({action:'snapshot'})).snapshot.includes('LOGIN_RETAINED'));checks.httpOnly_cookie_retained=true;
  const tabs=await op({action:'tabs'});assert(tabs.tabs.some(x=>x.label==='p1'));checks.space_pages=true;
  fs.writeFileSync('evidence/ego-lite/RUNTIME_CHECK.json',JSON.stringify({engine:'ego-lite',version:'0.6.3.14',checks,realBrowser:true,paidGenerationCalls:0,at:new Date().toISOString()},null,2)+'\n');
  console.log('EGO_RUNTIME real_browser=1 semantic_input=1 keyboard=1 history=1 cookie_retained=1 frame_denied_site=1 checks='+Object.keys(checks).length);
}finally{await op({action:'finish'});await runtime.dispose();server.closeAllConnections();await new Promise(r=>server.close(r));}
