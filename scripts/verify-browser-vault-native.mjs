import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';
const root=process.cwd(),out=path.resolve('output/browser-connect'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-browser-vault-'));fs.mkdirSync(out,{recursive:true});
try{for(const phase of ['write','read']){
 const env={...process.env,NAUMI_BROWSER_TEST_ROOT:root,NAUMI_BROWSER_TEST_DATA:temp,NAUMI_BROWSER_TEST_PHASE:phase,NAUMI_BROWSER_TEST_OUT:out};delete env.ELECTRON_RUN_AS_NODE;
 const r=spawnSync(path.join(root,'desktop/node_modules/electron/dist/electron.exe'),[path.join(root,'scripts/verify-browser-vault-electron.cjs')],{env,windowsHide:true,encoding:'utf8',timeout:90000});
 fs.writeFileSync(path.join(out,'ELECTRON_'+phase+'.log'),(r.stdout||'')+(r.stderr||''));
 assert.equal(r.status,0,(r.stdout||'')+(r.stderr||'')+String(r.error||''));
 const result=JSON.parse(fs.readFileSync(path.join(out,'ELECTRON_'+phase+'.json')));console.log('NATIVE_BROWSER_VAULT '+JSON.stringify(result));
}}finally{assert(temp.startsWith(os.tmpdir()+path.sep));fs.rmSync(temp,{recursive:true,force:true});}
