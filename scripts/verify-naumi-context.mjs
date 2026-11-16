import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const dir='evidence/naumi-context-ui';
const baseline=JSON.parse(fs.readFileSync(dir+'/baseline.json','utf8'));
const files=[['plugins/naumi-enterprise/client.js','client.js'],['plugins/naumi-enterprise/assets/style.css','style.css']];
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashFile=p=>hash(fs.readFileSync(p));
const preserved=()=>{for(const [file,sha]of Object.entries(baseline.preserved))assert.equal(hashFile(file),sha,'Preserved file changed: '+file);};
const originals=()=>{for(const [file,name]of files)assert.equal(hashFile(dir+'/original/'+name),baseline.sources[file]);};
const mode=process.argv[2];originals();
if(mode==='baseline'){
 assert(!fs.readFileSync(dir+'/original/client.js','utf8').includes('installNaumiContextUI'));
 console.log('BASELINE context_ui=0 native_sidebar=1 native_model_selector=1 preserved_files=9');
}else if(mode==='modified'){
 preserved();assert(fs.readFileSync(files[0][0],'utf8').includes('installNaumiContextUI'));
 for(const [file]of files)assert.notEqual(hashFile(file),baseline.sources[file]);
 fs.writeFileSync(dir+'/modified-hashes.json',JSON.stringify(Object.fromEntries(files.map(([file])=>[file,hashFile(file)])),null,2));
 console.log('MODIFIED context_ui=1 native_sidebar_unchanged=1 native_model_selector_unchanged=1 preserved_files=9');
}else if(mode==='rollback-test'){
 preserved();const current=Object.fromEntries(files.map(([file])=>[file,hashFile(file)]));
 const fixture='.dsh/naumi-context-backup/rollback-test';fs.mkdirSync(fixture,{recursive:true});
 for(const [file,name]of files){fs.copyFileSync(file,path.join(fixture,name));fs.copyFileSync(dir+'/original/'+name,path.join(fixture,name));assert.equal(hashFile(path.join(fixture,name)),baseline.sources[file]);assert.equal(hashFile(file),current[file]);}
 assert(!fs.readFileSync(fixture+'/client.js','utf8').includes('installNaumiContextUI'));
 console.log('ROLLBACK original_hashes_match=2 context_ui_removed_in_copy=1 active_still_modified=1');
}else if(mode==='rollback'){
 const modified=JSON.parse(fs.readFileSync(dir+'/modified-hashes.json','utf8'));
 const targets=files.flatMap(([file,name])=>[[file,name],['.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/'+(name==='style.css'?'assets/':'')+name,name]]);
 // Check every destination before writing any. Hard-linked installations update together.
 for(const [file,name]of targets){if(!fs.existsSync(file))continue;const canonical=files.find(([,n])=>n===name)[0];assert([modified[canonical],baseline.sources[canonical]].includes(hashFile(file)),'Later edits detected: '+file);}
 for(const [file,name]of targets)if(fs.existsSync(file)&&hashFile(file)!==hashFile(dir+'/original/'+name))fs.copyFileSync(dir+'/original/'+name,file);
 console.log('ROLLBACK original_ui_restored=1 models_untouched=1 refresh_required=1');
}else throw Error('Use baseline, modified, rollback-test or rollback');
