#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=fs.realpathSync(process.argv[2]),here=process.argv[3],data=fs.existsSync(path.join(here,'manifest.json'))?here:path.join(here,'.rollback'),m=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-group-work-source-copy'))||[m.sourceRoot,m.liveRoot].some(p=>path.resolve(p).toLowerCase()===target.toLowerCase()))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(e.original&&hash(fs.readFileSync(path.join(data,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
for(const e of m.entries){const p=path.join(target,e.path);if(e.original)fs.copyFileSync(path.join(data,'original',e.path),p);else fs.unlinkSync(p);}
for(const e of m.entries){const p=path.join(target,e.path);if(e.original?hash(fs.readFileSync(p))!==e.original:fs.existsSync(p))throw Error('RESTORE_FAILED');}
if(fs.readFileSync(path.join(target,m.entries[2].path),'utf8').includes('function WorkIndicator('))throw Error('INDICATOR_NOT_REMOVED');
console.log('ROLLBACK originals=3 new_removed=1 hashes=PASS indicator=REMOVED native=ORIGINAL live=UNTOUCHED exit=0');
NODE
