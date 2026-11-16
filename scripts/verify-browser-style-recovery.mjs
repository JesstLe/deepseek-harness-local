import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=path.join(root,'evidence/browser-style');
const entries=JSON.parse(fs.readFileSync(path.join(dir,'change-manifest.json'),'utf8'));
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
if(process.argv[2]!=='rollback-test')throw Error('Expected rollback-test');
const copy=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-style-rollback-'));
for(const e of entries){const p=path.join(copy,e.path);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(root,e.path),p);}
const result=spawnSync(process.env.NAUMI_GIT_BASH??'D:/DEV/Git/bin/bash.exe',[path.join(dir,'ROLLBACK.sh'),copy],{encoding:'utf8',windowsHide:true,env:{...process.env,NAUMI_NODE_EXE:process.execPath}});
assert.equal(result.status,0,result.stderr);
const source=fs.readFileSync(path.join(copy,'plugins/naumi-sidebar-browser/client.js'),'utf8');assert(source.includes('tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-browser";'));
for(const e of entries){assert.equal(hash(path.join(root,e.path)),e.modifiedSHA256);if(e.originalSHA256)assert.equal(hash(path.join(copy,e.path)),e.originalSHA256);else assert(!fs.existsSync(path.join(copy,e.path)));}
fs.writeFileSync(path.join(dir,'rollback-check.json'),JSON.stringify({copy,originalFiles:entries.filter(e=>e.originalSHA256).length,restoredCSSOwner:'@deepseek-ai/dsh-client-ui-sidebar-browser',activeUnchanged:true,command:['bash',path.join(dir,'ROLLBACK.sh'),copy],literalOutput:result.stdout.trim(),exitStatus:result.status},null,2)+'\n');
console.log(`ROLLBACK original_hashes=${entries.filter(e=>e.originalSHA256).length} css_owner=upstream active_unchanged=1`);
