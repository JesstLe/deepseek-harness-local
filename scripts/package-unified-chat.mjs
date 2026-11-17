import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';
const baseline='8314ecb5a4d0d5917d49bc80f0f21799150de813',e=path.resolve('evidence/unified-bot-chat'),backup=path.resolve(process.argv[2]),sha=b=>createHash('sha256').update(b).digest('hex');
const changed=execFileSync('git',['diff','--name-only',baseline,'--','.gitattributes','plugins','scripts','tests','desktop/tests','docs'],{encoding:'utf8'}).trim().split('\n').filter(Boolean);
const files=[...new Set([...changed,'plugins/naumi-enterprise/assets/bot-chat-model.js','plugins/naumi-enterprise/assets/bot-chat-markdown.js','scripts/deploy-unified-chat.mjs','scripts/verify-unified-chat.mjs','scripts/render-unified-chat.mjs','scripts/verify-unified-chat-ui.mjs','scripts/package-unified-chat.mjs','tests/naumi-unified-chat.test.mjs','docs/changes/2026-11-17-unified-bot-chat.md'])].sort();
const sourceFiles=[];for(const file of files){let original;try{original=execFileSync('git',['show',baseline+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
 if(original){const p=path.join(e,'source-original',file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,original);}
 sourceFiles.push({path:file,originalSHA256:original?sha(original):null,modifiedSHA256:sha(fs.readFileSync(file))});
}
const runtime=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8'));
for(const r of runtime.rows){if(r.beforeSHA256){const p=path.join(e,'runtime-original',r.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(backup,'before',r.file),p);}}
fs.writeFileSync(path.join(e,'manifest.json'),JSON.stringify({baseline,upstream:baseline,sourceFiles,runtimeFiles:runtime.rows},null,2)+'\n');
const existing=sourceFiles.filter(r=>r.originalSHA256).map(r=>r.path);let diff=execFileSync('git',['diff',baseline,'--',...existing],{encoding:'utf8'});
for(const r of sourceFiles.filter(r=>!r.originalSHA256)){const lines=fs.readFileSync(r.path,'utf8').replaceAll('\r\n','\n').replace(/\n$/,'').split('\n');diff+=`diff --git a/${r.path} b/${r.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${r.path}\n@@ -0,0 +1,${lines.length} @@\n`+lines.map(l=>'+'+l).join('\n')+'\n';}
fs.writeFileSync(path.join(e,'DIFF_FILE.patch'),diff);
execFileSync('python',['-c',"import zipfile,pathlib,json,sys;e=pathlib.Path(sys.argv[1]);b=pathlib.Path(sys.argv[2]);m=json.loads((e/'manifest.json').read_text());z=zipfile.ZipFile(e/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED);[(z.write(pathlib.Path(r['path']),'source/'+r['path'])) for r in m['sourceFiles']];[(z.write(b/'after'/r['file'],'runtime/'+r['file'])) for r in m['runtimeFiles']];z.close();z=zipfile.ZipFile(e/'MODIFIED_FILE.zip');assert z.testzip() is None;print('ARTIFACTS source='+str(len(m['sourceFiles']))+' runtime='+str(len(m['runtimeFiles']))+' ZIP_REOPEN=PASS')",e,backup],{stdio:'inherit'});
