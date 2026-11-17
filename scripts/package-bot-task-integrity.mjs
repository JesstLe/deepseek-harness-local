import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {sha} from './repair-bot-task-integrity.mjs';
const root=process.cwd(),e=path.join(root,'evidence/bot-task-integrity'),baseline='e17dc652dbc39ec2420cc092863b30fbbb35e3be';
const files=['plugins/naumi-enterprise/bot-task-service.js','plugins/naumi-enterprise/bot-tasks.js','scripts/verify-bot-task-continuity-live.mjs','scripts/repair-bot-task-integrity.mjs','scripts/verify-bot-task-integrity.mjs','scripts/deploy-bot-task-integrity.mjs','scripts/package-bot-task-integrity.mjs','scripts/verify-bot-task-integrity-loaded.mjs','tests/helpers/bot-tool-pipeline.mjs','tests/naumi-bot-task-integrity.test.mjs','docs/changes/2026-11-17-bot-task-integrity.md','docs/implementation/ASYNC_BOT_CONVERSATION.md','evidence/bot-task-continuity/ERRATUM-20261117.md'];
const rows=[];for(const file of files){let original;try{original=execFileSync('git',['show',baseline+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
  if(original){const p=path.join(e,'original',file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,original);}
  rows.push({path:file,originalSHA256:original?sha(original):null,modifiedSHA256:sha(fs.readFileSync(path.join(root,file)))});
}
// Unchanged imports needed to reopen the original service/tool snapshot.
for(const file of ['bot-task-store.js','bot-task-runtime.js','bot-deliverables.js']){const rel='plugins/naumi-enterprise/'+file;fs.writeFileSync(path.join(e,'original',rel),execFileSync('git',['show',baseline+':'+rel]));}
fs.writeFileSync(path.join(e,'original/package.json'),' {"type":"module"}\n');
fs.writeFileSync(path.join(e,'manifest.json'),JSON.stringify({baseline,files:rows},null,2)+'\n');
const existing=files.filter(f=>rows.find(r=>r.path===f).originalSHA256),diff=execFileSync('git',['diff',baseline,'--',...existing]);
let patch=diff.toString();for(const row of rows.filter(r=>!r.originalSHA256)){const s=fs.readFileSync(row.path,'utf8').replaceAll('\r\n','\n');const lines=s.replace(/\n$/,'').split('\n');patch+=`diff --git a/${row.path} b/${row.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${row.path}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';}
fs.writeFileSync(path.join(e,'DIFF_FILE.patch'),patch);
execFileSync('python',['-c',"import json,zipfile,pathlib,sys;r=pathlib.Path(sys.argv[1]);e=r/'evidence/bot-task-integrity';m=json.loads((e/'manifest.json').read_text());z=zipfile.ZipFile(e/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED);[(z.write(r/f['path'],f['path'])) for f in m['files']];z.close();z=zipfile.ZipFile(e/'MODIFIED_FILE.zip');assert z.testzip() is None;assert len(z.namelist())==len(m['files']);print('ARTIFACTS zip='+str(len(m['files']))+' reopened=PASS')",root],{stdio:'inherit'});
