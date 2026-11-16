import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('..',import.meta.url)),evidence=path.join(root,'evidence/naumi-desktop'),mode=process.argv[2];
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const originals=JSON.parse(fs.readFileSync(path.join(evidence,'original-hashes.json'),'utf8'));
if(mode==='baseline'){
 for(const item of originals)assert.equal(hash(path.join(evidence,'original',item.path)),item.sha256);
 const old=fs.readFileSync(path.join(evidence,'original/plugins/naumi-enterprise/assets/browser-client.js'),'utf8');assert(old.includes('state?.image'));assert(!old.includes('installNativeBrowserUI'));
 assert.match(fs.readFileSync(path.join(evidence,'baseline-tests.txt'),'utf8'),/pass 52/);
 console.log('BASELINE module_tests=52 native_desktop=0 screenshot_sidebar=1');
}else if(mode==='modified'){
 const results=JSON.parse(fs.readFileSync(path.join(evidence,'native-tests.json'),'utf8')).results;
 assert.equal(results.length,20);assert(results.every(r=>r.pass));
 const p=JSON.parse(fs.readFileSync(path.join(evidence,'package-tests.json'),'utf8'));assert(p.packaged&&p.credentialsBundled===false);
 assert.match(fs.readFileSync(path.join(evidence,'module-tests.log'),'utf8'),/pass 58/);
 const icons=JSON.parse(fs.readFileSync(path.join(root,'desktop/app/assets/brand-manifest.json'),'utf8'));assert.equal(icons.uses.length,8);assert.equal(hash(path.join(root,icons.source)),icons.sha256);
 for(const item of JSON.parse(fs.readFileSync(path.join(evidence,'change-manifest.json'),'utf8')))assert.equal(hash(path.join(root,item.path)),item.modifiedSHA256);
 console.log('MODIFIED module_tests=58 native_tests=20 package_boot=1 logo_targets=8 screenshot_transport=0');
}else if(mode==='rollback-test'){
 const manifest=JSON.parse(fs.readFileSync(path.join(evidence,'change-manifest.json'),'utf8')),copy=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-desktop-rollback-'));
 for(const item of manifest){const dest=path.join(copy,item.path);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,item.path),dest);}
 const gitBash=process.env.NAUMI_BASH??'D:/DEV/Git/bin/bash.exe';
 const p=spawnSync(gitBash,[path.join(evidence,'ROLLBACK.sh'),copy],{encoding:'utf8',windowsHide:true});assert.equal(p.status,0,p.stderr);assert.match(p.stdout,/sources_restored=1/);
 for(const item of manifest){assert.equal(hash(path.join(root,item.path)),item.modifiedSHA256);if(item.originalSHA256)assert.equal(hash(path.join(copy,item.path)),item.originalSHA256);else assert(!fs.existsSync(path.join(copy,item.path)));}
 const restored=fs.readFileSync(path.join(copy,'plugins/naumi-enterprise/assets/browser-client.js'),'utf8');assert(restored.includes('state?.image'));assert(!restored.includes('installNativeBrowserUI'));
 console.log('ROLLBACK originals_restored=1 desktop_entry=0 active_unchanged=1');
}else throw Error('Expected baseline, modified or rollback-test');
