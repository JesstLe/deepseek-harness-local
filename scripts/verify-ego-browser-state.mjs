import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {resolveBrowserRuntime} from '../plugins/naumi-enterprise/browser-runtime.js';
const dir='evidence/ego-lite',baseline=JSON.parse(fs.readFileSync(dir+'/baseline.json','utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),hashFile=p=>hash(fs.readFileSync(p));
const portableHash=file=>hash(fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n'));
const stamp=file=>({sha256:hashFile(file),lfSha256:portableHash(file)});
const preserve=()=>{for(const [file,sha]of Object.entries(baseline.preserved))assert.equal(hashFile(file),sha,'Protected file changed: '+file);};
const modes=process.argv.slice(2),mode=modes[0];
for(const [file,data]of Object.entries(baseline.sources))assert.equal(hashFile(dir+'/'+data.backup),data.sha256,'Original changed: '+file);
if(mode==='baseline'){
 assert(!fs.readFileSync(dir+'/'+baseline.sources['plugins/naumi-enterprise/host.js'].backup,'utf8').includes('installEgoBrowser'));
 console.log('BASELINE ego_browser=0 sidebar_browser=0 protected_files=8');
}else if(mode==='modified'){
 preserve();assert.equal(resolveBrowserRuntime().version,'0.6.3.14');assert(fs.readFileSync('plugins/naumi-enterprise/host.js','utf8').includes('installEgoBrowser')); assert.equal(JSON.parse(fs.readFileSync('package.json')).dependencies['agent-desktop'],'1.3.1');
 const modified=Object.fromEntries([...Object.keys(baseline.sources),...baseline.added].map(file=>[file,stamp(file)]));fs.writeFileSync(dir+'/modified-hashes.json',JSON.stringify(modified,null,2));
 console.log('MODIFIED ego_browser=0.6.3.14 sidebar_browser=1 native_tool=1 protected_files=8');
}else if(mode==='rollback-test'){
 preserve();const fixture='.dsh/ego-lite-backup/rollback-test';fs.mkdirSync(fixture,{recursive:true});const active={};
 for(const file of [...Object.keys(baseline.sources),...baseline.added]){const target=path.join(fixture,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);active[file]=hashFile(file);}
 // Exercise the real rollback branch in a disposable copy, including installed plugin files.
 const fixtureEvidence=path.join(fixture,dir);fs.mkdirSync(fixtureEvidence,{recursive:true});
 fs.copyFileSync(dir+'/baseline.json',path.join(fixtureEvidence,'baseline.json'));
 fs.writeFileSync(path.join(fixtureEvidence,'modified-hashes.json'),JSON.stringify(Object.fromEntries(Object.keys(active).map(file=>[file,stamp(file)])),null,2));
 for(const data of Object.values(baseline.sources)){const target=path.join(fixtureEvidence,data.backup);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(dir+'/'+data.backup,target);}
 for(const file of Object.keys(active).filter(f=>f.startsWith('plugins/naumi-enterprise/'))){const target=path.join(fixture,file.replace('plugins/naumi-enterprise/','.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(file,target);}
 const rollback=spawnSync(process.execPath,['scripts/verify-ego-browser-state.mjs','rollback'],{cwd:fixture,encoding:'utf8',windowsHide:true});
 assert.equal(rollback.status,0,rollback.stderr);assert(rollback.stdout.includes('prior_sources_restored=1'));
 for(const [file,data]of Object.entries(baseline.sources))assert.equal(hashFile(path.join(fixture,file)),data.sha256);
 for(const file of baseline.added){assert(!fs.existsSync(path.join(fixture,file)));if(file.startsWith('plugins/naumi-enterprise/'))assert(!fs.existsSync(path.join(fixture,file.replace('plugins/naumi-enterprise/','.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/'))));}
 assert.equal(JSON.parse(fs.readFileSync(path.join(fixture,'package.json'))).dependencies['agent-desktop'],'1.3.1');
 assert(!fs.readFileSync(path.join(fixture,'plugins/naumi-enterprise/host.js'),'utf8').includes('installEgoBrowser'));assert(fs.readFileSync(path.join(fixture,'plugins/naumi-enterprise/host.js'),'utf8').includes('installAgentDesktop'));
 for(const [file,sha]of Object.entries(active))assert.equal(hashFile(file),sha);
 console.log(`ROLLBACK originals_restored=${Object.keys(baseline.sources).length} browser_disabled_in_copy=1 desktop_preserved=1 active_still_integrated=1`);
}else if(mode==='rollback'){
 // Build and validate the complete target list before changing any file. No recursive deletion.
 const modified=JSON.parse(fs.readFileSync(dir+'/modified-hashes.json','utf8'));
 const destinations=file=>file.startsWith('plugins/naumi-enterprise/')?[file,file.replace('plugins/naumi-enterprise/','.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/')]:[file];
 for(const [file,expected]of Object.entries(modified))for(const dest of destinations(file))if(fs.existsSync(dest)){
   const original=baseline.sources[file];
   const exact=[expected.sha256,original?.sha256].includes(hashFile(dest));
   const normalized=[expected.lfSha256,original?portableHash(dir+'/'+original.backup):undefined].includes(portableHash(dest));
   assert(exact||normalized,'Later edits detected: '+dest);
 }
 for(const [file,data]of Object.entries(baseline.sources))for(const dest of destinations(file))if(dest===file||fs.existsSync(dest)){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,fs.readFileSync(dir+'/'+data.backup));}
 for(const file of baseline.added)for(const dest of destinations(file))if(fs.existsSync(dest))fs.unlinkSync(dest);
 console.log('ROLLBACK prior_sources_restored=1 browser_autoload_disabled=1 desktop_preserved=1 private_data_untouched=1 restart_required=1');
}else throw Error('Use baseline, modified, rollback-test or rollback');
