'use strict';
const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const sha=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function verifyStagedRuntime(root=path.resolve(__dirname,'../..')){
 const target=path.join(root,'runtime/desktop-backend'),manifest=JSON.parse(fs.readFileSync(path.join(target,'runtime-manifest.json'))),inventory=path.join(target,'runtime-files.json');
 if(manifest.schemaVersion!==2||manifest.dingtalk?.version!=='1.0.68'||manifest.inventorySHA256!==sha(inventory))throw Error('STAGED_MANIFEST_INVALID');
 if(manifest.version!==JSON.parse(fs.readFileSync(path.join(root,'desktop/package.json'))).version)throw Error('STAGED_VERSION_STALE');
 const files=JSON.parse(fs.readFileSync(inventory)),expected=new Set(['runtime-manifest.json','runtime-files.json']);
 for(const item of files){
  const resolved=path.resolve(target,item.path);
  if(!resolved.startsWith(target+path.sep)||sha(resolved)!==item.sha256)throw Error('STAGED_HASH_CHANGED '+item.path);expected.add(item.path);
  if(item.path.startsWith('plugins/')){const source=path.join(root,item.path);if(!fs.existsSync(source)||sha(source)!==item.sha256)throw Error('STAGED_PLUGIN_STALE '+item.path);}
 }
 const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isSymbolicLink())throw Error('STAGED_SYMLINK');if(entry.isDirectory())walk(p);else if(!expected.has(path.relative(target,p).replaceAll('\\','/')))throw Error('STAGED_UNTRACKED_FILE');}};walk(target);
 // Catch newly added plugin files absent from an otherwise intact old inventory.
 const sourceWalk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())sourceWalk(p);else if(!expected.has(path.relative(root,p).replaceAll('\\','/')))throw Error('STAGED_PLUGIN_OMITTED');}};sourceWalk(path.join(root,'plugins'));
 return {files:files.length,version:manifest.version,dingtalk:manifest.dingtalk.version,hashes:'PASS'};
}
module.exports=async()=>{const result=verifyStagedRuntime();console.log('STAGED_RUNTIME_VERIFIED '+JSON.stringify(result));};
module.exports.verifyStagedRuntime=verifyStagedRuntime;
if(require.main===module)module.exports().catch(e=>{console.error(e.message);process.exitCode=1;});
