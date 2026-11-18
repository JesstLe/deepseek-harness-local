#!/usr/bin/env bash
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
