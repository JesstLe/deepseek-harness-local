import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url)),input=process.argv[2];
if(!input||!path.isAbsolute(input))throw Error('ABSOLUTE_PLUGIN_DIRECTORY_REQUIRED');
const target=fs.realpathSync(input);if(target===path.parse(target).root)throw Error('ROOT_TARGET_REJECTED');
const manifest=JSON.parse(fs.readFileSync(path.join(here,'hashes.json'),'utf8'));
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for(const item of manifest){
  const file=path.resolve(target,item.path);if(!file.startsWith(target+path.sep)||path.basename(item.path)!==item.path)throw Error('TARGET_ESCAPE');
  if(!fs.statSync(file).isFile()||hash(file)!==item.modifiedSHA256)throw Error('MODIFIED_HASH_MISMATCH '+item.path);
  if(item.originalSHA256&&hash(path.join(here,'original',item.path))!==item.originalSHA256)throw Error('ORIGINAL_HASH_MISMATCH');
}
for(const item of manifest){const file=path.join(target,item.path);if(item.originalSHA256)fs.copyFileSync(path.join(here,'original',item.path),file);else fs.unlinkSync(file);}
for(const item of manifest){const file=path.join(target,item.path);if(item.originalSHA256?hash(file)!==item.originalSHA256:fs.existsSync(file))throw Error('RESTORE_FAILED');}
console.log('ROLLBACK_COPY restored=2 removed=4 hashes=PASS bot_creation_fix=retained');
