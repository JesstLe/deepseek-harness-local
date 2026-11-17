import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const e=path.resolve('evidence/proactive-runtime'),manifest=JSON.parse(fs.readFileSync(e+'/hashes.json')),sha=b=>createHash('sha256').update(b).digest('hex');
for(const p of ['MODIFIED_FILE.zip','DIFF_FILE.patch','VERIFICATION.txt','ROLLBACK.sh'])assert(fs.readFileSync(path.join(e,p)).length>0,p);
assert(fs.readFileSync(e+'/ROLLBACK.sh','utf8').startsWith('#!/usr/bin/env bash\n'));assert(fs.readFileSync(e+'/DIFF_FILE.patch','utf8').includes('employee-activity-store.js'));assert(fs.readFileSync(e+'/VERIFICATION.txt','utf8').includes('exit=0'));
for(const m of manifest){assert.equal(sha(fs.readFileSync(m.path)),m.modifiedSHA256);assert.equal(sha(fs.readFileSync(path.join(e,'modified',m.path))),m.modifiedSHA256);if(m.originalSHA256)assert.equal(sha(fs.readFileSync(path.join(e,'original',m.path))),m.originalSHA256);if(m.repo==='harness'){const target=path.join('E:/Workspace/deepseek-harness-local/.dsh/profiles/web/node_modules/@naumi/dsh-enterprise',m.path.replace('plugins/naumi-enterprise/',''));assert.equal(sha(fs.readFileSync(target)),m.modifiedSHA256);}}
const ps=`Add-Type -AssemblyName System.IO.Compression.FileSystem;$z=[IO.Compression.ZipFile]::OpenRead('${e.replaceAll("'","''")}/MODIFIED_FILE.zip');try{foreach($x in $z.Entries){if($x.FullName -notmatch '/$'){$s=$x.Open();try{$h=[Security.Cryptography.SHA256]::Create();$hash=[Convert]::ToHexString($h.ComputeHash($s)).ToLowerInvariant();Write-Output ($x.FullName.Replace('\\','/')+' '+$hash)}finally{$s.Dispose()}}}}finally{$z.Dispose()}`;
const entries=new Map(execFileSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command',ps],{encoding:'utf8'}).trim().split(/\r?\n/).map(line=>{const p=line.lastIndexOf(' ');return [line.slice(0,p),line.slice(p+1)];}));
for(const m of manifest){assert.equal(entries.get('modified/'+m.path),m.modifiedSHA256);if(m.originalSHA256)assert.equal(entries.get('original/'+m.path),m.originalSHA256);}
const mode=execFileSync('git',['ls-files','--stage','evidence/proactive-runtime/ROLLBACK.sh'],{encoding:'utf8'});assert(mode.startsWith('100755 '),'ROLLBACK_EXECUTABLE_INDEX_REQUIRED');
console.log('ARTIFACTS reopened=4 zip_entries=verified source_hashes=PASS runtime_plugin_hashes=PASS rollback_mode=100755 modified_state=retained');
