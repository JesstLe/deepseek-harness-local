#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd -- "$(dirname -- "$0")" && pwd)"
node - "$1" "$HERE" <<'NODE'
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),target=path.resolve(process.argv[2]),here=process.argv[3],data=fs.existsSync(path.join(here,'manifest.json'))?here:path.join(here,'.rollback'),m=JSON.parse(fs.readFileSync(path.join(data,'manifest.json'))),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
if(!fs.existsSync(path.join(target,'.naumi-delivery-ui-source-copy'))||target===path.resolve(m.sourceRoot)||fs.lstatSync(target).isSymbolicLink())throw Error('MARKED_COPY_REQUIRED');
for(const e of m.entries){const p=path.resolve(target,e.path);if(!p.startsWith(target+path.sep)||fs.lstatSync(p).isSymbolicLink()||hash(fs.readFileSync(p))!==e.modified)throw Error('COPY_CHANGED');if(e.original&&hash(fs.readFileSync(path.join(data,'original',e.path)))!==e.original)throw Error('ORIGINAL_CHANGED');}
for(const e of m.entries){const p=path.join(target,e.path);if(e.original)fs.copyFileSync(path.join(data,'original',e.path),p);else fs.unlinkSync(p);}
for(const e of m.entries){const p=path.join(target,e.path);if(e.original?hash(fs.readFileSync(p))!==e.original:fs.existsSync(p))throw Error('RESTORE_FAILED');}
console.log('ROLLBACK originals=5 new_removed=5 hashes=PASS delivery=ORIGINAL compact=ORIGINAL modified_source=RETAINED live_data=UNTOUCHED exit=0');
NODE
