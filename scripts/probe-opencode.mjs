import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { opencodeGoProvider } from '@earendil-works/pi-ai/providers/opencode-go';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';
const home = '.dsh/import-ccswitch/';
const candidates = JSON.parse(fs.readFileSync(home + 'candidates.json', 'utf8'));
const route = candidates.find(r => r.name === 'OpenCode Go');
const provider = opencodeGoProvider();
const results = [];
for (const requested of route.models) {
  const model = provider.getModels().find(m => m.id === requested.id);
  if (!model) { results.push({model:requested.id,valid:false,error:'not-in-installed-native-catalog'}); continue; }
  const response = await provider.streamSimple(model, normalizeContext({messages:[{role:'user',content:'Reply with OK only.',timestamp:Date.now()}]}), {
    apiKey:route.key, sessionId:randomUUID(), maxTokens:128, signal:AbortSignal.timeout(45000),
  }).result();
  const valid = !['error','aborted'].includes(response.stopReason) && response.content.length > 0;
  const result = {model:model.id,api:model.api,valid,stopReason:response.stopReason,error:response.errorMessage?.replaceAll(route.key,'[REDACTED]')};
  results.push(result); console.log(JSON.stringify(result));
}
fs.writeFileSync('evidence/ccswitch/opencode-native-probes.json', JSON.stringify(results,null,2)+'\n');
const valid = new Set(results.filter(r => r.valid).map(r => r.model));
const accepted = JSON.parse(fs.readFileSync(home+'accepted.json','utf8')).filter(r => r.id!==route.id);
if(valid.size) accepted.push({...route,id:'opencode-go',nativeCatalog:true,models:route.models.filter(m=>valid.has(m.id))});
fs.writeFileSync(home+'accepted.json',JSON.stringify(accepted,null,2)+'\n');
fs.writeFileSync('evidence/ccswitch/accepted.json',JSON.stringify(accepted.map(({key,...r})=>r),null,2)+'\n');
console.log(`OPENCODE_NATIVE valid=${valid.size} excluded=${results.length-valid.size}`);
