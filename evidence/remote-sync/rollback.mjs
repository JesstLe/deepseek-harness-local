import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),target=path.resolve(process.argv[2]??''),manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'),'utf8'));
assert(process.argv[2]&&fs.existsSync(path.join(target,'.naumi-remote-sync-copy')),'MARKED_INDEPENDENT_RUNTIME_COPY_REQUIRED');
assert(!fs.realpathSync(target).includes(path.join('profiles','web','node_modules')),'ACTIVE_RUNTIME_FORBIDDEN');
const sha=b=>createHash('sha256').update(b).digest('hex'),within=(root,file)=>{const p=path.resolve(root,file);assert(p.startsWith(path.resolve(root)+path.sep),'PATH_ESCAPE');return p;};
for(const r of manifest.runtimeFiles){assert.equal(sha(fs.readFileSync(within(target,r.file))),r.afterSHA256,'COPY_CHANGED '+r.file);if(r.beforeSHA256)assert.equal(sha(fs.readFileSync(within(path.join(here,'runtime-original'),r.file))),r.beforeSHA256);}
let restored=0,removed=0;for(const r of manifest.runtimeFiles){const p=within(target,r.file);if(r.beforeSHA256){fs.copyFileSync(within(path.join(here,'runtime-original'),r.file),p);restored++;assert.equal(sha(fs.readFileSync(p)),r.beforeSHA256);}else{fs.unlinkSync(p);removed++;}}
console.log(`ROLLBACK_COPY restored=${restored} removed=${removed} hashes=PASS active_runtime=UNCHANGED`);
