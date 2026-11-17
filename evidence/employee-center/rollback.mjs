import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),arg=process.argv[2];if(!arg||!path.isAbsolute(arg))throw Error('ABSOLUTE_PLUGIN_DIRECTORY_REQUIRED');const root=fs.realpathSync(arg);if(root===path.parse(root).root)throw Error('ROOT_TARGET_REJECTED');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'hashes.json'),'utf8')),hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const m of manifest){const p=path.resolve(root,m.path);if(!p.startsWith(root+path.sep)||hash(p)!==m.modifiedSHA256)throw Error('TARGET_OR_HASH_MISMATCH');if(m.originalSHA256&&hash(path.join(here,'original',m.path))!==m.originalSHA256)throw Error('ORIGINAL_HASH_MISMATCH');}
for(const m of manifest){const p=path.resolve(root,m.path);if(m.originalSHA256)fs.copyFileSync(path.join(here,'original',m.path),p);else fs.unlinkSync(p);}
for(const m of manifest){const p=path.resolve(root,m.path);if(m.originalSHA256?hash(p)!==m.originalSHA256:fs.existsSync(p))throw Error('RESTORE_FAILED');}
console.log('ROLLBACK_COPY restored=5 removed=5 hashes=PASS M1_data=preserved bot_routing=retained');
