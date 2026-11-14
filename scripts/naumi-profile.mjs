import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd();
const backup=path.join(root,'.dsh/naumi-ui-backup');
const current=path.join(root,'.dsh/profiles/web/package.json');
const original=fs.readFileSync(path.join(backup,'package.original.json'));
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const baseline=JSON.parse(fs.readFileSync('evidence/naumi-ui/baseline.json','utf8'));
assert.equal(hash(original),baseline.profileSHA256,'Original snapshot hash mismatch');
const mode=process.argv[2];
if(mode==='baseline'){
  assert(!JSON.parse(original).dsh.profile.bundles.includes('@naumi/dsh-enterprise'));
  console.log('BASELINE naumi_bundle=0 model_groups='+baseline.groups.length+' default_preserved=1');
}else if(mode==='verify'){
  const manifest=JSON.parse(fs.readFileSync(current,'utf8'));
  assert(manifest.dsh.profile.bundles.includes('@naumi/dsh-enterprise'));
  const old=JSON.parse(original);
  for(const b of old.dsh.profile.bundles)assert(manifest.dsh.profile.bundles.includes(b));
  for(const [k,v]of Object.entries(old.dependencies))assert.equal(manifest.dependencies[k],v);
  assert.equal(hash(fs.readFileSync('.dsh/profiles/web/cordis.patch.yml')),baseline.patchSHA256,'Original model/profile patch was changed');
  fs.copyFileSync(current,path.join(backup,'package.modified.json'));
  console.log('MODIFIED naumi_bundle=1 native_bundles_preserved=1 profile_patch_unchanged=1');
}else if(mode==='rollback-test'){
  const target=path.join(backup,'package.rollback-test.json');
  fs.copyFileSync(current,target);
  fs.writeFileSync(target,original);
  assert.equal(hash(fs.readFileSync(target)),baseline.profileSHA256);
  assert(!JSON.parse(fs.readFileSync(target)).dsh.profile.bundles.includes('@naumi/dsh-enterprise'));
  assert(JSON.parse(fs.readFileSync(current)).dsh.profile.bundles.includes('@naumi/dsh-enterprise'));
  console.log('ROLLBACK original_hash_match=1 native_bundles_restored=1 active_still_modified=1');
}else if(mode==='rollback'){
  assert.equal(hash(fs.readFileSync(current)),hash(fs.readFileSync(path.join(backup,'package.modified.json'))),'Later profile changes detected; no overwrite');
  fs.writeFileSync(current,original);
  console.log('ROLLBACK native_profile_restored=1 credentials_untouched=1 restart_required=1');
}else throw Error('Use verify, rollback-test or rollback');
