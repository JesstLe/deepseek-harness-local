import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';

const root=process.cwd(),out=path.join(root,'evidence/plugin-market'),base=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(base??''))throw Error('BASE_SHA_REQUIRED');
const hash=b=>createHash('sha256').update(b).digest('hex');
const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:['ignore','pipe','pipe']});
const write=(p,b)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,b);};
const paths=git('diff','--name-only',base,'HEAD').toString().trim().split('\n').filter(Boolean);
assert(paths.length>20&&paths.every(p=>!p.startsWith('evidence/')&&!p.includes('..')),'UNEXPECTED_TASK_PATHS');
const stage=path.join(root,'runtime/market-package-'+randomUUID());
fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(out,{recursive:true});
const manifest=paths.map(p=>{
 let original=null;try{original=git('show',base+':'+p);}catch{}
 const modified=fs.readFileSync(path.join(root,p));write(path.join(stage,p),modified);
 if(original)write(path.join(out,'original',p),original);
 return{path:p,originalSHA256:original?hash(original):null,modifiedSHA256:hash(modified)};
});
write(path.join(out,'HASHES.json'),JSON.stringify({base,source:git('rev-parse','HEAD').toString().trim(),files:manifest},null,2)+'\n');
write(path.join(out,'DIFF_FILE.patch'),git('diff','--binary',base,'HEAD','--',...paths));
write(path.join(out,'rollback.mjs'),`import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const evidence=path.dirname(fileURLToPath(import.meta.url)),target=fs.realpathSync(process.argv[2]),marker=path.join(target,'.naumi-market-copy.json');assert(fs.existsSync(marker),'COPY_TARGET_REQUIRED');assert.equal(JSON.parse(fs.readFileSync(marker)).target,target,'COPY_TARGET_MISMATCH');const manifest=JSON.parse(fs.readFileSync(path.join(evidence,'HASHES.json'))).files,hash=b=>createHash('sha256').update(b).digest('hex');
for(const m of manifest){const p=path.resolve(target,m.path);assert(p.startsWith(target+path.sep));for(let q=p;q!==target;q=path.dirname(q))if(fs.existsSync(q))assert(!fs.lstatSync(q).isSymbolicLink(),'LINKED_TARGET');if(fs.existsSync(p))assert([m.modifiedSHA256,m.originalSHA256].includes(hash(fs.readFileSync(p))),'COPY_CHANGED '+m.path);else assert.equal(m.originalSHA256,null,'ORIGINAL_MISSING');if(m.originalSHA256)assert.equal(hash(fs.readFileSync(path.join(evidence,'original',m.path))),m.originalSHA256);}
for(const m of manifest){const p=path.join(target,m.path);if(m.originalSHA256){fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(evidence,'original',m.path),p);}else if(fs.existsSync(p))fs.unlinkSync(p);}
for(const m of manifest){const p=path.join(target,m.path);assert.equal(fs.existsSync(p)?hash(fs.readFileSync(p)):null,m.originalSHA256);}console.log('ROLLBACK_PASS files='+manifest.length+' original_hashes=restored added_files=removed source_unchanged=1');\n`);
write(path.join(out,'ROLLBACK.sh'),'#!/usr/bin/env sh\nset -eu\nif [ "$#" -ne 1 ]; then echo "Usage: ROLLBACK.sh COPY_DIRECTORY" >&2; exit 64; fi\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$HERE/rollback.mjs" "$1"\n');
const pwsh='D:/DEV/PowerShell/pwsh.exe',zip=path.join(out,'MODIFIED_FILE.zip'),reopened=path.join(root,'runtime/market-reopened-'+randomUUID());
execFileSync(pwsh,['-NoProfile','-Command',`$ErrorActionPreference='Stop'; Compress-Archive -Path '${stage.replaceAll("'","''")}/*' -DestinationPath '${zip.replaceAll("'","''")}' -Force; Expand-Archive -LiteralPath '${zip.replaceAll("'","''")}' -DestinationPath '${reopened.replaceAll("'","''")}'`],{windowsHide:true});
for(const m of manifest)assert.equal(hash(fs.readFileSync(path.join(reopened,m.path))),m.modifiedSHA256);
const copy=path.join(root,'runtime/market-rollback-'+randomUUID()),archive=path.join(root,'runtime/market-baseline-'+randomUUID()+'.tar');fs.mkdirSync(copy);
execFileSync('git',['archive','--format=tar','--output='+archive,base,'desktop','plugins','package.json','scripts','tests/naumi-enterprise.test.mjs'],{cwd:root});
execFileSync('tar',['-xf',archive,'-C',copy]);
for(const m of manifest)write(path.join(copy,m.path),fs.readFileSync(path.join(root,m.path)));
write(path.join(copy,'.naumi-market-copy.json'),JSON.stringify({target:fs.realpathSync(copy)}));
fs.symlinkSync(path.join(root,'node_modules'),path.join(copy,'node_modules'),'junction');
const rollback=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(out,'ROLLBACK.sh'),copy.replaceAll('\\','/')],{cwd:root,encoding:'utf8',windowsHide:true});
write(path.join(out,'ROLLBACK.log'),(rollback.stdout??'')+(rollback.stderr??''));assert.equal(rollback.status,0,rollback.stderr);
const tests=['desktop/tests/identity.test.cjs','desktop/tests/enterprise.test.cjs','tests/naumi-enterprise.test.mjs'];
const restored=spawnSync(process.execPath,['--test',...tests],{cwd:copy,encoding:'utf8',windowsHide:true,timeout:120000});
write(path.join(out,'ROLLBACK_TESTS.log'),(restored.stdout??'')+(restored.stderr??''));assert.equal(restored.status,0,restored.stderr);
for(const m of manifest)assert.equal(hash(fs.readFileSync(path.join(root,m.path))),m.modifiedSHA256);
const result={status:'PASS',base,source:git('rev-parse','HEAD').toString().trim(),files:manifest.length,zipSHA256:hash(fs.readFileSync(zip)),archiveReopened:true,rollbackCopy:copy,rollbackCommand:`D:/DEV/Git/bin/bash.exe evidence/plugin-market/ROLLBACK.sh ${copy.replaceAll('\\','/')}`,rollbackExit:rollback.status,restoredCommand:'node --test '+tests.join(' '),restoredExit:restored.status,restoredSummary:restored.stdout.match(/ℹ tests \d+[\s\S]*?ℹ fail \d+/)?.[0],sourceUnchanged:true};
write(path.join(out,'PACKAGE.json'),JSON.stringify(result,null,2)+'\n');
for(const file of ['MODIFIED_FILE.zip','DIFF_FILE.patch','ROLLBACK.sh','HASHES.json','PACKAGE.json'])assert(fs.readFileSync(path.join(out,file)).length>0);
console.log('ARTIFACTS_PASS files='+manifest.length+' zip_reopened=1 rollback_exit=0 restored_tests=PASS source_unchanged=1');
