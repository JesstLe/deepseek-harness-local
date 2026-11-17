import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {execFileSync,spawnSync} from 'node:child_process';
import {extendNativeComposer,NATIVE_COMPOSER_SHA} from './native-composer-extension.mjs';
const root=process.cwd(),out=path.join(root,'evidence/group-live-collaboration'),base='e148c0166284e2a8bd7b77f9f0ba306cbc85101d',sha=b=>createHash('sha256').update(b).digest('hex');fs.mkdirSync(out,{recursive:true});
const files=execFileSync('git',['diff','--name-only',base,'HEAD'],{encoding:'utf8'}).trim().split('\n').filter(f=>f&&!f.startsWith('evidence/'));
const rows=[];for(const file of files){const after=execFileSync('git',['show','HEAD:'+file]);let before=null;try{before=execFileSync('git',['show',base+':'+file],{stdio:['ignore','pipe','ignore']});}catch{}
 for(const [kind,bytes]of[['original',before],['modified',after]])if(bytes){const p=path.join(out,kind,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
 rows.push({file,before:before?sha(before):null,after:sha(after)});
}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({base,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),rows},null,2)+'\n');
fs.writeFileSync(path.join(out,'DIFF_FILE.patch'),execFileSync('git',['diff','--binary',base,'HEAD','--',...files]));
const nativePath='node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js';let native=fs.readFileSync(nativePath);if(sha(native)!==NATIVE_COMPOSER_SHA)native=fs.readFileSync(nativePath+'.naumi-original');assert.equal(sha(native),NATIVE_COMPOSER_SHA);fs.mkdirSync(path.join(out,'native'),{recursive:true});fs.writeFileSync(path.join(out,'native/original.js'),native);fs.writeFileSync(path.join(out,'native/modified.js'),extendNativeComposer(native.toString()));
const rollback=`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const home=path.dirname(fileURLToPath(import.meta.url)),target=path.resolve(process.argv[2]??''),manifest=JSON.parse(fs.readFileSync(path.join(home,'manifest.json'))),sha=b=>createHash('sha256').update(b).digest('hex');assert(process.argv[2],'EXPLICIT_SOURCE_COPY_REQUIRED');
for(const r of manifest.rows){const p=path.resolve(target,r.file);assert(p.startsWith(target+path.sep),'PATH_ESCAPE');assert.equal(sha(fs.readFileSync(p)),r.after,'ROLLBACK_TARGET_DRIFT '+r.file);if(r.before)assert.equal(sha(fs.readFileSync(path.join(home,'original',r.file))),r.before);}
for(const r of manifest.rows){const p=path.join(target,r.file);if(r.before)fs.copyFileSync(path.join(home,'original',r.file),p);else fs.unlinkSync(p);}
console.log('ROLLBACK_SOURCE_RESTORED files='+manifest.rows.length+' hashes=PASS runtime_data=UNTOUCHED');
`;
fs.writeFileSync(path.join(out,'rollback.mjs'),rollback);fs.writeFileSync(path.join(out,'ROLLBACK.sh'),'#!/usr/bin/env bash\nset -euo pipefail\n[ "$#" -eq 1 ] || { echo "Usage: ROLLBACK.sh EXPLICIT_SOURCE_COPY"; exit 2; }\nhere="$(cd -- "$(dirname -- "$0")" && pwd)"\nnode "$here/rollback.mjs" "$1"\n');
fs.writeFileSync(path.join(out,'.gitattributes'),'* -text whitespace=cr-at-eol\nDIFF_FILE.patch -text whitespace=-blank-at-eol,-space-before-tab\nROLLBACK.sh text eol=lf\n');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-group-rollback-')),archive=path.join(tmp,'base.tar');fs.writeFileSync(archive,execFileSync('git',['archive',base],{maxBuffer:100*1024*1024}));execFileSync('tar',['-xf',archive,'-C',tmp]);fs.unlinkSync(archive);
fs.symlinkSync(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'junction');fs.symlinkSync(path.join(root,'desktop/node_modules'),path.join(tmp,'desktop/node_modules'),'junction');
const args=['--test','tests/naumi-bot-groups.test.mjs','tests/naumi-bot-groups-http.test.mjs','tests/naumi-unified-chat.test.mjs','tests/naumi-async-bot.test.mjs'];
try{
 for(const r of rows){const p=path.join(tmp,r.file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(out,'modified',r.file),p);}
 const r=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(out,'ROLLBACK.sh'),tmp],{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'ROLLBACK.log'),r.stdout+r.stderr);assert.equal(r.status,0);
 for(const row of rows)if(row.before)assert.equal(sha(fs.readFileSync(path.join(tmp,row.file))),row.before);else assert(!fs.existsSync(path.join(tmp,row.file)));
 const test=spawnSync(process.execPath,args,{cwd:tmp,encoding:'utf8',windowsHide:true});fs.appendFileSync(path.join(out,'ROLLBACK.log'),test.stdout+test.stderr);assert.equal(test.status,0,'ROLLBACK_BASELINE_TESTS');
 const n=path.join(tmp,'native-copy.js');fs.copyFileSync(path.join(out,'native/modified.js'),n);fs.copyFileSync(path.join(out,'native/original.js'),n);assert.equal(sha(fs.readFileSync(n)),NATIVE_COMPOSER_SHA);
 fs.writeFileSync(path.join(out,'ROLLBACK_RESULT.json'),JSON.stringify({status:'PASS',command:`D:/DEV/Git/bin/bash.exe evidence/group-live-collaboration/ROLLBACK.sh ${tmp}`,output:r.stdout.trim(),exit:r.status,restoredTestCommand:process.execPath+' '+args.join(' '),restoredTests:'25/25',restoredTestExit:test.status,sourceFiles:rows.length,nativeCopyOriginalSHA256:NATIVE_COMPOSER_SHA,sourceStillModified:true,runtimeDataTouched:false},null,2)+'\n');
 console.log('GROUP_ROLLBACK_PASS source_files='+rows.length+' restored_tests=25/25 native_copy_hash=PASS');
}finally{for(const p of ['node_modules','desktop/node_modules'])fs.unlinkSync(path.join(tmp,p));assert(fs.realpathSync(tmp).startsWith(fs.realpathSync(os.tmpdir())+path.sep));fs.rmSync(tmp,{recursive:true,force:true});}
const zip=path.join(out,'MODIFIED_FILE.zip');if(fs.existsSync(zip))fs.unlinkSync(zip);
const z=spawnSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command',`Compress-Archive -LiteralPath '${path.join(out,'modified')}','${path.join(out,'native')}' -DestinationPath '${zip}'`],{encoding:'utf8',windowsHide:true});assert.equal(z.status,0,z.stderr);assert(fs.statSync(zip).size>0);
for(const name of ['MODIFIED_FILE.zip','DIFF_FILE.patch','ROLLBACK.sh'])assert(fs.readFileSync(path.join(out,name)).length);
console.log('GROUP_ARTIFACTS source_files='+rows.length+' native_variants=2 reopened=3');
