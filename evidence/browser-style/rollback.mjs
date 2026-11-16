import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),target=path.resolve(process.argv[2]??'');
if(!process.argv[2]||target===path.parse(target).root)throw Error('EXPLICIT_CHECKOUT_REQUIRED');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'change-manifest.json'),'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const item of manifest){const p=path.resolve(target,item.path);if(!p.startsWith(target+path.sep))throw Error('TARGET_ESCAPE');if(!fs.existsSync(p)||hash(p)!==item.modifiedSHA256)throw Error('MODIFIED_HASH_MISMATCH '+item.path);if(item.originalSHA256&&hash(path.join(here,'original',item.path))!==item.originalSHA256)throw Error('ORIGINAL_HASH_MISMATCH');}
for(const item of manifest){const p=path.resolve(target,item.path);if(item.originalSHA256)fs.copyFileSync(path.join(here,'original',item.path),p);else fs.unlinkSync(p);}
for(const item of manifest){const p=path.resolve(target,item.path);if(item.originalSHA256?hash(p)!==item.originalSHA256:fs.existsSync(p))throw Error('ROLLBACK_FAILED');}
console.log('ROLLBACK_COPY restored=1 original_css_owner=upstream');
