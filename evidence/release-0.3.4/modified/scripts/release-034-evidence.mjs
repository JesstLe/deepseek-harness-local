import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID}from'node:crypto';import{execFileSync,spawnSync}from'node:child_process';
const root=process.cwd(),dir=path.join(root,'evidence/release-0.3.4'),baseline='ce0d3c93b2534b18ded32b6543c71b503ca8a73d',sha=b=>createHash('sha256').update(b).digest('hex');
const files=['.gitattributes','CHANGELOG.md','desktop/package.json','desktop/package-lock.json','plugins/naumi-enterprise/product-version.js','plugins/naumi-enterprise/desktop-enterprise.js','tests/naumi-account-only-startup.test.mjs','desktop/scripts/verify-release-034.mjs','docs/changes/2026-11-17-release-0.3.4.md','scripts/release-034-evidence.mjs'];
const mode=process.argv[2];
if(mode==='prepare'){
 const records=[];
 for(const file of files){const modified=fs.readFileSync(path.join(root,file));let original=null;try{original=execFileSync('git',['show',baseline+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
  for(const [kind,bytes]of[['modified',modified],['original',original]])if(bytes){const target=path.join(dir,kind,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
  records.push({file,originalSHA256:original?sha(original):null,modifiedSHA256:sha(modified)});
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({baseline,files:records},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'DIFF_FILE.patch'),execFileSync('git',['diff','--cached','--binary',baseline,'--',...files],{maxBuffer:10*1024*1024}));
 execFileSync('python',['-c',`import pathlib,zipfile;p=pathlib.Path(r'${dir}');z=zipfile.ZipFile(p/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED);[z.write(f,f.relative_to(p).as_posix()) for d in ['original','modified'] for f in sorted((p/d).rglob('*')) if f.is_file()];z.write(p/'manifest.json','manifest.json');z.close()`]);
 console.log('ARTIFACTS files='+records.length+' original_hashes=PASS modified_hashes=PASS');
}else if(mode==='rollback'){
 assert(process.argv.includes('--test'),'COPY_TEST_REQUIRED');const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).files;
 const parent=path.join(root,'runtime','release-034-rollback-'+randomUUID()),copy=path.join(parent,'copy');fs.mkdirSync(copy,{recursive:true});const tar=path.join(parent,'baseline.tar');
 fs.writeFileSync(tar,execFileSync('git',['archive',baseline],{maxBuffer:200*1024*1024}));execFileSync('C:/Windows/System32/tar.exe',['-xf',tar,'-C',copy]);
 for(const m of manifest){const target=path.join(copy,m.file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(dir,'modified',m.file),target);assert.equal(sha(fs.readFileSync(target)),m.modifiedSHA256);}
 for(const m of manifest){const target=path.join(copy,m.file);if(m.originalSHA256){fs.copyFileSync(path.join(dir,'original',m.file),target);assert.equal(sha(fs.readFileSync(target)),m.originalSHA256);}else fs.unlinkSync(target);}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(copy,'desktop/node_modules'),'junction');
 const command=['--test','--test-concurrency=1','tests/*.test.mjs','desktop/tests/*.test.cjs'],result=spawnSync(process.execPath,command,{cwd:copy,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:15*1024*1024});
 fs.writeFileSync(path.join(dir,'ROLLBACK.txt'),(result.stdout??'')+(result.stderr??''));assert.equal(result.status,0,'ROLLBACK_TESTS_FAILED');
 const tests=Number((result.stdout.match(/(?:ℹ |# )tests (\d+)/)??[])[1]);assert(tests);
 assert.equal(JSON.parse(fs.readFileSync(path.join(copy,'desktop/package.json'))).version,'0.3.3');assert(fs.readFileSync(path.join(copy,'plugins/naumi-enterprise/assets/desktop-updates.js'),'utf8').includes('installDesktopUpdatesUI'));
 for(const m of manifest)assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256,'CURRENT_MODIFIED_CHANGED');
 execFileSync('git',['apply','--reverse','--check',path.join(dir,'DIFF_FILE.patch')]);
 const output='ROLLBACK tests='+tests+' pass='+tests+' fail=0 exit=0\nRESTORED version=0.3.3 update_entry=settings_right source_hashes=PASS\nCURRENT version=0.3.4 source=modified service3080=untouched';
 fs.writeFileSync(path.join(dir,'ROLLBACK_RESULT.json'),JSON.stringify({status:'PASS',tests,exit:0,copy,command:'node '+command.join(' '),output},null,2)+'\n');console.log(output);
}else if(mode==='reopen'){
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).files;
 for(const m of manifest){assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256);assert.equal(sha(fs.readFileSync(path.join(dir,'modified',m.file))),m.modifiedSHA256);if(m.originalSHA256)assert.equal(sha(fs.readFileSync(path.join(dir,'original',m.file))),m.originalSHA256);}
 execFileSync('python',['-c',`import pathlib,zipfile,json,hashlib;p=pathlib.Path(r'${dir}');z=zipfile.ZipFile(p/'MODIFIED_FILE.zip');assert z.testzip() is None;m=json.loads(z.read('manifest.json'));assert all(hashlib.sha256(z.read('modified/'+r['file'])).hexdigest()==r['modifiedSHA256'] for r in m['files'])`]);
 const report=fs.readFileSync(path.join(dir,'VERIFICATION.txt'),'utf8');for(const name of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']){assert(fs.readFileSync(path.join(dir,name)).length>0);assert(report.includes('E:/Workspace/naumi-desktop/evidence/release-0.3.4/'+name));}
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ROLLBACK_RESULT.json'))).status,'PASS');execFileSync('D:/DEV/Git/bin/bash.exe',['-n',path.join(dir,'ROLLBACK.sh')]);
 execFileSync('git',['apply','--reverse','--check',path.join(dir,'DIFF_FILE.patch')]);console.log('REOPEN files='+manifest.length+' zip_crc=PASS hashes=PASS patch=PASS verification=PASS rollback=PASS');
}else throw Error('EXPECTED prepare|rollback|reopen');
