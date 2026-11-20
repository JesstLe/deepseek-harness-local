#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=fs.realpathSync(process.argv[2]),here=process.argv[3],data=fs.existsSync(path.join(here,'manifest.json'))?here:path.join(here,'.rollback'),m=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-thread-team-copy'))||[m.sourceRoot,m.liveRoot].some(p=>path.resolve(p).toLowerCase()===target.toLowerCase()))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||hash(fs.readFileSync(p))!==e.modified||hash(fs.readFileSync(path.join(data,'original',e.path)))!==e.original)throw Error('COPY_OR_ORIGINAL_CHANGED');}
for(const e of m.entries)fs.copyFileSync(path.join(data,'original',e.path),path.join(target,e.path));
for(const e of m.entries)if(hash(fs.readFileSync(path.join(target,e.path)))!==e.original)throw Error('RESTORE_FAILED');
console.log('ROLLBACK files=1 hashes=PASS thread_team=ORIGINAL source_scope=MODIFIED live=UNTOUCHED exit=0');
NODE
