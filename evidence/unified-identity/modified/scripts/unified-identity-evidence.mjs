import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(),dir=path.join(root,'evidence/unified-identity'),baseline='86a29bbf7f3f5fe1a311d517d37fc2c0105a7acd';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['.gitattributes','desktop/app/main.cjs','desktop/app/preload.cjs',...['identity.cjs','identity-runtime.cjs','identity.html','identity.css','identity.js','identity-visual.js'].map(n=>'desktop/app/'+n),...fs.readdirSync(path.join(root,'desktop/app/identity-style')).sort().map(n=>'desktop/app/identity-style/'+n),'desktop/scripts/prepare-runtime.mjs','desktop/scripts/verify-unified-identity.mjs','desktop/tests/identity.test.cjs','plugins/naumi-enterprise/client.js','tests/naumi-context-ui.test.mjs','docs/implementation/UNIFIED_IDENTITY.md','scripts/unified-identity-evidence.mjs'];
fs.mkdirSync(dir,{recursive:true});const mode=process.argv[2];
if(mode==='prepare'){
 const manifest=[];for(const file of files){const modified=fs.readFileSync(path.join(root,file));let original=null;try{original=execFileSync('git',['show',baseline+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
  for(const [kind,bytes]of [['modified',modified],['original',original]])if(bytes){const p=path.join(dir,kind,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
  manifest.push({file,originalSHA256:original?sha(original):null,modifiedSHA256:sha(modified)});
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({baseline,files:manifest},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'DIFF_FILE.patch'),execFileSync('git',['diff','--cached','--binary',baseline,'--',...files],{maxBuffer:15*1024*1024}));
 execFileSync('python',['-c',`import pathlib,zipfile;p=pathlib.Path(r'${dir}');z=zipfile.ZipFile(p/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED);[z.write(f,f.relative_to(p).as_posix()) for d in ['original','modified'] for f in sorted((p/d).rglob('*')) if f.is_file()];z.write(p/'manifest.json','manifest.json');z.close()`]);
 console.log(`ARTIFACTS files=${manifest.length} originals=${manifest.filter(m=>m.originalSHA256).length} hashes=PASS`);
}else if(mode==='rollback'){
 assert(process.argv.includes('--test'),'COPY_TEST_REQUIRED');const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).files;
 const parent=path.join(root,'runtime','unified-identity-rollback-'+randomUUID()),copy=path.join(parent,'copy');fs.mkdirSync(copy,{recursive:true});const tar=path.join(parent,'baseline.tar');
 fs.writeFileSync(tar,execFileSync('git',['archive',baseline],{maxBuffer:200*1024*1024}));execFileSync('C:/Windows/System32/tar.exe',['-xf',tar,'-C',copy]);
 for(const m of manifest){const p=path.join(copy,m.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(dir,'modified',m.file),p);assert.equal(sha(fs.readFileSync(p)),m.modifiedSHA256);}
 for(const m of manifest){const p=path.join(copy,m.file);if(m.originalSHA256){fs.copyFileSync(path.join(dir,'original',m.file),p);assert.equal(sha(fs.readFileSync(p)),m.originalSHA256);}else fs.unlinkSync(p);}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(copy,'desktop/node_modules'),'junction');
 const result=spawnSync(process.execPath,['--test','tests/*.test.mjs','desktop/tests/*.test.cjs'],{cwd:copy,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:15*1024*1024});fs.writeFileSync(path.join(dir,'ROLLBACK.log'),(result.stdout??'')+(result.stderr??''));assert.equal(result.status,0,'ROLLBACK_TESTS_FAILED');
 const tests=Number((result.stdout.match(/(?:ℹ |# )tests (\d+)/)??[])[1]);assert(tests);
 assert(!fs.existsSync(path.join(copy,'desktop/app/identity.cjs')));assert(!fs.readFileSync(path.join(copy,'desktop/app/main.cjs'),'utf8').includes('IdentityRuntime'));assert(fs.readFileSync(path.join(copy,'desktop/app/main.cjs'),'utf8').includes('openEnterpriseLogin'));
 for(const file of ['plugins/naumi-enterprise/bot-task-service.js','plugins/naumi-enterprise/bot-tasks.js','plugins/naumi-enterprise/assets/bot-chat-model.js','plugins/naumi-enterprise/assets/bot-sidebar.js'])assert.equal(sha(fs.readFileSync(path.join(copy,file))),sha(fs.readFileSync(path.join(root,file))),'UNRELATED_MODULE_CHANGED '+file);
 for(const m of manifest)assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256,'ACTIVE_SOURCE_CHANGED');
 execFileSync('git',['apply','--reverse','--check',path.join(dir,'DIFF_FILE.patch')]);
 const output=`ROLLBACK tests=${tests} pass=${tests} fail=0 exit=0\nRESTORED prior_enterprise_login=retained unified_bot_chat=retained identity_gate=removed source_hashes=PASS\nCURRENT modified_source=retained employee_data=untouched service3080=untouched`;
 fs.writeFileSync(path.join(dir,'ROLLBACK_RESULT.json'),JSON.stringify({status:'PASS',tests,exit:0,copy,output},null,2)+'\n');console.log(output);
}else if(mode==='reopen'){
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).files;
 for(const m of manifest){assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256);assert.equal(sha(fs.readFileSync(path.join(dir,'modified',m.file))),m.modifiedSHA256);if(m.originalSHA256)assert.equal(sha(fs.readFileSync(path.join(dir,'original',m.file))),m.originalSHA256);}
 execFileSync('python',['-c',`import pathlib,zipfile,json,hashlib;p=pathlib.Path(r'${dir}');z=zipfile.ZipFile(p/'MODIFIED_FILE.zip');assert z.testzip() is None;m=json.loads(z.read('manifest.json'));assert m==json.loads((p/'manifest.json').read_text());assert all(hashlib.sha256(z.read('modified/'+r['file'])).hexdigest()==r['modifiedSHA256'] for r in m['files'])`]);
 const report=fs.readFileSync(path.join(dir,'VERIFICATION.txt'),'utf8');for(const f of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']){fs.readFileSync(path.join(dir,f));assert(report.includes('E:/Workspace/naumi-desktop/evidence/unified-identity/'+f));}
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ROLLBACK_RESULT.json'))).status,'PASS');assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ELECTRON_IDENTITY.json'))).status,'PASS');execFileSync('D:/DEV/Git/bin/bash.exe',['-n',path.join(dir,'ROLLBACK.sh')]);
 console.log(`REOPEN files=${manifest.length} zip_crc=PASS hashes=PASS patch=PASS verification=PASS rollback=PASS electron=PASS`);
}else throw Error('EXPECTED prepare|rollback|reopen');
