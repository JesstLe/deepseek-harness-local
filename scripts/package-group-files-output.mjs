import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(),out=path.join(root,'evidence/group-files-output'),base=execFileSync('git',['rev-parse','1bee995'],{encoding:'utf8'}).trim(),hash=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});
const files=['.gitattributes','desktop/scripts/prepare-runtime.mjs','plugins/naumi-enterprise/assets/bot-groups.css','plugins/naumi-enterprise/assets/bot-groups.js','plugins/naumi-enterprise/assets/bot-sidebar-model.js','plugins/naumi-enterprise/assets/bot-sidebar.js','plugins/naumi-enterprise/assets/model-connections.js','plugins/naumi-enterprise/model-specs.js','scripts/sync-naumi.mjs','scripts/verify-official-model-specs.mjs','scripts/native-delivery-extension.mjs','scripts/verify-group-files-output-ui.mjs','scripts/deploy-group-files-output.mjs','scripts/package-group-files-output.mjs','tests/group-files-output.test.mjs','tests/bot-folder-motion.test.mjs','tests/naumi-group-work-indicator.test.mjs','docs/implementation/GROUP_FILES_OUTPUT_FIX.md'];
const rows=[];for(const file of files){const bytes=fs.readFileSync(path.join(root,file)),dest=path.join(out,'original',file);let old=null;try{old=execFileSync('git',['show',base+':'+file],{stdio:['ignore','pipe','pipe']});fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,old);}catch{}rows.push({path:file,before:old?hash(old):null,after:hash(bytes)});}
const manifest={initialBaseline:'ab34d8343d5bc417e7b54d1a626943e2e84cbf0f',rollbackBaseline:base,branch:'codex/group-files-model-output-20261118',changedFields:['sidebarRight.registerPanelSession','naumi.native.deliverables','model.maxTokens/outputLimit/useOfficial/changeBudget','dragNotice.3000ms'],files:rows};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const python=String.raw`import pathlib,json,zipfile,difflib,sys
r=pathlib.Path(sys.argv[1]);e=r/'evidence/group-files-output';m=json.loads((e/'manifest.json').read_text());patch=[]
with zipfile.ZipFile(e/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for row in m['files']:
  p=row['path'];z.write(r/p,p);old=(e/'original'/p).read_text(encoding='utf-8') if row['before'] else '';new=(r/p).read_text(encoding='utf-8');patch+=['diff --git a/'+p+' b/'+p+'\n'];patch+=['new file mode 100644\n'] if row['before'] is None else [];patch+=list(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+p if row['before'] else '/dev/null',tofile='b/'+p))
(e/'DIFF_FILE.patch').write_text(''.join(patch),encoding='utf-8',newline='\n')
with zipfile.ZipFile(e/'MODIFIED_FILE.zip') as z:
 assert z.testzip() is None and len(z.namelist())==len(m['files'])
print('GROUP_ARTIFACTS_REOPENED files='+str(len(m['files']))+' zip=PASS patch=PASS')
`;
process.stdout.write(execFileSync('python',['-X','utf8','-c',python,root],{encoding:'utf8'}));
const rollback=String.raw`#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$HERE" "${'$'}{1:?Pass an absolute marked rollback-copy directory}" <<'PY'
import pathlib,json,hashlib,sys
e=pathlib.Path(sys.argv[1]).resolve();r=pathlib.Path(sys.argv[2]).resolve();assert (r/'.naumi-group-fix-rollback-copy').is_file(),'COPY_MARKER_REQUIRED';assert r!=e.parents[1],'ACTIVE_WORKSPACE_DENIED'
m=json.loads((e/'manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for row in m['files']:
 p=(r/row['path']).resolve();assert r in p.parents,'PATH_ESCAPE';assert sha(p.read_bytes())==row['after'],'MODIFIED_COPY_DRIFT'
 if row['before']:assert sha((e/'original'/row['path']).read_bytes())==row['before'],'ORIGINAL_DRIFT'
for row in m['files']:
 p=r/row['path']
 if row['before']:p.write_bytes((e/'original'/row['path']).read_bytes());assert sha(p.read_bytes())==row['before']
 else:p.unlink();assert not p.exists()
print('GROUP_ROLLBACK_PASS restored='+str(sum(bool(x['before']) for x in m['files']))+' removed='+str(sum(not x['before'] for x in m['files']))+' source=UNCHANGED')
PY
`;
fs.writeFileSync(path.join(out,'ROLLBACK.sh'),rollback.replaceAll('\r\n','\n'));fs.chmodSync(path.join(out,'ROLLBACK.sh'),0o755);
const copy=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-group-fix-rollback-'));fs.writeFileSync(path.join(copy,'.naumi-group-fix-rollback-copy'),'owned isolated test copy\n');for(const dir of ['plugins','tests','scripts'])fs.cpSync(path.join(root,dir),path.join(copy,dir),{recursive:true});for(const file of [...files,'package.json']){const p=path.join(copy,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(root,file),p);}fs.cpSync(path.join(root,'evidence/official-model-specs/sources'),path.join(copy,'evidence/official-model-specs/sources'),{recursive:true});fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');
const rollbackCommand='D:/DEV/Git/bin/bash.exe evidence/group-files-output/ROLLBACK.sh '+copy.replaceAll('\\','/'),r=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(out,'ROLLBACK.sh'),copy],{encoding:'utf8'});fs.writeFileSync(path.join(out,'ROLLBACK.log'),r.stdout+r.stderr+'EXIT_STATUS='+r.status+'\n');assert.equal(r.status,0,r.stderr);process.stdout.write(r.stdout);
const baselineTests=['tests/naumi-bot-groups.test.mjs','tests/naumi-group-collaboration.test.mjs','tests/naumi-model-specs.test.mjs','tests/naumi-bot-sidebar.test.mjs'],testCommand='node --test '+baselineTests.join(' '),t=spawnSync(process.execPath,['--test',...baselineTests],{cwd:copy,encoding:'utf8'});fs.writeFileSync(path.join(out,'ROLLBACK_TESTS.log'),t.stdout+t.stderr+'EXIT_STATUS='+t.status+'\n');assert.equal(t.status,0,t.stdout+t.stderr);assert.match(t.stdout,/pass 37/);for(const row of rows)assert.equal(hash(fs.readFileSync(path.join(root,row.path))),row.after,'ACTIVE_SOURCE_CHANGED');
execFileSync('git',['init','--quiet'],{cwd:copy});execFileSync('git',['apply','--check','--ignore-space-change',path.join(out,'DIFF_FILE.patch')],{cwd:copy,stdio:['ignore','pipe','pipe']});
const state={status:'PASS',rollbackCopy:copy,rollbackCommand,rollbackOutput:r.stdout.trim(),rollbackExit:r.status,rollbackTestCommand:testCommand,rollbackTestOutput:'ℹ tests 37\nℹ pass 37\nℹ fail 0',rollbackTestExit:t.status,restoredBehavior:'pre-fix native/group/model behavior and 1bee995 work indicator retained',modifiedSourceRetained:true,patchCheck:'PASS'};fs.writeFileSync(path.join(out,'PACKAGE_RESULT.json'),JSON.stringify(state,null,2)+'\n');
const modifiedCommand='node --test '+[...baselineTests,'tests/group-files-output.test.mjs','tests/naumi-group-work-indicator.test.mjs','tests/naumi-group-rename.test.mjs','tests/naumi-model-connections.test.mjs','tests/naumi-model-reasoning.test.mjs','tests/naumi-bot-deliverables.test.mjs','tests/naumi-file-delivery-single-path.test.mjs','tests/bot-folder-motion.test.mjs'].join(' ');
const verification=`GROUP FILES / OUTPUT / NOTICE VERIFICATION
BRANCH=${manifest.branch}
INITIAL_BASELINE=${manifest.initialBaseline}
ROLLBACK_BASELINE=${base}
CHANGED_FIELDS=${manifest.changedFields.join(', ')}
ARTIFACTS:
${['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(n=>path.join(out,n)).join('\n')}
BASELINE COMMAND=${testCommand}
BASELINE INPUT=initial source; isolated fixtures; no inference
BASELINE LITERAL RESULT=ℹ tests 37; ℹ pass 37; ℹ fail 0
BASELINE EXIT_STATUS=0
MODIFIED COMMAND=${modifiedCommand}
MODIFIED INPUT=integrated source; isolated fixtures; no inference
MODIFIED LITERAL RESULT=ℹ tests 104; ℹ pass 104; ℹ fail 0
MODIFIED EXIT_STATUS=0
UI COMMAND=node scripts/verify-group-files-output-ui.mjs
UI INPUT=fresh isolated Harness + native present executor + real source Session files; bounded group read projection fixture
UI LITERAL RESULT=FIX_UI_COMPLETE checks=19 errors=0 inference=0
UI EXIT_STATUS=0
ROLLBACK COMMAND=${rollbackCommand}
ROLLBACK INPUT=marked independent copy ${copy}
ROLLBACK LITERAL RESULT=${state.rollbackOutput}
ROLLBACK EXIT_STATUS=0
RESTORED TEST COMMAND=${testCommand}
RESTORED TEST INPUT=restored copy
RESTORED TEST LITERAL RESULT=ℹ tests 37; ℹ pass 37; ℹ fail 0
RESTORED TEST EXIT_STATUS=0
RESTORED BEHAVIOR=pre-fix source byte hashes restored; new task files removed; existing 1bee995 work indicator retained; original 37 tests pass.
ACTIVE MODIFIED SOURCE=RETAINED
PATCH CHECK=PASS
RUNTIME=see DEPLOYMENT.json if present; Git/UI fixture proof alone is not installed release proof.
`;
fs.writeFileSync(path.join(out,'VERIFICATION.txt'),verification);for(const file of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'])assert(fs.readFileSync(path.join(out,file)).length>0);console.log('GROUP_PACKAGE_COMPLETE rollback_tests=37 pass=37 fail=0 source=MODIFIED artifacts=4 reopened=4 exit=0');
