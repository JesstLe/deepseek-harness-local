import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=process.cwd(),e=path.join(root,'evidence/employee-package'),sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex'),manifest=JSON.parse(fs.readFileSync(path.join(e,'hashes.json'))),pkg=JSON.parse(fs.readFileSync(path.join(e,'PACKAGE.json')));
assert.equal(sha(path.join(e,'MODIFIED_FILE.zip')),pkg.zipSHA256);
const expanded=path.join(e,'pack-reopen-'+randomUUID()),quote=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command',`Expand-Archive -LiteralPath ${quote(path.join(e,'MODIFIED_FILE.zip'))} -DestinationPath ${quote(expanded)}`]);
for(const m of manifest){const snapshot=m.snapshotPath??m.path;assert.equal(sha(path.join(root,m.path)),m.modifiedSHA256);assert.equal(sha(path.join(expanded,'modified',snapshot)),m.modifiedSHA256);if(m.originalSHA256){assert.equal(sha(path.join(expanded,'original',snapshot)),m.originalSHA256);assert.equal(sha(path.join(e,'original',snapshot)),m.originalSHA256);}}
for(const m of JSON.parse(fs.readFileSync(path.join(e,'original-hashes.json'))))assert.equal(sha(path.join(e,'original',m.snapshotPath??m.path)),m.sha256);
const diff=fs.readFileSync(path.join(e,'DIFF_FILE.patch'),'utf8');assert(diff.includes('dingtalk-runtime.js'));assert(diff.includes('prepare-runtime.mjs'));assert(diff.includes('peerDependencies'));
const verification=fs.readFileSync(path.join(e,'VERIFICATION.txt'),'utf8');for(const word of ['BASELINE','MODIFIED','ROLLBACK','exit=0','fix/naumi-bot-lifecycle-20261116'])assert(verification.includes(word));
const rollback=fs.readFileSync(path.join(e,'ROLLBACK.sh'),'utf8');assert(rollback.startsWith('#!/usr/bin/env bash\n'));assert(!rollback.includes('\r'));assert(rollback.includes('rollback-employee-runtime.mjs'));
const result=JSON.parse(fs.readFileSync(path.join(e,'ROLLBACK_RESULT.json')));assert.equal(result.status,'PASS');assert.equal(result.baselineTests,251);assert.equal(result.liveDataTouched,false);
assert.equal(JSON.parse(fs.readFileSync(path.join(e,'DESKTOP_SMOKE.json'))).packaged,true);
const mode=execFileSync('git',['ls-files','--stage','--','evidence/employee-package/ROLLBACK.sh'],{encoding:'utf8'});assert(mode.startsWith('100755'));
console.log('REOPEN zip_files='+manifest.length+' original_hashes=PASS modified_hashes=PASS diff=PASS verification=PASS rollback_mode=100755 desktop_smoke=PASS');
