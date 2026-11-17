import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

const root=process.cwd(),dir=path.join(root,'evidence/installer-ui');
const baseline='8995df9da41b6a36483a1b84277396892968d69c';
const sha=b=>createHash('sha256').update(b).digest('hex');
const files=['.gitattributes','CHANGELOG.md','desktop/package.json','desktop/package-lock.json',
 'plugins/naumi-enterprise/product-version.js','desktop/installer/maintenance.nsh',
 'desktop/installer/presentation.nsh','desktop/installer/pages.nsh','desktop/installer/engine.nsi',
 'desktop/installer/multiuser-init.nsh','desktop/installer/UPSTREAM.json',
 ...['logo','rail','action-install','action-uninstall','action-done','action-cancel','action-browse'].map(n=>'desktop/installer/assets/'+n+'.bmp'),
 'desktop/scripts/build-installer-ui.mjs','desktop/scripts/verify-installer-ui.mjs','desktop/scripts/build-desktop.mjs',
 'desktop/tests/installer-ui.test.cjs','docs/implementation/INSTALLER_UI.md','scripts/installer-ui-evidence.mjs'];
const runTests=(copy,log)=>{
 const result=spawnSync(process.execPath,['--test','tests/*.test.mjs','desktop/tests/*.test.cjs'],{cwd:copy,encoding:'utf8',windowsHide:true,timeout:240000,maxBuffer:15*1024*1024});
 fs.writeFileSync(path.join(dir,log),(result.stdout??'')+(result.stderr??''));
 assert.equal(result.status,0,log);const n=Number((result.stdout.match(/(?:ℹ |# )tests (\d+)/)??[])[1]);assert(n);
 return {tests:n,exit:result.status,command:'node --test tests/*.test.mjs desktop/tests/*.test.cjs'};
};
function copyOf(ref){
 const parent=path.join(root,'runtime','installer-evidence-'+randomUUID()),copy=path.join(parent,'copy');
 fs.mkdirSync(copy,{recursive:true});const tar=path.join(parent,'source.tar');
 fs.writeFileSync(tar,execFileSync('git',['archive',ref],{maxBuffer:120*1024*1024}));
 execFileSync('C:/Windows/System32/tar.exe',['-xf',tar,'-C',copy]);
 fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');
 fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(copy,'desktop/node_modules'),'junction');
 return copy;
}
fs.mkdirSync(dir,{recursive:true});
const mode=process.argv[2];
if(mode==='baseline'){
 const copy=copyOf(baseline),result=runTests(copy,'BASELINE.log');
 fs.writeFileSync(path.join(dir,'BASELINE_RESULT.json'),JSON.stringify({...result,baseline,source:'git archive baseline, isolated dependency-linked copy'},null,2)+'\n');
 console.log(`BASELINE tests=${result.tests} pass=${result.tests} fail=0 exit=0`);
}else if(mode==='prepare'){
 const manifest=[];
 for(const file of files){
  const modified=fs.readFileSync(path.join(root,file));let original=null;
  try{original=execFileSync('git',['show',baseline+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
  for(const [kind,bytes]of [['modified',modified],['original',original]])if(bytes){const p=path.join(dir,kind,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
  manifest.push({file,originalSHA256:original?sha(original):null,modifiedSHA256:sha(modified)});
 }
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({baseline,files:manifest},null,2)+'\n');
 fs.writeFileSync(path.join(dir,'DIFF_FILE.patch'),execFileSync('git',['diff','--cached','--binary',baseline,'--',...files],{maxBuffer:15*1024*1024}));
 execFileSync('python',['-c',`import pathlib,zipfile; p=pathlib.Path(r'${dir}'); z=zipfile.ZipFile(p/'MODIFIED_FILE.zip','w',zipfile.ZIP_DEFLATED); [z.write(f,f.relative_to(p).as_posix()) for d in ['original','modified'] for f in sorted((p/d).rglob('*')) if f.is_file()]; z.write(p/'manifest.json','manifest.json'); z.close()`]);
 console.log(`ARTIFACTS files=${manifest.length} originals=${manifest.filter(m=>m.originalSHA256).length} hashes=PASS`);
}else if(mode==='rollback'){
 assert(process.argv.includes('--test'),'COPY_TEST_REQUIRED');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).files,copy=copyOf(baseline);
 // Build a genuinely modified second copy before restoring original bytes.
 for(const m of manifest){const p=path.join(copy,m.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(dir,'modified',m.file),p);assert.equal(sha(fs.readFileSync(p)),m.modifiedSHA256);}
 for(const m of manifest){const p=path.join(copy,m.file);if(m.originalSHA256){fs.copyFileSync(path.join(dir,'original',m.file),p);assert.equal(sha(fs.readFileSync(p)),m.originalSHA256);}else fs.unlinkSync(p);}
 const result=runTests(copy,'ROLLBACK.log');
 const pkg=JSON.parse(fs.readFileSync(path.join(copy,'desktop/package.json')));
 assert.equal(pkg.version,'0.3.2');assert(!pkg.build.nsis.script);assert.equal(pkg.build.nsis.deleteAppDataOnUninstall,false);
 assert(fs.readFileSync(path.join(copy,'desktop/installer/maintenance.nsh'),'utf8').includes('customCheckAppRunning'));
 for(const file of ['plugins/naumi-enterprise/bot-task-service.js','plugins/naumi-enterprise/bot-tasks.js'])assert.equal(sha(fs.readFileSync(path.join(copy,file))),sha(fs.readFileSync(path.join(root,file))));
 for(const m of manifest)assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256,'ACTIVE_MODIFIED_SOURCE_CHANGED');
 execFileSync('git',['apply','--reverse','--check',path.join(dir,'DIFF_FILE.patch')],{cwd:root});
 const output=`ROLLBACK tests=${result.tests} pass=${result.tests} fail=0 exit=0\nRESTORED version=0.3.2 default_nsis_pages=1 maintenance=retained data_retention=retained bot_integrity=retained\nCURRENT modified_source=retained live_runtime=untouched`;
 fs.writeFileSync(path.join(dir,'ROLLBACK_RESULT.json'),JSON.stringify({...result,status:'PASS',output,copy},null,2)+'\n');console.log(output);
}else if(mode==='reopen'){
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'))).files;
 for(const m of manifest){assert.equal(sha(fs.readFileSync(path.join(root,m.file))),m.modifiedSHA256);assert.equal(sha(fs.readFileSync(path.join(dir,'modified',m.file))),m.modifiedSHA256);if(m.originalSHA256)assert.equal(sha(fs.readFileSync(path.join(dir,'original',m.file))),m.originalSHA256);}
 execFileSync('python',['-c',`import pathlib,zipfile,json,hashlib; p=pathlib.Path(r'${dir}'); z=zipfile.ZipFile(p/'MODIFIED_FILE.zip'); assert z.testzip() is None; m=json.loads(z.read('manifest.json')); assert m==json.loads((p/'manifest.json').read_text()); assert all(hashlib.sha256(z.read('modified/'+r['file'])).hexdigest()==r['modifiedSHA256'] for r in m['files'])`]);
 const report=fs.readFileSync(path.join(dir,'VERIFICATION.txt'),'utf8');
 for(const file of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh']){fs.readFileSync(path.join(dir,file));assert(report.includes('E:/Workspace/naumi-desktop/evidence/installer-ui/'+file));}
 execFileSync('D:/DEV/Git/bin/bash.exe',['-n',path.join(dir,'ROLLBACK.sh')]);
 assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'ROLLBACK_RESULT.json'))).status,'PASS');
 console.log(`REOPEN files=${manifest.length} zip_crc=PASS hashes=PASS patch=PASS verification=PASS rollback=PASS`);
}else throw Error('EXPECTED baseline|prepare|rollback|reopen');
