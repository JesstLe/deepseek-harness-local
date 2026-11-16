import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const dir='evidence/ego-native',b=JSON.parse(fs.readFileSync(dir+'/baseline.json','utf8'));
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const mode=process.argv[2]??'modified';
for(const data of Object.values(b.sources))assert.equal(hash(dir+'/'+data.backup),data.sha256);
if(mode==='baseline'){
  assert(fs.readFileSync(dir+'/prototype/modified/plugins/naumi-enterprise/host.js','utf8').includes('browser-native-client.js'));
  assert.equal(JSON.parse(fs.readFileSync(dir+'/RECOVERY_CHECK.json')).nativeIntegrationAccepted,false);
  console.log('BASELINE experimental_binding=1 native_ui_accepted=0');
}else if(mode==='modified'){
  for(const [f,data]of Object.entries(b.sources))assert.equal(hash(f),data.sha256);
  for(const [f,sha]of Object.entries(b.preserved))assert.equal(hash(f),sha);
  assert(!fs.existsSync('plugins/naumi-enterprise/assets/browser-native-client.js'));
  assert(!fs.existsSync('scripts/Start-NaumiDesktop.ps1'));
  console.log('MODIFIED originals_restored=6 native_entry=0 protected_files=10');
}else if(mode==='rollback-test'){
  const target='.dsh/native-browser/recovery-test',before=Object.fromEntries(Object.keys(b.sources).map(f=>[f,hash(f)]));
  for(const [f,data]of Object.entries(b.sources)){
    const to=path.join(target,f);fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(dir+'/prototype/modified/'+f,to);
    fs.copyFileSync(dir+'/'+data.backup,to);assert.equal(hash(to),data.sha256);
  }
  for(const [f,sha]of Object.entries(before))assert.equal(hash(f),sha);
  console.log('ROLLBACK originals_restored=6 active_unchanged=1');
}else if(mode==='rollback'){
  const destinations=f=>f.startsWith('plugins/naumi-enterprise/')?[f,f.replace('plugins/naumi-enterprise/','.dsh/profiles/web/node_modules/@naumi/dsh-enterprise/')]:[f];
  for(const [f,data]of Object.entries(b.sources))for(const to of destinations(f))if(fs.existsSync(to)){
    const expected=fs.readFileSync(dir+'/'+data.backup,'utf8').replaceAll('\r\n','\n');
    const failed=fs.readFileSync(dir+'/prototype/modified/'+f,'utf8').replaceAll('\r\n','\n');
    assert([expected,failed].includes(fs.readFileSync(to,'utf8').replaceAll('\r\n','\n')),'Later edits detected: '+to);
  }
  for(const [f,data]of Object.entries(b.sources))for(const to of destinations(f))if(fs.existsSync(to))fs.writeFileSync(to,fs.readFileSync(dir+'/'+data.backup));
  console.log('ROLLBACK original_sources=6 private_data_untouched=1 restart_required=1');
}else throw Error('Use baseline, modified, rollback-test or rollback');
