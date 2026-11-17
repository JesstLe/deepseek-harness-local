import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),target=fs.realpathSync(process.argv[2]??''),manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(process.argv[3],'confirm-code-only','Provide TARGET_COPY confirm-code-only');
assert(!fs.existsSync(path.join(target,'runtime/server.pid')),'RUNNING_TARGET');
for(const row of manifest.files){const p=path.resolve(target,row.file);assert(p.startsWith(target+path.sep),'PATH_ESCAPE');const current=fs.existsSync(p)?hash(fs.readFileSync(p)):null;assert([row.after,row.before].includes(current),'CHANGED_SINCE_SNAPSHOT '+row.file);if(row.before)assert.equal(hash(fs.readFileSync(path.join(here,'original',row.file))),row.before);}
for(const row of manifest.files){const p=path.resolve(target,row.file);if(row.before){fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(here,'original',row.file),p);}else if(fs.existsSync(p))fs.unlinkSync(p);}
for(const row of manifest.files)assert.equal(fs.existsSync(path.join(target,row.file))?hash(fs.readFileSync(path.join(target,row.file))):null,row.before);
console.log('ROLLBACK_SOURCE=PASS files='+manifest.files.length+' restored=BASELINE data=UNTOUCHED');
