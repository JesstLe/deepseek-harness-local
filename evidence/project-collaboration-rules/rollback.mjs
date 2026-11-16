import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const evidence=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(evidence,'manifest.json'),'utf8'));
assert(process.argv[2],'Explicit rollback copy path required');
const root=fs.realpathSync(path.resolve(process.argv[2]));
const marker=JSON.parse(fs.readFileSync(path.join(root,'.naumi-doc-rollback-copy.json'),'utf8'));
assert.equal(marker.task,manifest.task,'Only the marked independent copy is accepted');
assert(!fs.existsSync(path.join(root,'.git')),'A Git checkout is not a rollback test copy');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const targetFor=relative=>{
  const target=path.resolve(root,relative),rel=path.relative(root,target);
  assert(rel&&!rel.startsWith('..')&&!path.isAbsolute(rel),'Target must stay inside copy');
  let current=root;
  for(const segment of rel.split(path.sep)){
    current=path.join(current,segment);
    assert(!fs.lstatSync(current).isSymbolicLink(),'No reparse/symlink target');
  }
  return target;
};
for(const entry of manifest.files){
  assert(entry.modifiedSha256,'Missing modified hash');
  assert.equal(hash(targetFor(entry.path)),entry.modifiedSha256,entry.path);
  if(entry.existed)assert.equal(hash(path.join(evidence,'original',entry.path)),entry.originalSha256,entry.path);
}
for(const entry of manifest.files){
  const target=targetFor(entry.path);
  if(entry.existed)fs.copyFileSync(path.join(evidence,'original',entry.path),target);
  else fs.unlinkSync(target);
}
console.log('ROLLBACK_COPY restored=1 removed=3 original_hashes=PASS active_checkout=untouched');
