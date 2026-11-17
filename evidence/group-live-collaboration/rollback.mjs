import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';
const home=path.dirname(fileURLToPath(import.meta.url)),target=path.resolve(process.argv[2]??''),manifest=JSON.parse(fs.readFileSync(path.join(home,'manifest.json'))),sha=b=>createHash('sha256').update(b).digest('hex');assert(process.argv[2],'EXPLICIT_SOURCE_COPY_REQUIRED');
for(const r of manifest.rows){const p=path.resolve(target,r.file);assert(p.startsWith(target+path.sep),'PATH_ESCAPE');assert.equal(sha(fs.readFileSync(p)),r.after,'ROLLBACK_TARGET_DRIFT '+r.file);if(r.before)assert.equal(sha(fs.readFileSync(path.join(home,'original',r.file))),r.before);}
for(const r of manifest.rows){const p=path.join(target,r.file);if(r.before)fs.copyFileSync(path.join(home,'original',r.file),p);else fs.unlinkSync(p);}
console.log('ROLLBACK_SOURCE_RESTORED files='+manifest.rows.length+' hashes=PASS runtime_data=UNTOUCHED');
