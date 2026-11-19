import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('..',import.meta.url)),dir=path.join(root,'evidence/cua-unified'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'TRANSACTION.json')));
const sha=b=>createHash('sha256').update(b).digest('hex'),hash=f=>fs.existsSync(f)?sha(fs.readFileSync(f)):null;
const targetFile=(target,relative)=>{const p=path.resolve(target,relative);assert(p.startsWith(path.resolve(target)+path.sep),'ROLLBACK_PATH_INVALID');return p;};
function restore(target){
 target=fs.realpathSync(target);assert(target!==path.parse(target).root,'ROLLBACK_ROOT_INVALID');
 for(const r of manifest.sources){const file=targetFile(target,r.file),actual=hash(file);assert(actual===r.after||actual===r.before,'ROLLBACK_LATER_EDIT '+r.file);if(r.before)assert.equal(hash(path.join(dir,'originals',r.file)),r.before);}
 for(const r of manifest.sources){const file=targetFile(target,r.file);if(r.before){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,fs.readFileSync(path.join(dir,'originals',r.file)));}else if(fs.existsSync(file))fs.unlinkSync(file);}
 for(const r of manifest.sources)assert.equal(hash(targetFile(target,r.file)),r.before);
}
const mode=process.argv[2]??'rollback-test';
if(mode==='rollback'){
 assert(process.argv[3],'ROLLBACK_EXPLICIT_COPY_PATH_REQUIRED');restore(path.resolve(process.argv[3]));console.log('ROLLBACK original_sha256_restored=all restart_required=1');
}else if(mode==='rollback-test'){
 const fixture=fs.mkdtempSync(path.join(dir,'rollback-copy-'));
 const activeBefore=new Map(manifest.sources.map(r=>[r.file,hash(path.join(root,r.file))]));
 for(const r of manifest.sources){const src=path.join(dir,'modified',r.file),dest=targetFile(fixture,r.file);assert.equal(hash(src),r.after,'MODIFIED_SNAPSHOT_DRIFT');if(r.after){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}}
 const support='plugins/naumi-enterprise/third-party/agent-desktop/LICENSE';fs.mkdirSync(path.dirname(path.join(fixture,support)),{recursive:true});fs.copyFileSync(path.join(root,support),path.join(fixture,support));
 restore(fixture);
 const test=spawnSync(process.execPath,['--test','tests/agent-desktop.test.mjs'],{cwd:fixture,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(dir,'ROLLBACK_BASELINE_TESTS.txt'),test.stdout+test.stderr);assert.equal(test.status,0,test.stdout+test.stderr);
 for(const r of manifest.sources)assert.equal(hash(path.join(root,r.file)),activeBefore.get(r.file),'ACTIVE_SOURCE_CHANGED_BY_ROLLBACK');
 assert(fs.readFileSync(path.join(fixture,'plugins/naumi-enterprise/host.js'),'utf8').includes('installAgentDesktop(ctx)'));
 assert(fs.readFileSync(path.join(root,'plugins/naumi-enterprise/host.js'),'utf8').includes('installCua(ctx)'));
 console.log('ROLLBACK baseline_tests=10/10 restored_sha256=all active_cua_changed=1 exit=0');
}else throw Error('CUA_STATE_MODE_INVALID');
