import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {desktopCollaborationOrigin,DesktopEnterpriseTransport}from'../plugins/naumi-enterprise/desktop-enterprise.js';
test('unlinked Canvas account can boot without manufacturing an enterprise connection',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-account-only-'));
 try{const env={DSH_HOME:home,NAUMI_DESKTOP_INSTANCE_ID:'fixture'};assert.equal(desktopCollaborationOrigin('http://127.0.0.1:3112',env),'http://127.0.0.1:3112');assert.deepEqual(fs.readdirSync(home),[]);}
 finally{fs.rmdirSync(home);}
});
test('an existing enterprise binding still requires the exact configured issuer',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-account-bound-')),file=path.join(home,'desktop-enterprise.json');
 try{fs.writeFileSync(file,JSON.stringify({version:1,origin:'https://enterprise.example.test'}));const env={DSH_HOME:home,NAUMI_DESKTOP_INSTANCE_ID:'fixture'};
 assert.throws(()=>desktopCollaborationOrigin('http://127.0.0.1:3112',env),/ENTERPRISE_CONFIG_INVALID/);
 assert.throws(()=>desktopCollaborationOrigin('http://127.0.0.1:3112',{...env,NAUMI_ENTERPRISE_ORIGIN:'https://other.example.test'}),/ENTERPRISE_CONFIG_INVALID/);
 assert.equal(desktopCollaborationOrigin('',{...env,NAUMI_ENTERPRISE_ORIGIN:'https://enterprise.example.test'}),'https://enterprise.example.test');}
 finally{fs.unlinkSync(file);fs.rmdirSync(home);}
});
test('declared enterprise without its binding fails closed and an unlinked transport grants no session',async()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-account-missing-'));
 try{const env={DSH_HOME:home,NAUMI_DESKTOP_INSTANCE_ID:'fixture',NAUMI_ENTERPRISE_ORIGIN:'https://enterprise.example.test'};
 assert.throws(()=>desktopCollaborationOrigin('http://127.0.0.1:3112',env),/ENOENT/);
 const transport=new DesktopEnterpriseTransport({origin:'http://127.0.0.1:3112',home,standalone:true});
 await assert.rejects(transport.fetch('/api/workspace'),/COLLABORATION_LOGIN_REQUIRED/);}
 finally{fs.rmdirSync(home);}
});
