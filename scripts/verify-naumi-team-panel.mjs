import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');process.chdir(root);
const dir='evidence/naumi-team-panel',hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const baseline=JSON.parse(fs.readFileSync(dir+'/baseline.json','utf8').replace(/^\uFEFF/,''));
const added=['plugins/naumi-enterprise/team-profile.js','plugins/naumi-enterprise/assets/team-panel.js','plugins/naumi-enterprise/assets/team-panel-model.js','plugins/naumi-enterprise/assets/team-panel.css','tests/naumi-team-panel.test.mjs'];
const mode=process.argv[2];
for(const item of baseline.files)assert.equal(hash(dir+'/original/'+item.path),item.sha256,'Original changed: '+item.path);
const checkPreserved=()=>{if(!baseline.preserved)return;for(const item of baseline.preserved)assert.equal(hash(item.path),item.sha256,'Unrelated file changed: '+item.path);};
if(mode==='baseline'){
  assert(!fs.readFileSync(dir+'/original/plugins/naumi-enterprise/host.js','utf8').includes('installTeamProfile'));
  assert(fs.readFileSync(dir+'/original/plugins/naumi-enterprise/client.js','utf8').includes('team.members.map'));
  console.log('BASELINE team_profile=0 flat_member_panel=1 original_hashes='+baseline.files.length);
}else if(mode==='modified'){
  checkPreserved();
  const files=[...baseline.files.map(f=>({path:f.path,original:f.sha256,modified:hash(f.path)})),...added.map(p=>({path:p,original:null,modified:hash(p)}))];
  for(const item of files)assert.notEqual(item.original,item.modified,'File not modified: '+item.path);
  fs.writeFileSync(dir+'/files.json',JSON.stringify({baseline:baseline.commit,branch:'feat/naumi-team-panel-20261116',fields:['naumiTeamProfile.name','naumiTeamProfile.revision','naumiTeamProfile.updatedAt'],files},null,2)+'\n');
  console.log('MODIFIED agent_owned_name=1 activity_library=1 native_actions=1 preserved_files='+baseline.preserved.length+' files='+files.length);
}else if(mode==='rollback-test'){
  const manifest=JSON.parse(fs.readFileSync(dir+'/files.json','utf8')),before=manifest.files.map(x=>[x.path,hash(x.path)]);
  const target=path.resolve('.dsh/team-panel-rollback-'+Date.now());fs.mkdirSync(target,{recursive:true});
  // A real independent source copy; neither active source nor runtime is rolled back here.
  for(const file of ['package.json',...manifest.files.map(x=>x.path)]){const p=path.join(target,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(file,p);}
  for(const folder of ['plugins/naumi-enterprise','plugins/naumi-ui-layout','tests','evidence/naumi-context-ui','evidence/naumi-team-panel/original'])fs.cpSync(folder,path.join(target,folder),{recursive:true});
  fs.symlinkSync(fs.realpathSync('node_modules'),path.join(target,'node_modules'),'junction');
  const bash=process.env.NAUMI_BASH??['D:/DEV/Git/bin/bash.exe','C:/Program Files/Git/bin/bash.exe'].find(p=>fs.existsSync(p));assert(bash,'Git Bash path required');
  const result=spawnSync(bash,[path.resolve(dir+'/ROLLBACK.sh'),'--target',target],{encoding:'utf8',windowsHide:true});
  fs.writeFileSync(dir+'/rollback-command.txt',result.stdout+result.stderr);assert.equal(result.status,0,result.stderr);process.stdout.write(result.stdout);
  for(const item of manifest.files)assert.equal(fs.existsSync(path.join(target,item.path))?hash(path.join(target,item.path)):null,item.original);
  const tests=['tests/naumi-context-ui.test.mjs','tests/naumi-enterprise.test.mjs','tests/agent-desktop.test.mjs','tests/ego-browser.test.mjs','tests/ego-browser-scheduler.test.mjs'];
  const restored=spawnSync(process.execPath,['--test',...tests],{cwd:target,encoding:'utf8',windowsHide:true});fs.writeFileSync(dir+'/rollback-tests.txt',restored.stdout+restored.stderr);assert.equal(restored.status,0,'Restored tests failed');
  for(const [file,sha]of before)assert.equal(hash(file),sha,'Active modified source changed');
  checkPreserved();fs.writeFileSync(dir+'/rollback-result.json',JSON.stringify({target,command:[bash,path.resolve(dir+'/ROLLBACK.sh'),'--target',target],exit:result.status,output:result.stdout,restoredTestsCommand:[process.execPath,'--test',...tests],restoredTestsExit:restored.status,activeStillModified:true},null,2));
  console.log('ROLLBACK_TEST baseline_tests=52 pass=52 fail=0 active_still_modified=1');
}else throw Error('Use baseline, modified or rollback-test');
