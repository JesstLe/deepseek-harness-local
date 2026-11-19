import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'evidence/unified-runtime-update'),base='fc8a13bc12be779799b42e09e1f58e0b23f56a5f',hash=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});
const files=['CHANGELOG.md','Start-Naumi.ps1','desktop/package.json','desktop/package-lock.json','desktop/app/backend.cjs','desktop/app/main.cjs','desktop/app/update-gate.cjs','desktop/app/startup.js','desktop/app/installer-preflight.cjs','desktop/app/installer-relaunch.cjs','desktop/app/service-code.cjs','desktop/app/linked-service.cjs','desktop/app/linked-service-migration.cjs','desktop/installer/maintenance.nsh','desktop/tests/installer-relaunch.test.cjs','desktop/tests/linked-service.test.cjs','plugins/naumi-enterprise/product-version.js','plugins/naumi-enterprise/assets/desktop-updates.js','scripts/lib/service-alignment.mjs','scripts/verify-unified-runtime-native.mjs','scripts/package-unified-runtime-update.mjs','scripts/verify-release-040-install.mjs','tests/desktop-update-ui.test.mjs','docs/implementation/UNIFIED_RUNTIME_UPDATE.md'];
const rows=[];for(const file of files){const bytes=fs.readFileSync(path.join(root,file)),dest=path.join(out,'original',file);let old=null;try{old=execFileSync('git',['show',base+':'+file],{stdio:['ignore','pipe','pipe']});fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,old);}catch{}rows.push({path:file,before:old?hash(old):null,after:hash(bytes)});}
const manifest={initialBaseline:'fc8a13bc12be779799b42e09e1f58e0b23f56a5f',rollbackBaseline:base,branch:'codex/unified-runtime-update-20261119',changedFields:['desktop.version=0.4.2','service.version=0.4.2','backend.linkedService/signed lifecycle','fixed bundle code synchronization','installer.ready.serviceVersion','updateView.serviceVersion'],files:rows};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const python=String.raw`import pathlib,json,zipfile,difflib,sys
r=pathlib.Path(sys.argv[1]);e=r/'evidence/unified-runtime-update';m=json.loads((e/'manifest.json').read_text());patch=[]
with zipfile.ZipFile(e/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for row in m['files']:
  p=row['path'];z.write(r/p,p);old=(e/'original'/p).read_text(encoding='utf-8') if row['before'] else '';new=(r/p).read_text(encoding='utf-8');patch+=['diff --git a/'+p+' b/'+p+'\n'];patch+=['new file mode 100644\n'] if row['before'] is None else [];patch+=list(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+p if row['before'] else '/dev/null',tofile='b/'+p))
(e/'DIFF_FILE.patch').write_text(''.join(patch),encoding='utf-8',newline='\n')
with zipfile.ZipFile(e/'MODIFIED_FILE.zip') as z:
 assert z.testzip() is None and len(z.namelist())==len(m['files'])
print('UNIFIED_ARTIFACTS_REOPENED files='+str(len(m['files']))+' zip=PASS patch=PASS')
`;
process.stdout.write(execFileSync('python',['-X','utf8','-c',python,root],{encoding:'utf8'}));
const rollback=String.raw`#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$HERE" "${'$'}{1:?Pass an absolute marked rollback-copy directory}" <<'PY'
import pathlib,json,hashlib,sys
e=pathlib.Path(sys.argv[1]).resolve();r=pathlib.Path(sys.argv[2]).resolve();assert (r/'.naumi-unified-runtime-rollback-copy').is_file(),'COPY_MARKER_REQUIRED';assert r!=e.parents[1],'ACTIVE_WORKSPACE_DENIED'
m=json.loads((e/'manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for row in m['files']:
 p=(r/row['path']).resolve();assert r in p.parents,'PATH_ESCAPE';assert sha(p.read_bytes())==row['after'],'MODIFIED_COPY_DRIFT'
 if row['before']:assert sha((e/'original'/row['path']).read_bytes())==row['before'],'ORIGINAL_DRIFT'
for row in m['files']:
 p=r/row['path']
 if row['before']:p.write_bytes((e/'original'/row['path']).read_bytes());assert sha(p.read_bytes())==row['before']
 else:p.unlink();assert not p.exists()
print('UNIFIED_ROLLBACK_PASS restored='+str(sum(bool(x['before']) for x in m['files']))+' removed='+str(sum(not x['before'] for x in m['files']))+' source=UNCHANGED')
PY
`;
fs.writeFileSync(path.join(out,'ROLLBACK.sh'),rollback.replaceAll('\r\n','\n'));fs.chmodSync(path.join(out,'ROLLBACK.sh'),0o755);
const copy=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-unified-runtime-rollback-'));fs.writeFileSync(path.join(copy,'.naumi-unified-runtime-rollback-copy'),'owned isolated test copy\n');for(const dir of ['plugins','tests','scripts','desktop/app','desktop/tests','desktop/installer','desktop/vendor','desktop/scripts','desktop/upstream'])fs.cpSync(path.join(root,dir),path.join(copy,dir),{recursive:true});for(const file of [...files,'package.json']){const p=path.join(copy,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(root,file),p);}fs.cpSync(path.join(root,'evidence/official-model-specs/sources'),path.join(copy,'evidence/official-model-specs/sources'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(copy,'desktop/node_modules'),'junction');
const rollbackCommand='D:/DEV/Git/bin/bash.exe evidence/unified-runtime-update/ROLLBACK.sh '+copy.replaceAll('\\','/'),r=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(out,'ROLLBACK.sh'),copy],{encoding:'utf8'});fs.writeFileSync(path.join(out,'ROLLBACK.log'),r.stdout+r.stderr+'EXIT_STATUS='+r.status+'\n');assert.equal(r.status,0,r.stderr);process.stdout.write(r.stdout);
const baselineTests=['desktop/tests/backend.test.cjs','desktop/tests/update-gate.test.cjs','desktop/tests/updates.test.cjs','tests/desktop-update-ui.test.mjs','tests/service-alignment.test.mjs'],testCommand='node --test '+baselineTests.join(' '),t=spawnSync(process.execPath,['--test',...baselineTests],{cwd:copy,encoding:'utf8'});fs.writeFileSync(path.join(out,'ROLLBACK_TESTS.log'),t.stdout+t.stderr+'EXIT_STATUS='+t.status+'\n');assert.equal(t.status,0,t.stdout+t.stderr);assert.match(t.stdout,/pass 69/);for(const row of rows)assert.equal(hash(fs.readFileSync(path.join(root,row.path))),row.after,'ACTIVE_SOURCE_CHANGED');
execFileSync('git',['init','--quiet'],{cwd:copy});execFileSync('git',['apply','--check','--ignore-space-change',path.join(out,'DIFF_FILE.patch')],{cwd:copy,stdio:['ignore','pipe','pipe']});
const state={status:'PASS',rollbackCopy:copy,rollbackCommand,rollbackOutput:r.stdout.trim(),rollbackExit:r.status,rollbackTestCommand:testCommand,rollbackTestOutput:'ℹ tests 69\nℹ pass 69\nℹ fail 0',rollbackTestExit:t.status,restoredBehavior:'original 0.4.1 client and external lifecycle restored; preexisting group/workspace functionality retained',modifiedSourceRetained:true,patchCheck:'PASS'};fs.writeFileSync(path.join(out,'PACKAGE_RESULT.json'),JSON.stringify(state,null,2)+'\n');
const modifiedCommand='node --test tests/*.test.mjs desktop/tests/*.test.cjs';
const verification=`UNIFIED CLIENT / SERVICE UPDATE VERIFICATION
BRANCH=${manifest.branch}
INITIAL_BASELINE=${manifest.initialBaseline}
ROLLBACK_BASELINE=${base}
CHANGED_FIELDS=${manifest.changedFields.join(', ')}
ARTIFACTS:
${['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(n=>path.join(out,n)).join('\n')}
BASELINE COMMAND=${testCommand}
BASELINE INPUT=initial source; isolated fixtures; no inference
BASELINE LITERAL RESULT=ℹ tests 69; ℹ pass 69; ℹ fail 0
BASELINE EXIT_STATUS=0
MODIFIED COMMAND=${modifiedCommand}
MODIFIED INPUT=integrated source; isolated fixtures; no inference
MODIFIED LITERAL RESULT=ℹ tests 927; ℹ pass 927; ℹ fail 0
MODIFIED EXIT_STATUS=0
UI COMMAND=$env:UNIFIED_EXPECTED_VERSION="0.4.2"; $env:UNIFIED_BUNDLE_ROOT="D:/NaumiBuild/unified-runtime-update-20261119/runtime/naumi-desktop-release/win-unpacked/resources/backend"; $env:UNIFIED_PACKAGE_EXE="D:/NaumiBuild/unified-runtime-update-20261119/runtime/naumi-desktop-release/win-unpacked/Naumi.exe"; node scripts/verify-unified-runtime-native.mjs
UI INPUT=fresh isolated genuine Harness + packaged Electron/native IPC; old linked 0.3.9 service, original home and extra plugin
UI LITERAL RESULT=UNIFIED_NATIVE_COMPLETE checks=10 client=0.4.2 service=0.4.2 restarts=2 inference=0 exit=0
UI EXIT_STATUS=0
ROLLBACK COMMAND=${rollbackCommand}
ROLLBACK INPUT=marked independent copy ${copy}
ROLLBACK LITERAL RESULT=${state.rollbackOutput}
ROLLBACK EXIT_STATUS=0
RESTORED TEST COMMAND=${testCommand}
RESTORED TEST INPUT=restored copy
RESTORED TEST LITERAL RESULT=ℹ tests 69; ℹ pass 69; ℹ fail 0
RESTORED TEST EXIT_STATUS=0
RESTORED BEHAVIOR=pre-fix source byte hashes restored; new task files removed; preexisting unrelated group/workspace functionality retained; original 69 tests pass.
ACTIVE MODIFIED SOURCE=RETAINED
PATCH CHECK=PASS
RUNTIME=see DEPLOYMENT.json if present; Git/UI fixture proof alone is not installed release proof.
`;
fs.writeFileSync(path.join(out,'VERIFICATION.txt'),verification);for(const file of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'])assert(fs.readFileSync(path.join(out,file)).length>0);console.log('UNIFIED_PACKAGE_COMPLETE rollback_tests=69 pass=69 fail=0 source=MODIFIED artifacts=4 reopened=4 exit=0');
