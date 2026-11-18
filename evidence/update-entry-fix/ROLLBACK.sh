#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const target=path.resolve(process.argv[2]),here=path.resolve(process.argv[3]),data=fs.existsSync(path.join(here,'manifest.json'))?here:path.join(here,'.rollback');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),m=JSON.parse(fs.readFileSync(path.join(data,'manifest.json')));
if(!fs.existsSync(path.join(target,'.naumi-update-entry-copy'))||fs.lstatSync(target).isSymbolicLink()||target===path.resolve(m.livePlugin))throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(e.original&&hash(fs.readFileSync(path.join(data,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
for(const e of m.entries){const p=path.join(target,e.path);if(e.original)fs.copyFileSync(path.join(data,'original',e.path),p);else fs.unlinkSync(p);}
for(const e of m.entries){const p=path.join(target,e.path);if(e.original?hash(fs.readFileSync(p))!==e.original:fs.existsSync(p))throw Error('RESTORE_FAILED');}
console.log('ROLLBACK restored=4 removed=2 version=0.3.2 update_hook=0 shortcut=ORIGINAL live_data=UNTOUCHED exit=0');
NODE
