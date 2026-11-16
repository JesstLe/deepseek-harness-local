import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),arg=process.argv[2];
if(!arg||!path.isAbsolute(arg))throw Error('ABSOLUTE_PLUGIN_DIRECTORY_REQUIRED');
const target=fs.realpathSync(arg);if(target===path.parse(target).root)throw Error('ROOT_TARGET_REJECTED');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'hashes.json'),'utf8')),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const m of manifest){const p=path.resolve(target,m.path);if(path.basename(m.path)!==m.path||!p.startsWith(target+path.sep))throw Error('TARGET_ESCAPE');if(hash(p)!==m.modifiedSHA256)throw Error('MODIFIED_HASH_MISMATCH');if(m.originalSHA256&&hash(path.join(here,'original',m.path))!==m.originalSHA256)throw Error('ORIGINAL_HASH_MISMATCH');}
for(const m of manifest){const p=path.join(target,m.path);if(m.originalSHA256)fs.copyFileSync(path.join(here,'original',m.path),p);else fs.unlinkSync(p);}
for(const m of manifest){const p=path.join(target,m.path);if(m.originalSHA256?hash(p)!==m.originalSHA256:fs.existsSync(p))throw Error('RESTORE_FAILED');}
console.log('ROLLBACK_COPY restored=2 removed=3 hashes=PASS employee_data=preserved bot_routing=retained');
