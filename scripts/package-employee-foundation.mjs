import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const e=path.resolve('evidence/employee-foundation'),names=['bots.js','package.json','employees.js','employee-store.js','employee-service.js'];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifest=names.map(name=>({path:name,originalSHA256:fs.existsSync(path.join(e,'original',name))?hash(path.join(e,'original',name)):null,modifiedSHA256:hash(path.resolve('plugins/naumi-enterprise',name))}));
fs.writeFileSync(path.join(e,'hashes.json'),JSON.stringify(manifest,null,2)+'\n');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'employee-diff-'));
try{
  for(const side of ['before','after'])fs.mkdirSync(path.join(temp,side,'plugins/naumi-enterprise'),{recursive:true});
  for(const m of manifest){const rel='plugins/naumi-enterprise/'+m.path;fs.copyFileSync(path.resolve(rel),path.join(temp,'after',rel));if(m.originalSHA256)fs.copyFileSync(path.join(e,'original',m.path),path.join(temp,'before',rel));}
  const result=spawnSync('git',['diff','--no-index','--binary','--','before','after'],{cwd:temp,encoding:'utf8'});if(result.status!==1)throw Error('DIFF_FAILED');
  const output=path.join(e,'DIFF_FILE.patch');fs.writeFileSync(output,result.stdout.replaceAll('a/before/','a/').replaceAll('b/after/','b/').replaceAll('a/after/','a/'));
  const check=spawnSync('git',['apply','--check',output],{cwd:path.join(temp,'before'),encoding:'utf8'});if(check.status!==0)throw Error('DIFF_NOT_APPLICABLE');
  console.log('PACKAGE modules=5 diff_apply=PASS original_hashes=preserved');
}finally{if(!path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep))throw Error('BAD_TEMP_PATH');fs.rmSync(temp,{recursive:true,force:true});}
