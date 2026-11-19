import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
assert.equal(process.argv[2],'--test','COPY_ONLY_ROLLBACK');
const root=path.resolve(process.argv[3]??''),here=path.dirname(fileURLToPath(import.meta.url));
const e=path.basename(here)==='weixin-primary'?here:path.join(root,'evidence/weixin-primary');
const manifest=JSON.parse(fs.readFileSync(path.join(e,'hashes.json'))),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const copy=path.join(e,'rollback-copy-'+randomUUID());fs.mkdirSync(copy);
fs.writeFileSync(path.join(copy,'.weixin-source-fixture'),'weixin-source-copy-only\n');
for(const dir of ['plugins','tests'])fs.cpSync(path.join(root,dir),path.join(copy,dir),{recursive:true});
fs.copyFileSync(path.join(root,'package.json'),path.join(copy,'package.json'));fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');
for(const f of manifest.files){assert.equal(sha(path.join(root,f.path)),f.modifiedSHA256);const to=path.join(copy,f.path);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(path.join(e,'modified',f.path),to);}
const run=(name,args)=>{const r=spawnSync(process.execPath,args,{cwd:copy,encoding:'utf8',maxBuffer:10e6});fs.writeFileSync(path.join(e,name+'.log'),r.stdout+r.stderr);assert.equal(r.status,0,name+' '+r.stdout+r.stderr);return r.stdout;};
run('ROLLBACK_SEED',['--input-type=module','-e',`import{IMStore}from'./plugins/naumi-enterprise/im-store.js';const s=new IMStore('retained.sqlite');s.saveTransportState('fixture','cursor','retained-cursor');s.close();console.log('WEIXIN_SEED additive_transport_state=retained schema=1');`]);
let restored=0,removed=0;
for(const f of manifest.files){const to=path.resolve(copy,f.path);assert(to.startsWith(copy+path.sep));assert.equal(sha(to),f.modifiedSHA256);if(f.originalSHA256){const from=path.join(e,'original',f.path);assert.equal(sha(from),f.originalSHA256);fs.copyFileSync(from,to);restored++;}else{fs.unlinkSync(to);removed++;}}
const tests=run('ROLLBACK_TESTS',['--test','tests/naumi-im-gateway.test.mjs','tests/naumi-im-platforms.test.mjs']);assert.match(tests,/pass 21/);
const behavior=run('ROLLBACK_BEHAVIOR',['--input-type=module','-e',`import assert from'node:assert/strict';import{IMStore}from'./plugins/naumi-enterprise/im-store.js';import{IM_PLATFORMS}from'./plugins/naumi-enterprise/im-platforms.js';const s=new IMStore('retained.sqlite');assert.deepEqual(Object.keys(IM_PLATFORMS).sort(),['dingtalk','feishu']);assert.equal(s.db.prepare('SELECT value FROM transport_state WHERE connection_id=? AND key=?').get('fixture','cursor').value,JSON.stringify('retained-cursor'));assert.equal(s.db.prepare('PRAGMA user_version').get().user_version,1);s.close();console.log('WEIXIN_ROLLBACK original_platforms=dingtalk,feishu cursor=retained schema=1 live_data=untouched');`]);
for(const f of manifest.files){assert.equal(sha(path.join(root,f.path)),f.modifiedSHA256);const to=path.join(copy,f.path);if(f.originalSHA256)assert.equal(sha(to),f.originalSHA256);else assert(!fs.existsSync(to));}
const result={status:'PASS',copy,baseline:manifest.baseline,restored,removed,tests:21,modifiedSource:'retained',liveDataTouched:false,installedRollback:false,behavior:behavior.trim()};
fs.writeFileSync(path.join(e,'ROLLBACK_RESULT.json'),JSON.stringify(result,null,2)+'\n');
console.log('WEIXIN_ROLLBACK_COPY restored='+restored+' removed='+removed+' tests=21 hashes=PASS');process.stdout.write(behavior);console.log('WEIXIN_ROLLBACK modified_source=retained installed_profile=untouched');
