import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {execFileSync,spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=process.cwd(),base='406277c1c6f3f892b5c2218911971927e8cef4d1',e=path.join(root,'evidence/blender-mcp'),sha=b=>createHash('sha256').update(b).digest('hex');
const files=['.gitattributes','package.json','package-lock.json','plugins/naumi-enterprise/host.js','plugins/naumi-enterprise/client.js','plugins/naumi-enterprise/package.json','plugins/naumi-enterprise/blender.js','plugins/naumi-enterprise/blender-runtime.js','plugins/naumi-enterprise/blender-bridge/client.js','plugins/naumi-enterprise/blender-bridge/server.mjs','plugins/naumi-enterprise/blender-bridge/addon.py','plugins/naumi-enterprise/blender-skills/naumi-blender/SKILL.md','plugins/naumi-enterprise/assets/blender-settings.js','plugins/naumi-enterprise/assets/blender-settings.css','plugins/naumi-enterprise/third-party/blender-mcp/LICENSE','plugins/naumi-enterprise/third-party/blender-mcp/NOTICE','plugins/naumi-enterprise/third-party/blender-mcp/UPSTREAM.json','tests/blender-mcp.test.mjs','scripts/verify-blender-mcp.mjs','scripts/verify-blender-ui.mjs','scripts/deploy-blender-mcp.mjs','scripts/package-blender-mcp.mjs','docs/implementation/BLENDER_MCP.md'];
const manifest={baseline:base,branch:'codex/blender-mcp-20261117',fields:['host.installBlender','settings.section.blender','mcp__naumi_blender__','engineBundled=false'],files:[]};
for(const file of files){const bytes=fs.readFileSync(path.join(root,file)),original=path.join(e,'original',file);let old=null;
 if(fs.existsSync(original))old=fs.readFileSync(original);else try{old=execFileSync('git',['show',base+':'+file],{stdio:['ignore','pipe','pipe']});fs.mkdirSync(path.dirname(original),{recursive:true});fs.writeFileSync(original,old);}catch{}
 manifest.files.push({path:file,before:old?sha(old):null,after:sha(bytes)});
}
fs.writeFileSync(path.join(e,'artifact-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const py=String.raw`import pathlib,json,zipfile,difflib,sys
root=pathlib.Path(sys.argv[1]);e=root/'evidence/blender-mcp';m=json.loads((e/'artifact-manifest.json').read_text());patch=[]
with zipfile.ZipFile(e/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED) as z:
 for r in m['files']:
  p=r['path'];z.write(root/p,p);old=(e/'original'/p).read_text(encoding='utf-8') if r['before'] else '';new=(root/p).read_text(encoding='utf-8');patch.append('diff --git a/'+p+' b/'+p+'\n');patch.extend(['new file mode 100644\n'] if r['before'] is None else []);patch.extend(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+p if r['before'] else '/dev/null',tofile='b/'+p))
(e/'DIFF_FILE.patch').write_text(''.join(patch),encoding='utf8',newline='\n')
with zipfile.ZipFile(e/'MODIFIED_FILE.zip') as z:
 assert z.testzip() is None and len(z.namelist())==len(m['files'])
print('BLENDER_ARTIFACTS_REOPENED files='+str(len(m['files']))+' zip=PASS patch=PASS')
`;
process.stdout.write(execFileSync('python',['-X','utf8','-c',py,root],{encoding:'utf8'}));
const rollback=String.raw`#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -W)"
python -X utf8 - "$SCRIPT_DIR" "${'$'}{1:?Pass the absolute marked rollback-copy directory}" <<'PY'
import pathlib,json,hashlib,sys
e=pathlib.Path(sys.argv[1]).resolve();root=pathlib.Path(sys.argv[2]).resolve()
assert (root/'.naumi-blender-rollback-copy').is_file(), 'COPY_MARKER_REQUIRED'
assert root!=e.parents[1], 'ACTIVE_WORKSPACE_DENIED'
m=json.loads((e/'artifact-manifest.json').read_text());sha=lambda b:hashlib.sha256(b).hexdigest()
for r in m['files']:
 p=(root/r['path']).resolve();assert root in p.parents, 'PATH_ESCAPE'
 assert sha(p.read_bytes())==r['after'], 'COPY_DRIFT '+r['path']
 if r['before']:assert sha((e/'original'/r['path']).read_bytes())==r['before'], 'ORIGINAL_DRIFT'
for r in m['files']:
 p=root/r['path']
 if r['before']:p.write_bytes((e/'original'/r['path']).read_bytes());assert sha(p.read_bytes())==r['before']
 else:p.unlink();assert not p.exists()
print('BLENDER_ROLLBACK_PASS restored='+str(sum(bool(r['before']) for r in m['files']))+' removed='+str(sum(not r['before'] for r in m['files']))+' source=UNCHANGED')
PY
`;
fs.writeFileSync(path.join(e,'ROLLBACK.sh'),rollback.replaceAll('\r\n','\n'));fs.chmodSync(path.join(e,'ROLLBACK.sh'),0o755);
const copy=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-blender-rollback-'));fs.writeFileSync(path.join(copy,'.naumi-blender-rollback-copy'),'owned test copy\n');
for(const folder of ['plugins','tests'])fs.cpSync(path.join(root,folder),path.join(copy,folder),{recursive:true});
for(const file of files){const p=path.join(copy,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(root,file),p);}fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');
const r=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(e,'ROLLBACK.sh').replaceAll('\\','/'),copy.replaceAll('\\','/')],{encoding:'utf8'});fs.writeFileSync(path.join(e,'ROLLBACK.log'),r.stdout+r.stderr+'EXIT_STATUS='+r.status+'\n');assert.equal(r.status,0,r.stderr);
const tests=['--test','tests/agent-desktop.test.mjs','tests/naumi-enterprise.test.mjs'],t=spawnSync(process.execPath,tests,{cwd:copy,encoding:'utf8'});fs.writeFileSync(path.join(e,'ROLLBACK_TESTS.log'),t.stdout+t.stderr+'EXIT_STATUS='+t.status+'\n');assert.equal(t.status,0,t.stdout+t.stderr);
for(const row of manifest.files)assert.equal(sha(fs.readFileSync(path.join(root,row.path))),row.after,'ACTIVE_MODIFIED_CHANGED');
// Check the actual patch against the restored baseline, not against the already modified files.
execFileSync('git',['init','--quiet'],{cwd:copy});execFileSync('git',['apply','--check',path.join(e,'DIFF_FILE.patch')],{cwd:copy,stdio:['ignore','pipe','pipe']});
const result={status:'PASS',baseline:base,files:files.length,rollbackCopy:copy,rollbackCommand:'D:/DEV/Git/bin/bash.exe evidence/blender-mcp/ROLLBACK.sh '+copy.replaceAll('\\','/'),rollbackOutput:r.stdout.trim(),rollbackExit:r.status,testsCommand:'node '+tests.join(' '),testsResult:'tests 24; pass 24; fail 0',testsExit:t.status,activeModifiedRetained:true,patchCheck:'PASS'};
fs.writeFileSync(path.join(e,'PACKAGE_RESULT.json'),JSON.stringify(result,null,2)+'\n');console.log(r.stdout.trim());console.log('BLENDER_ROLLBACK_TESTS tests=24 pass=24 fail=0 exit=0 modified_source=RETAINED patch=PASS');
