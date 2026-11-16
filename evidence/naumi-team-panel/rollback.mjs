import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),index=args.indexOf('--target');
assert(index>=0&&args[index+1]&&path.isAbsolute(args[index+1]),'Use ROLLBACK.sh --target ABSOLUTE_REPOSITORY_PATH [--installed]');
const target=fs.realpathSync(args[index+1]),here=import.meta.dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(here,'files.json'),'utf8'));
const hash=p=>fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;
const inside=relative=>{const p=path.resolve(target,relative);assert(p.toLowerCase().startsWith((target+path.sep).toLowerCase()),'Path outside target');return p;};
const changes=[];
for(const item of manifest.files){
  const source=item.original?path.join(here,'original',item.path):null;
  if(source)assert.equal(hash(source),item.original,'Original backup hash differs');
  const paths=[inside(item.path)];
  if(args.includes('--installed')&&item.path.startsWith('plugins/naumi-enterprise/'))paths.push(inside('.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/'+item.path.slice('plugins/naumi-enterprise/'.length)));
  for(const file of paths){const current=hash(file);assert([item.modified,item.original].includes(current),'Later edits detected: '+file);changes.push({file,source,original:item.original});}
}
// Preflight all targets before any write. Copy-and-rename also avoids editing pnpm hardlink peers.
for(const item of changes){
  if(hash(item.file)===item.original)continue;
  if(item.source){const temp=item.file+'.naumi-rollback-'+process.pid;fs.mkdirSync(path.dirname(item.file),{recursive:true});fs.copyFileSync(item.source,temp);fs.renameSync(temp,item.file);}
  else fs.unlinkSync(item.file);
  assert.equal(hash(item.file),item.original);
}
console.log('ROLLBACK restored_existing='+manifest.files.filter(x=>x.original).length+' removed_added='+manifest.files.filter(x=>!x.original).length+' hashes_match=1');
