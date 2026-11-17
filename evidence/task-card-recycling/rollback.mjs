import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const e=path.dirname(fileURLToPath(import.meta.url)),m=JSON.parse(fs.readFileSync(path.join(e,'manifest.json'),'utf8'));
assert(process.argv[2],'Explicit copy path required');const root=fs.realpathSync(path.resolve(process.argv[2]));
assert(!fs.existsSync(path.join(root,'.git')));assert.equal(fs.readFileSync(path.join(root,'.task-card-recycling-copy'),'utf8').trim(),'20261117');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const target=rel=>{const p=path.resolve(root,rel),r=path.relative(root,p);assert(r&&!r.startsWith('..')&&!path.isAbsolute(r));let current=root;for(const part of r.split(path.sep)){current=path.join(current,part);assert(!fs.lstatSync(current).isSymbolicLink());}return p;};
for(const f of m.files){assert.equal(hash(target(f.path)),f.modified,f.path);if(f.original)assert.equal(hash(path.join(e,'original',f.path)),f.original);}
for(const f of m.files){const p=target(f.path);if(f.original)fs.copyFileSync(path.join(e,'original',f.path),p);else fs.unlinkSync(p);}
for(const f of m.files){if(f.original)assert.equal(hash(path.join(root,f.path)),f.original);else assert(!fs.existsSync(path.join(root,f.path)));}
console.log(`ROLLBACK_COPY restored=${m.files.filter(f=>f.original).length} removed=${m.files.filter(f=>!f.original).length} hashes=PASS active_source=UNCHANGED`);
