import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
const root=process.cwd(),e=path.resolve('evidence/weixin-primary');
const baseline=process.argv[2];if(!/^[a-f0-9]{40}$/.test(baseline??''))throw Error('EXPLICIT_BASELINE_SHA_REQUIRED');
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(args,encoding)=>execFileSync('git',args,{cwd:root,...encoding?{encoding}:{},maxBuffer:20e6});
const files=[...new Set(git(['diff','--name-only','8a6c352433fcb3a30448f2477dcd73f9ab9f4c18','381aaa9'],'utf8').trim().split(/\r?\n/).concat(['scripts/package-weixin-primary.mjs','scripts/rollback-weixin-primary.mjs']))];
const manifest=[];
for(const file of files){
 const before=spawnSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:20e6});
 const original=before.status===0?before.stdout:null,modified=fs.readFileSync(path.join(root,file));
 for(const [dir,bytes]of [['original',original],['modified',modified]])if(bytes){const p=path.join(e,dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,bytes);}
 manifest.push({path:file,originalSHA256:original?sha(original):null,modifiedSHA256:sha(modified)});
}
fs.writeFileSync(path.join(e,'hashes.json'),JSON.stringify({baseline,branch:'codex/weixin-primary-20261119',changedFields:['owner-only Weixin iLink transport','primaryBotId binding','transport_state context/cursor','local QR sidebar entry'],files:manifest},null,2)+'\n');
const diff=spawnSync('git',['-c','core.autocrlf=false','diff','--binary','--no-index','--','original','modified'],{cwd:e,maxBuffer:20e6});if(![0,1].includes(diff.status))throw Error(String(diff.stderr));fs.writeFileSync(path.join(e,'DIFF_FILE.patch'),diff.stdout);
fs.copyFileSync('scripts/rollback-weixin-primary.mjs',path.join(e,'rollback-weixin-primary.mjs'));
fs.writeFileSync(path.join(e,'ROLLBACK.sh'),'#!/usr/bin/env bash\nset -euo pipefail\nHERE="$(cd -- "$(dirname -- "$0")" && pwd)"\nexec "${NAUMI_NODE:-node}" "$HERE/rollback-weixin-primary.mjs" --test "${1:?repository root required}"\n',{mode:0o755});
const q=s=>"'"+s.replaceAll("'","''")+"'";
execFileSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command',`Compress-Archive -LiteralPath ${['original','modified','hashes.json'].map(p=>q(path.join(e,p))).join(',')} -DestinationPath ${q(path.join(e,'MODIFIED_FILE.zip'))} -Force`]);
// Reopen the ZIP and each member rather than treating Compress-Archive exit 0 as evidence.
const inspect=`Add-Type -AssemblyName System.IO.Compression.FileSystem; $z=[IO.Compression.ZipFile]::OpenRead(${q(path.join(e,'MODIFIED_FILE.zip'))}); try { $z.Entries | ForEach-Object { if ($_.Name) { $s=$_.Open(); try { $m=[IO.MemoryStream]::new(); $s.CopyTo($m); if($m.Length -ne $_.Length){throw 'ZIP_MEMBER_LENGTH'} } finally {$s.Dispose()} } }; 'ZIP_REOPEN PASS entries='+$z.Entries.Count } finally {$z.Dispose()}`;
console.log(execFileSync('D:/DEV/PowerShell/pwsh.exe',['-NoProfile','-Command',inspect],{encoding:'utf8'}).trim());
for(const f of manifest){if(sha(fs.readFileSync(path.join(e,'modified',f.path)))!==f.modifiedSHA256)throw Error('MODIFIED_HASH');if(f.originalSHA256&&sha(fs.readFileSync(path.join(e,'original',f.path)))!==f.originalSHA256)throw Error('ORIGINAL_HASH');}
fs.readFileSync(path.join(e,'DIFF_FILE.patch'));fs.readFileSync(path.join(e,'ROLLBACK.sh'));
console.log('WEIXIN_PACKAGE files='+manifest.length+' original='+manifest.filter(f=>f.originalSHA256).length+' hashes=PASS');
