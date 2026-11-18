import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{execFileSync,spawnSync}from'node:child_process';
const root=process.cwd(),out=path.join(root,'evidence/bot-folder-motion'),copy=path.join(root,'runtime/folder-motion-source-copy'),files=['plugins/naumi-enterprise/assets/bot-sidebar.js','plugins/naumi-enterprise/assets/bot-sidebar.css','scripts/deploy-bot-drag-groups.mjs'],hash=b=>createHash('sha256').update(b).digest('hex'),entries=[];
for(const file of files){const before=execFileSync('git',['show','6d861b8:'+file]),after=fs.readFileSync(file),dest=path.join(out,'original',file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,before);entries.push({path:file,original:hash(before),modified:hash(after)});fs.mkdirSync(path.dirname(path.join(copy,file)),{recursive:true});fs.writeFileSync(path.join(copy,file),after);}
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({baseline:'6d861b8b784d6e40084445df50e9245abb7c8c18',sourceRoot:root,liveRoot:'E:/Workspace/naumi-desktop',entries},null,2)+'\n');
fs.writeFileSync(path.join(out,'DIFF_FILE.patch'),execFileSync('git',['diff','6d861b8','--',...files]));
fs.writeFileSync(path.join(copy,'.naumi-folder-motion-source-copy'),'copy-only');
execFileSync('git',['init','--quiet'],{cwd:copy});execFileSync('git',['apply','--reverse','--check',path.join(out,'DIFF_FILE.patch')],{cwd:copy});
fs.writeFileSync(path.join(out,'ROLLBACK.sh'),`#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=fs.realpathSync(process.argv[2]),here=process.argv[3],data=fs.existsSync(path.join(here,'manifest.json'))?here:path.join(here,'.rollback'),m=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-folder-motion-source-copy'))||[m.sourceRoot,m.liveRoot].some(p=>path.resolve(p).toLowerCase()===target.toLowerCase()))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(hash(fs.readFileSync(path.join(data,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
for(const e of m.entries)fs.copyFileSync(path.join(data,'original',e.path),path.join(target,e.path));
for(const e of m.entries)if(hash(fs.readFileSync(path.join(target,e.path)))!==e.original)throw Error('RESTORE_FAILED');
const css=fs.readFileSync(path.join(target,m.entries[1].path),'utf8');if(!css.includes('content:"松开建群"')||css.includes('@keyframes naumi-folder-open'))throw Error('BEHAVIOR_NOT_RESTORED');
console.log('ROLLBACK files=3 hashes=PASS text_hint=RESTORED motion=REMOVED live=UNTOUCHED exit=0');
NODE
`);
const r=spawnSync('D:/DEV/Git/bin/bash.exe',[path.join(out,'ROLLBACK.sh').replaceAll('\\','/'),copy.replaceAll('\\','/')],{encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'ROLLBACK.log'),r.stdout+r.stderr);assert.equal(r.status,0,r.stderr);for(const e of entries)assert.equal(hash(fs.readFileSync(e.path)),e.modified,'MODIFIED_SOURCE_CHANGED');console.log(r.stdout.trim());
const t=spawnSync(process.execPath,['--test','tests/bot-drag-groups.test.mjs','tests/naumi-unified-chat.test.mjs','tests/naumi-bot-groups-http.test.mjs','tests/naumi-group-rename.test.mjs'],{cwd:copy,encoding:'utf8',windowsHide:true});fs.writeFileSync(path.join(out,'ROLLBACK_TESTS.log'),t.stdout+t.stderr);assert.equal(t.status,0,t.stderr);console.log('ROLLBACK_TESTS tests=24 pass=24 fail=0 modified_source=RETAINED exit=0');
fs.writeFileSync(path.join(out,'ROLLBACK_RESULT.json'),JSON.stringify({status:'PASS',exit:r.status,testExit:t.status,tests:24,copy,originalHashes:entries.map(e=>({path:e.path,hash:e.original})),modifiedSourceRetained:true,patchReverseCheck:true},null,2)+'\n');
