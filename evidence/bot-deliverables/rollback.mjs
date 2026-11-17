import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const evidence=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(evidence,'manifest.json'),'utf8'));
assert(process.argv[2],'Explicit independent-copy path required');
const root=fs.realpathSync(path.resolve(process.argv[2]));
assert(!fs.existsSync(path.join(root,'.git')),'Refuse a live Git checkout');
assert.equal(fs.readFileSync(path.join(root,'.bot-delivery-rollback-copy'),'utf8').trim(),'20261117');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const target=relative=>{
  const p=path.resolve(root,relative),rel=path.relative(root,p);assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel));
  let current=root;for(const segment of rel.split(path.sep)){current=path.join(current,segment);assert(!fs.lstatSync(current).isSymbolicLink());}return p;
};
for(const f of manifest.files){assert.equal(hash(target(f.path)),f.modified,f.path);if(f.original)assert.equal(hash(path.join(evidence,'original',f.path)),f.original);}
for(const f of manifest.files){const p=target(f.path);if(f.original)fs.copyFileSync(path.join(evidence,'original',f.path),p);else fs.unlinkSync(p);}
for(const f of manifest.files){if(f.original)assert.equal(hash(path.join(root,f.path)),f.original);else assert(!fs.existsSync(path.join(root,f.path)));}
console.log(`ROLLBACK_COPY restored=${manifest.files.filter(f=>f.original).length} removed=${manifest.files.filter(f=>!f.original).length} hashes=PASS active_source=UNCHANGED`);
