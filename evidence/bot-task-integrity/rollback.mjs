import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),target=path.resolve(process.argv[2]??''),manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'),'utf8'));
assert(process.argv[2]&&fs.existsSync(path.join(target,'.naumi-integrity-copy')),'MARKED_INDEPENDENT_COPY_REQUIRED');
assert.notEqual(fs.realpathSync(target),fs.realpathSync(path.resolve(here,'../..')),'ACTIVE_SOURCE_FORBIDDEN');
const sha=b=>createHash('sha256').update(b).digest('hex'),within=(root,file)=>{const p=path.resolve(root,file);assert(p.startsWith(path.resolve(root)+path.sep),'PATH_ESCAPE');return p;};
for(const row of manifest.files){const p=within(target,row.path);assert.equal(sha(fs.readFileSync(p)),row.modifiedSHA256,'COPY_CHANGED '+row.path);if(row.originalSHA256)assert.equal(sha(fs.readFileSync(within(path.join(here,'original'),row.path))),row.originalSHA256);}
let restored=0,removed=0;for(const row of manifest.files){const p=within(target,row.path);if(row.originalSHA256){fs.copyFileSync(within(path.join(here,'original'),row.path),p);restored++;assert.equal(sha(fs.readFileSync(p)),row.originalSHA256);}else{fs.unlinkSync(p);removed++;}}
console.log(`ROLLBACK_COPY restored=${restored} removed=${removed} hashes=PASS active_source=UNCHANGED`);
