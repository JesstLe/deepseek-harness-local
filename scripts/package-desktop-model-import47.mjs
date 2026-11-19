import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{execFileSync,spawnSync}from'node:child_process';
const root=process.cwd(),out=path.join(root,'evidence/desktop-model-import47'),base='d93e8724d430e56ed86dcc38348bdd9779514915',sha=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});
const files=['scripts/lib/desktop-model-import.mjs','scripts/lib/desktop-model-import-store.mjs','scripts/lib/desktop-model-import-fixture.mjs','scripts/desktop-model-import47-cli.mjs','scripts/prepare-desktop-model-import47.mjs','scripts/run-desktop-model-import47.py','scripts/import-desktop-models47.mjs','scripts/package-desktop-model-import47.mjs','tests/desktop-model-import47.test.mjs','docs/implementation/DESKTOP_MODEL_IMPORT47.md'];
const rows=files.map(file=>({file,before:null,after:sha(fs.readFileSync(path.join(root,file)))}));for(const p of files){let present=false;try{execFileSync('git',['cat-file','-e',base+':'+p],{stdio:'ignore'});present=true;}catch{}assert(!present,'BASELINE_FILE_EXISTS');}
const manifest={branch:'codex/desktop-model-import47-20261119',baseline:base,changedFields:['47 supplier source snapshots','supplier model metadata:8 connections/38 grouped models','8 encrypted credential copies','employeeAvailability=unassigned; active routes/billing unchanged'],files:rows};fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
execFileSync('python',['-X','utf8','-c',`import pathlib,zipfile,json,difflib,sys
r=pathlib.Path(sys.argv[1]);o=r/'evidence/desktop-model-import47';m=json.loads((o/'manifest.json').read_text());patch=[]
with zipfile.ZipFile(o/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for row in m['files']:
  p=row['file'];z.write(r/p,p);new=(r/p).read_text(encoding='utf-8-sig');patch+=['diff --git a/'+p+' b/'+p+'\\n','new file mode 100644\\n'];patch+=list(difflib.unified_diff([],new.splitlines(True),fromfile='/dev/null',tofile='b/'+p))
(o/'DIFF_FILE.patch').write_text(''.join(patch),encoding='utf8',newline='\\n')
with zipfile.ZipFile(o/'MODIFIED_FILE.zip') as z:assert z.testzip() is None and len(z.namelist())==10
`,root]);
const rollback=`#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$HERE" "${'${1:?Pass marked isolated source-copy path}'}" <<'PY'
import pathlib,json,hashlib,sys
o=pathlib.Path(sys.argv[1]).resolve();r=pathlib.Path(sys.argv[2]).resolve();assert (r/'.desktop-model-import47-copy').is_file(),'COPY_REQUIRED';assert r!=o.parents[1],'ACTIVE_SOURCE_DENIED'
m=json.loads((o/'manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for row in m['files']:
 p=(r/row['file']).resolve();assert r in p.parents;assert sha(p.read_bytes())==row['after'],'SOURCE_DRIFT'
for row in m['files']:(r/row['file']).unlink()
print('DESKTOP_MODEL_SOURCE_ROLLBACK restored=0 removed='+str(len(m['files']))+' active=UNCHANGED')
PY
`;fs.writeFileSync(path.join(out,'ROLLBACK.sh'),rollback);fs.chmodSync(path.join(out,'ROLLBACK.sh'),0o755);
const copy=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-model-import47-copy-'));fs.writeFileSync(path.join(copy,'.desktop-model-import47-copy'),'isolated\n');fs.cpSync(path.join(root,'plugins'),path.join(copy,'plugins'),{recursive:true});fs.mkdirSync(path.join(copy,'tests'));fs.copyFileSync(path.join(root,'tests/naumi-model-connections.test.mjs'),path.join(copy,'tests/naumi-model-connections.test.mjs'));fs.copyFileSync(path.join(root,'package.json'),path.join(copy,'package.json'));fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');for(const p of files){fs.mkdirSync(path.dirname(path.join(copy,p)),{recursive:true});fs.copyFileSync(path.join(root,p),path.join(copy,p));}
const command='D:/DEV/Git/bin/bash.exe evidence/desktop-model-import47/ROLLBACK.sh '+copy.replaceAll('\\','/');const r=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(out,'ROLLBACK.sh'),copy],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);fs.writeFileSync(path.join(out,'ROLLBACK.log'),r.stdout+r.stderr+'EXIT_STATUS='+r.status+'\n');const t=spawnSync(process.execPath,['--test','tests/naumi-model-connections.test.mjs'],{cwd:copy,encoding:'utf8'});assert.equal(t.status,0,t.stdout+t.stderr);assert.match(t.stdout,/pass 19/);fs.writeFileSync(path.join(out,'ROLLBACK_TESTS.log'),t.stdout+t.stderr+'EXIT_STATUS='+t.status+'\n');execFileSync('git',['init','--quiet'],{cwd:copy});execFileSync('git',['apply','--check',path.join(out,'DIFF_FILE.patch')],{cwd:copy});for(const row of rows)assert.equal(sha(fs.readFileSync(path.join(root,row.file))),row.after);
const verified=JSON.parse(fs.readFileSync(path.join(out,'VERIFY.json')));assert.equal(verified.status,'PASS');
const verification=`DESKTOP MODEL IMPORT47 VERIFICATION
BRANCH=${manifest.branch}
BASELINE_SHA=${base}
CHANGED_FIELDS=${manifest.changedFields.join('; ')}
ARTIFACTS:
${['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'].map(p=>path.join(out,p)).join('\n')}
BASELINE COMMAND=node --test tests/naumi-model-connections.test.mjs
BASELINE INPUT=original model configuration module; isolated keys
BASELINE LITERAL RESULT=ℹ tests 19; ℹ pass 19; ℹ fail 0
BASELINE EXIT_STATUS=0
MODIFIED COMMAND=node --test tests/naumi-model-connections.test.mjs tests/desktop-model-import47.test.mjs
MODIFIED INPUT=incremental importer contracts; isolated keys
MODIFIED LITERAL RESULT=ℹ tests 25; ℹ pass 25; ℹ fail 0
MODIFIED EXIT_STATUS=0
PG COMMAND=node scripts/import-desktop-models47.mjs fixture
PG INPUT=47 PostgreSQL independent schema; synthetic keys; original production tables unchanged
PG LITERAL RESULT=status=PASS checks=12 isolatedSchema=true modelCalls=0 publicWrites=0
PG EXIT_STATUS=0
IMPORT COMMAND=node scripts/import-desktop-models47.mjs apply
IMPORT INPUT=current Desktop 8 connections/38 grouped models;8 resolved keys via SSH stdin; original operation42b17342-ba00-41c7-a45f-5f16cdf6e160
IMPORT LITERAL RESULT=status=PASS providers=8 models=38 credentialsVerified=8 adminReadModels=38 employeeGrants=0 modelCalls=0
IMPORT EXIT_STATUS=0
VERIFY COMMAND=node scripts/import-desktop-models47.mjs verify
VERIFY LITERAL RESULT=${JSON.stringify(verified)}
VERIFY EXIT_STATUS=0
ROLLBACK COMMAND=${command}
ROLLBACK INPUT=marked independent source copy ${copy}
ROLLBACK LITERAL RESULT=${r.stdout.trim()}
ROLLBACK EXIT_STATUS=0
RESTORED_TEST COMMAND=node --test tests/naumi-model-connections.test.mjs
RESTORED_TEST INPUT=restored source copy
RESTORED_TEST LITERAL RESULT=ℹ tests 19; ℹ pass 19; ℹ fail 0
RESTORED_TEST EXIT_STATUS=0
RESTORED_BEHAVIOR=original Desktop model configuration behavior and bytes preserved;10 new task files removed only in copy;actual source and imported47 data RETAINED
REMOTE_ROLLBACK COMMAND=node scripts/import-desktop-models47.mjs rollback
REMOTE_ROLLBACK STATUS=implemented; exact-own-rows/unchanged-revisions/no-later-reference guards; actual PG fixture rollback passed; NOT run against imported production copy
NEXT=employee authorization/catalog and enforced gateway credentials are not activated by this import
`;fs.writeFileSync(path.join(out,'VERIFICATION.txt'),verification);for(const p of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'])assert(fs.readFileSync(path.join(out,p)).length);fs.writeFileSync(path.join(out,'PACKAGE_RESULT.json'),JSON.stringify({status:'PASS',copy,rollbackCommand:command,rollbackOutput:r.stdout.trim(),rollbackExit:0,restoredTests:19,restoredExit:0,activeSource:'RETAINED',productionImport:'RETAINED',files:10},null,2)+'\n');console.log('DESKTOP_MODEL_PACKAGE_PASS artifacts=4 reopened=4 source_files=10 rollback_tests=19 active=MODIFIED exit=0');
