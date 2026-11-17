import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
const root=process.cwd(),dir=path.join(root,'evidence/browser-default-baidu'),live=path.join(root,'.dsh/profiles/web/node_modules/@naumi/dsh-sidebar-browser'),backup=path.join(root,'.dsh/browser-default-baidu-runtime-backup-'+Date.now());fs.mkdirSync(backup,{recursive:true});
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),files=['client.js','UPSTREAM.json'];
const before=Object.fromEntries(fs.readdirSync(live).filter(f=>fs.statSync(path.join(live,f)).isFile()).map(f=>[f,hash(path.join(live,f))]));
for(const f of files){fs.copyFileSync(path.join(live,f),path.join(backup,f));fs.copyFileSync(path.join(root,'plugins/naumi-sidebar-browser',f),path.join(live,f));assert.equal(hash(path.join(live,f)),hash(path.join(root,'plugins/naumi-sidebar-browser',f)));}
for(const [f,h]of Object.entries(before))if(!files.includes(f))assert.equal(hash(path.join(live,f)),h);
const logs=['logs/server.out.log','logs/server.err.log'].map(p=>fs.readFileSync(p,'utf8')).join('\n');const launch=[...logs.matchAll(/http:\/\/127\.0\.0\.1:3080\/?\?token=[A-Za-z0-9_~.%-]+/g)].at(-1)?.[0];assert(launch);
const exchange=await fetch(launch,{redirect:'manual'}),cookie=exchange.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');assert(cookie);
let found=false,checked=[];for(let attempt=0;attempt<12&&!found;attempt++){
 const response=await fetch('http://127.0.0.1:3080',{headers:{cookie}});assert.equal(response.status,200);const html=await response.text();
 const urls=[...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(p=>p.includes('plugins/')&&!p.endsWith('.map')))];
 for(const url of urls){const r=await fetch(new URL(url,'http://127.0.0.1:3080'),{headers:{cookie}});if(r.ok){const body=await r.text();if(body.includes('const initialUrl = (0, react.useRef)(tab.navigation.params?.url ?? (currentBrowserTarget(initial.current) === void 0 ? "https://baidu.com" : void 0));')){found=true;checked.push({status:r.status,baiduDefault:true});break;}}}
 if(!found)await new Promise(r=>setTimeout(r,500));
}
const result={backup,changed:files,unrelatedPreserved:Object.keys(before).filter(f=>!files.includes(f)),activeClientSHA256:hash(path.join(live,'client.js')),httpModuleContainsDefault:found,checked,restarted:false};fs.writeFileSync(path.join(dir,'RUNTIME_LOAD.json'),JSON.stringify(result,null,2)+'\n');
console.log('RUNTIME files=2 unrelated=preserved http_default='+found+' restarted=false');assert(found,'Live module must serve the Baidu default');
