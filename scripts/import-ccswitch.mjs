import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { parse } from 'yaml';
import { connect } from './harness-rpc.mjs';
const root=process.cwd(), pub=path.join(root,'evidence/ccswitch'), priv=path.join(root,'.dsh/import-ccswitch');
const active=path.join(root,'.dsh/profiles/web/cordis.patch.yml');
const credentials=path.join(root,'.dsh/.credentials.yaml');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const save=(p,d)=>fs.writeFileSync(p,JSON.stringify(d,null,2)+'\n');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const mode=process.argv[2];
const routes=read(path.join(priv,'accepted.json'));
if(mode==='baseline') {
  assert(!fs.existsSync(path.join(pub,'ORIGINAL.yml')),'Baseline already captured');
  fs.copyFileSync(active,path.join(pub,'ORIGINAL.yml'));
  fs.copyFileSync(credentials,path.join(priv,'credentials.original.yaml'));
  const rpc=await connect(), state=await rpc('settings/describe');
  const ns=state.namespaces.find(n=>n.ns==='llm-pi-ai');
  save(path.join(priv,'baseline-section.json'),ns.value);
  save(path.join(pub,'baseline.json'),{originalSHA256:sha(fs.readFileSync(active)),existingProviders:Object.keys(ns.value.providers),defaultModel:state.namespaces.find(n=>n.ns==='agent-default-model').value});
  console.log(`BASELINE groups=${Object.keys(ns.value.providers).length} original_sha256=${sha(fs.readFileSync(active))} default_preserved=1`);
} else if(mode==='apply') {
  const rpc=await connect(), state=await rpc('settings/describe');
  const ns=state.namespaces.find(n=>n.ns==='llm-pi-ai');
  const providers={...ns.value.providers};
  for(const r of routes) {
    assert(!providers[r.id],`Provider collision ${r.id}`);
    const ref='CCS_'+r.id.toUpperCase().replaceAll('-','_')+'_API_KEY';
    await rpc('credentials/set',{ref,value:r.key});
    providers[r.id]={displayName:`CC · ${r.name} / ${r.api==='openai-responses'?'Responses':'Messages'}`,apiKeyEnv:ref,api:r.api,baseURL:r.baseURL,models:r.models,defaultContextWindow:128000,defaultMaxTokens:16384};
  }
  await rpc('settings/replace',{ns:'llm-pi-ai',section:{...ns.value,providers},expectedRevision:ns.revision});
  fs.copyFileSync(active,path.join(pub,'MODIFIED_FILE.yml'));
  save(path.join(pub,'applied.json'),{groups:routes.length,models:routes.reduce((n,r)=>n+r.models.length,0),modifiedSHA256:sha(fs.readFileSync(active)),refs:routes.map(r=>providers[r.id].apiKeyEnv)});
  console.log(`MODIFIED groups=${routes.length} models=${routes.reduce((n,r)=>n+r.models.length,0)} credentials_saved=${routes.length} source_unchanged=1`);
} else if(mode==='finalize') {
  const outcomes=[...read(path.join(pub,'runtime-probes.json')),...read(path.join(pub,'runtime-extras.json'))];
  const passes=new Set(outcomes.filter(r=>r.valid).map(r=>r.group+'/'+r.model));
  const final=routes.map(r=>({...r,models:r.models.filter(m=>passes.has(r.id+'/'+m.id))})).filter(r=>r.models.length);
  const rpc=await connect(), state=await rpc('settings/describe');
  const ns=state.namespaces.find(n=>n.ns==='llm-pi-ai');
  const original=parse(fs.readFileSync(active,'utf8')).find(n=>n.id==='llm-pi-ai').config;
  const providers={...original.providers};
  for(const r of final) {
    const ref='CCS_'+r.id.toUpperCase().replaceAll('-','_')+'_API_KEY';
    if(!providers[r.id])await rpc('credentials/set',{ref,value:r.key});
    providers[r.id]={displayName:`CC · ${r.name} / ${r.api==='openai-responses'?'Responses':'Messages'}`,apiKeyEnv:ref,api:r.api,baseURL:r.baseURL,models:r.models,defaultContextWindow:128000,defaultMaxTokens:16384};
  }
  if(!fs.existsSync(path.join(pub,'MODIFIED_FILE.initial.yml')))fs.copyFileSync(path.join(pub,'MODIFIED_FILE.yml'),path.join(pub,'MODIFIED_FILE.initial.yml'));
  await rpc('settings/replace',{ns:'llm-pi-ai',section:{...original,providers},expectedRevision:ns.revision});
  fs.copyFileSync(active,path.join(pub,'MODIFIED_FILE.yml'));
  save(path.join(priv,'accepted.json'),final);
  save(path.join(pub,'accepted.json'),final.map(({key,...r})=>r));
  save(path.join(pub,'applied.json'),{groups:final.length,models:final.reduce((n,r)=>n+r.models.length,0),modifiedSHA256:sha(fs.readFileSync(active)),refs:final.map(r=>providers[r.id].apiKeyEnv)});
  console.log(`FINALIZED groups=${final.length} models=${final.reduce((n,r)=>n+r.models.length,0)} runtime_verified=1 unsuccessful_routes_excluded=1`);
} else if(mode==='verify') {
  const rpc=await connect(), state=await rpc('settings/describe');
  const ns=state.namespaces.find(n=>n.ns==='llm-pi-ai');
  const raw=parse(fs.readFileSync(active,'utf8')).find(n=>n.id==='llm-pi-ai').config.providers;
  const refs=routes.map(r=>raw[r.id].apiKeyEnv);
  const status=await rpc('credentials/describe',{refs});
  for(const ref of refs) assert.equal(status[ref].configured,true,ref);
  for(const r of routes) assert.equal(ns.value.providers[r.id].models.length,r.models.length);
  const outcomes=[...read(path.join(pub,'runtime-probes.json')),...read(path.join(pub,'runtime-extras.json'))];
  for(const r of routes)for(const m of r.models)assert(outcomes.some(x=>x.group===r.id&&x.model===m.id&&x.valid),'Missing real Harness proof '+r.id+'/'+m.id);
  assert.deepEqual(state.namespaces.find(n=>n.ns==='agent-default-model').value,read(path.join(pub,'baseline.json')).defaultModel);
  const old=parse(fs.readFileSync(path.join(priv,'credentials.original.yaml'),'utf8'));
  const current=parse(fs.readFileSync(credentials,'utf8'));
  for(const [k,v] of Object.entries(old.records??{})) assert.deepEqual(current.records[k],v);
  for(const [k,v] of Object.entries(old.refs??{})) assert.equal(current.refs[k],v);
  const catalog=await rpc('session/modelCatalog');
  save(path.join(pub,'runtime-catalog.json'),catalog);
  console.log(`RUNTIME groups=${routes.length} models=${routes.reduce((n,r)=>n+r.models.length,0)} credentials=${refs.length} defaults_preserved=1 previous_credentials_preserved=1`);
} else if(mode==='rollback-test') {
  const target=path.join(pub,'rollback-test.yml');
  fs.copyFileSync(path.join(pub,'MODIFIED_FILE.yml'),target);
  // Restore a separate profile and credentials copy; the running profile is never touched.
  fs.copyFileSync(credentials,path.join(priv,'credentials.rollback-test.yaml'));
  fs.copyFileSync(path.join(pub,'ORIGINAL.yml'),target);
  fs.copyFileSync(path.join(priv,'credentials.original.yaml'),path.join(priv,'credentials.rollback-test.yaml'));
  assert.equal(sha(fs.readFileSync(target)),read(path.join(pub,'baseline.json')).originalSHA256);
  assert.equal(sha(fs.readFileSync(path.join(priv,'credentials.rollback-test.yaml'))),sha(fs.readFileSync(path.join(priv,'credentials.original.yaml'))));
  assert.equal(sha(fs.readFileSync(active)),read(path.join(pub,'applied.json')).modifiedSHA256);
  console.log('ROLLBACK profile_restored=1 credentials_restored=1 original_hash_match=1 active_still_modified=1');
} else if(mode==='rollback') {
  const applied=read(path.join(pub,'applied.json'));
  assert.equal(sha(fs.readFileSync(active)),applied.modifiedSHA256,'Later profile edits detected; do not overwrite');
  const stored=parse(fs.readFileSync(credentials,'utf8'));
  for(const route of routes) {
    const ref='CCS_'+route.id.toUpperCase().replaceAll('-','_')+'_API_KEY';
    assert.equal(stored.refs?.[ref],route.key,'An imported credential changed later; do not remove it');
  }
  const rpc=await connect(), state=await rpc('settings/describe');
  const ns=state.namespaces.find(n=>n.ns==='llm-pi-ai');
  await rpc('settings/replace',{ns:'llm-pi-ai',section:read(path.join(priv,'baseline-section.json')),expectedRevision:ns.revision});
  for(const ref of applied.refs) await rpc('credentials/unset',{ref});
  console.log('ROLLBACK imported_groups_removed=1 imported_credentials_removed=1 original_defaults_preserved=1');
} else throw Error('Use baseline, apply, finalize, verify, rollback-test or rollback');
