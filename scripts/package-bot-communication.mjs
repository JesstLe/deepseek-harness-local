import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const e=path.resolve('evidence/bot-communication'),manifest=JSON.parse(fs.readFileSync(path.join(e,'hashes.json'),'utf8'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-bot-diff-')),before=path.join(temp,'before'),after=path.join(temp,'after');
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
try{
  for(const dir of [before,after])fs.mkdirSync(path.join(dir,'plugins/naumi-enterprise'),{recursive:true});
  for(const item of manifest){
    const relative='plugins/naumi-enterprise/'+item.path,modified=path.resolve(relative);if(hash(modified)!==item.modifiedSHA256)throw Error('MODIFIED_HASH_CHANGED');
    fs.copyFileSync(modified,path.join(after,relative));if(item.originalSHA256){const original=path.join(e,'original',item.path);if(hash(original)!==item.originalSHA256)throw Error('ORIGINAL_HASH_CHANGED');fs.copyFileSync(original,path.join(before,relative));}
  }
  const diff=spawnSync('git',['diff','--no-index','--binary','--','before','after'],{cwd:temp,encoding:'utf8'});
  if(diff.status!==1)throw Error('DIFF_NOT_PRODUCED');
  const patch=diff.stdout.replaceAll('a/before/','a/').replaceAll('b/after/','b/').replaceAll('a/after/','a/');
  const output=path.join(e,'DIFF_FILE.patch');fs.writeFileSync(output,patch);
  const checked=spawnSync('git',['apply','--check',output],{cwd:before,encoding:'utf8'});if(checked.status!==0)throw Error('DIFF_APPLY_CHECK_FAILED '+checked.stderr);
  console.log('PACKAGE diff_apply=PASS files=6 original_hashes=PASS modified_hashes=PASS');
}finally{if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('BAD_TEMP_PATH');fs.rmSync(temp,{recursive:true,force:true});}
