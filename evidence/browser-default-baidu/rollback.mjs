import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),target=process.argv[2];if(!target)throw Error('Explicit rollback copy path required');
const root=path.resolve(target),source=path.resolve(here,'../..');if(root===source)throw Error('Use a separate rollback copy');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'manifest.json'))),hash=b=>createHash('sha256').update(b).digest('hex');
for(const row of manifest){const dest=path.join(root,row.file),original=fs.readFileSync(path.join(here,'original',row.file));if(!dest.startsWith(root+path.sep)||hash(original)!==row.originalSHA256||hash(fs.readFileSync(dest))!==row.modifiedSHA256)throw Error('Rollback hash mismatch: '+row.file);}
for(const row of manifest)fs.copyFileSync(path.join(here,'original',row.file),path.join(root,row.file));
for(const row of manifest)if(hash(fs.readFileSync(path.join(root,row.file)))!==row.originalSHA256)throw Error('Restored hash mismatch');
console.log('ROLLBACK restored=5 hashes=PASS modified_source=preserved');
