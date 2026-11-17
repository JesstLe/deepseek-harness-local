import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash,randomUUID} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(),e=path.join(root,'evidence/custom-model-auth'),baseline='c1fe9f0955f5d2344cbf3f7c6a2d2523fd2fa3b3',sha=b=>createHash('sha256').update(b).digest('hex');
const files=['.gitattributes','plugins/naumi-enterprise/host.js','plugins/naumi-enterprise/client.js','plugins/naumi-enterprise/package.json','plugins/naumi-enterprise/cordis.patch.yml','plugins/naumi-enterprise/model-connections.js','plugins/naumi-enterprise/assets/model-connections.js','plugins/naumi-enterprise/assets/model-connections.css','tests/naumi-model-connections.test.mjs','scripts/verify-custom-model-auth.mjs','scripts/custom-model-auth-evidence.mjs','scripts/deploy-custom-model-auth.mjs','docs/implementation/CUSTOM_MODEL_CONNECTIONS.md'];
const mode=process.argv[2];
if(mode==='prepare'){
 fs.mkdirSync(e,{recursive:true});const manifest=[];
 for(const file of files){const bytes=fs.readFileSync(path.join(root,file)),modified=path.join(e,'modified',file);fs.mkdirSync(path.dirname(modified),{recursive:true});fs.writeFileSync(modified,bytes);let old=null;
  try{old=execFileSync('git',['show',baseline+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
  if(old){const target=path.join(e,'original',file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,old);}
  manifest.push({file,originalSHA256:old?sha(old):null,modifiedSHA256:sha(bytes)});
 }
 fs.writeFileSync(e+'/hashes.json',JSON.stringify(manifest,null,2)+'\n');
 // The index contains this task's explicit paths only; no credentials/configuration directories.
 fs.writeFileSync(e+'/DIFF_FILE.patch',execFileSync('git',['diff','--cached','--binary',baseline,'--',...files]));
 execFileSync('python',['-c',`import pathlib,zipfile; p=pathlib.Path(r'${e}'); z=zipfile.ZipFile(p/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED); [z.write(f,f.relative_to(p).as_posix()) for d in ['original','modified'] for f in sorted((p/d).rglob('*')) if f.is_file()]; z.write(p/'hashes.json','hashes.json'); z.close()`]);
 console.log('ARTIFACTS originals='+manifest.filter(x=>x.originalSHA256).length+' modified='+manifest.length+' hashes=PASS');
}else if(mode==='rollback'){
 assert(process.argv.includes('--test'),'COPY_TEST_REQUIRED');const manifest=JSON.parse(fs.readFileSync(e+'/hashes.json')),temp=path.join(root,'runtime','custom-model-rollback-'+randomUUID());fs.mkdirSync(temp,{recursive:true});const archive=path.join(temp,'baseline.tar'),copy=path.join(temp,'copy');fs.mkdirSync(copy);fs.writeFileSync(archive,execFileSync('git',['archive','HEAD'],{maxBuffer:100*1024*1024}));execFileSync(process.platform==='win32'?'C:/Windows/System32/tar.exe':'tar',['-xf',archive,'-C',copy]);
 for(const m of manifest){const p=path.join(copy,m.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(e,'modified',m.file),p);assert.equal(sha(fs.readFileSync(p)),m.modifiedSHA256);}
 // Apply the rollback to a real modified source copy, never the active checkout/runtime.
 for(const m of manifest){const p=path.join(copy,m.file);if(m.originalSHA256){fs.copyFileSync(path.join(e,'original',m.file),p);assert.equal(sha(fs.readFileSync(p)),m.originalSHA256);}else fs.unlinkSync(p);}
 fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(copy,'desktop/node_modules'),'junction');
 const tests=spawnSync(process.execPath,['--test','tests/*.test.mjs','desktop/tests/*.test.cjs'],{cwd:copy,encoding:'utf8',windowsHide:true,timeout:180000,maxBuffer:10*1024*1024});fs.writeFileSync(e+'/ROLLBACK_TESTS.log',(tests.stdout??'')+(tests.stderr??''));assert.equal(tests.status,0,'ROLLBACK_TESTS_FAILED');const count=(tests.stdout.match(/(?:ℹ |# )tests (\d+)/)??[])[1];assert(count);
 const before=fs.readFileSync(path.join(copy,'plugins/naumi-enterprise/cordis.patch.yml'),'utf8');assert(!before.includes('- id: deepseek-account'));assert(!fs.existsSync(path.join(copy,'plugins/naumi-enterprise/model-connections.js')));assert.equal(sha(fs.readFileSync(path.join(copy,'plugins/naumi-enterprise/bot-deliverables.js'))),sha(fs.readFileSync(path.join(root,'plugins/naumi-enterprise/bot-deliverables.js'))));
 for(const m of manifest)assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256,'ACTIVE_SOURCE_CHANGED');
 const output=`ROLLBACK_COPY restored=${manifest.filter(x=>x.originalSHA256).length} removed=${manifest.filter(x=>!x.originalSHA256).length} tests=${count} hashes=PASS\nROLLBACK_BEHAVIOR official_composition=restored custom_settings=absent file_deliverables=retained\nROLLBACK modified_source=retained live_data=untouched`;
 fs.writeFileSync(e+'/ROLLBACK_RESULT.json',JSON.stringify({status:'PASS',tests:Number(count),exit:0,output},null,2)+'\n');console.log(output);
}else if(mode==='reopen'){
 const manifest=JSON.parse(fs.readFileSync(e+'/hashes.json'));
 for(const m of manifest){assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256);assert.equal(sha(fs.readFileSync(path.join(e,'modified',m.file))),m.modifiedSHA256);if(m.originalSHA256)assert.equal(sha(fs.readFileSync(path.join(e,'original',m.file))),m.originalSHA256);}
 execFileSync('python',['-c',`import pathlib,zipfile,json,hashlib; p=pathlib.Path(r'${e}'); z=zipfile.ZipFile(p/'MODIFIED_FILE.zip'); m=json.loads(z.read('hashes.json')); assert m==json.loads((p/'hashes.json').read_text()); [(lambda b,h: (_ for _ in ()).throw(AssertionError()) if hashlib.sha256(b).hexdigest()!=h else None)(z.read('modified/'+r['file']),r['modifiedSHA256']) for r in m]; assert z.testzip() is None`]);
 const verification=fs.readFileSync(e+'/VERIFICATION.txt','utf8');for(const name of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']){fs.readFileSync(e+'/'+name);assert(verification.includes('E:\\Workspace\\naumi-desktop\\evidence\\custom-model-auth\\'+name));}
 assert(fs.readFileSync(e+'/DIFF_FILE.patch','utf8').includes('model-connections.js'));execFileSync('D:/DEV/Git/bin/bash.exe',['-n',e+'/ROLLBACK.sh']);assert.equal(JSON.parse(fs.readFileSync(e+'/ROLLBACK_RESULT.json')).status,'PASS');
 console.log('REOPEN files='+manifest.length+' zip=PASS hashes=PASS patch=PASS verification=PASS rollback=PASS');
}else throw Error('EXPECTED prepare|rollback|reopen');
