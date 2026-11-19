import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {parse} from 'yaml';
const hash=b=>createHash('sha256').update(b).digest('hex');
export const TRIAL_ALIAS='claude fable5.2';
export const allowedTrialModel=id=>/^gpt-/i.test(id)||id==='deepseek-flash';
export function selectTrialModels(providers,credentials){
 const selected={},access={},originalRefs={};
 const available=Object.entries(providers??{}).filter(([,p])=>typeof credentials[p.apiKeyEnv]==='string'&&credentials[p.apiKeyEnv]);
 const gpt=available.find(([id,p])=>id==='ccs-codex-gpt-2f6b6a'&&(p.models??[]).some(m=>/^gpt-/i.test(m.id)))??available.find(([,p])=>(p.models??[]).some(m=>/^gpt-/i.test(m.id)));
 const flash=available.find(([id,p])=>id==='ccs-deepseek-992333'&&(p.models??[]).some(m=>m.id==='deepseek-flash'))??available.find(([,p])=>(p.models??[]).some(m=>m.id==='deepseek-flash'));
 if(!gpt||!flash)throw Error('TRIAL_CREDENTIAL_MISSING_OR_MODEL_FAMILIES_REQUIRED');
 // Each family owns exactly one existing route. Never merge models across endpoints.
 // If one source contains both families, make an explicit second route with identical
 // endpoint/credentials rather than accidentally blending unrelated providers.
 const families=[{row:gpt,name:'openai',accept:id=>/^gpt-/i.test(id)},{row:flash,name:'claude',accept:id=>id==='deepseek-flash'}];
 for(const family of families){
  const [sourceId,p]=family.row,id=sourceId===gpt[0]&&sourceId===flash[0]&&family.name==='claude'?sourceId+'-flash':sourceId;
  const seen=new Set(),models=(p.models??[]).filter(m=>family.accept(m.id)&&!seen.has(m.id)&&seen.add(m.id));
  if(!['openai-responses','openai-completions','anthropic-messages'].includes(p.api))throw Error('TRIAL_PROTOCOL_UNSUPPORTED');
  const url=new URL(p.baseURL);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw Error('TRIAL_ENDPOINT_INVALID');
  const key=credentials[p.apiKeyEnv];if(typeof key!=='string'||!key||/[\r\n\x00]/.test(key))throw Error('TRIAL_CREDENTIAL_MISSING '+id);
  const ref='NAUMI_TRIAL_ACTIVE_'+randomBytes(12).toString('hex').toUpperCase();
  selected[id]={...structuredClone(p),models:structuredClone(models)};access[ref]=key;originalRefs[p.apiKeyEnv]=key;
  selected[id].trialActiveRef=ref;selected[id].trialDisplayName=family.name;
 }
 if(!Object.values(selected).some(p=>p.models.some(m=>m.id==='deepseek-flash'))||!Object.values(selected).some(p=>p.models.some(m=>/^gpt-/i.test(m.id))))throw Error('TRIAL_MODEL_FAMILIES_REQUIRED');
 const original=Object.fromEntries(Object.entries(selected).map(([id,p])=>{const {trialActiveRef,trialDisplayName,...rest}=p;return[id,rest];}));
 const active=Object.fromEntries(Object.entries(selected).map(([id,p])=>{const {trialActiveRef,trialDisplayName,...rest}=p;return[id,{...rest,displayName:trialDisplayName,apiKeyEnv:trialActiveRef,models:rest.models.map(m=>m.id==='deepseek-flash'?{...m,name:TRIAL_ALIAS}:m)}];}));
 const deepseek=Object.entries(original).find(([,p])=>p.models.some(m=>m.id==='deepseek-flash'));
 return {original,active,access,initial:{version:1,records:{},refs:originalRefs},selection:{provider:deepseek[0],model:'deepseek-flash'}};
}
export function exportTrialInput(home,destination){
 home=fs.realpathSync(home);let llm;
 const inputs=['cordis.patch.yml','profiles/web/cordis.patch.yml','.credentials.yaml'];
 const before=Object.fromEntries(inputs.map(f=>[f,hash(fs.readFileSync(path.join(home,f)))]));
 for(const file of inputs.slice(0,2)){const rows=parse(fs.readFileSync(path.join(home,file),'utf8'));for(const row of rows??[])if(row.id==='llm-pi-ai')llm=row.config;}
 if(!llm)throw Error('TRIAL_NO_LOCAL_CONNECTIONS');
 const credentials=parse(fs.readFileSync(path.join(home,'.credentials.yaml'),'utf8'));
 const value=selectTrialModels(llm.providers,credentials.refs);
 fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,JSON.stringify(value),{flag:'wx',mode:0o600});
 for(const f of inputs)if(hash(fs.readFileSync(path.join(home,f)))!==before[f])throw Error('TRIAL_SOURCE_CHANGED');
 return {groups:Object.keys(value.original).length,models:Object.values(value.original).reduce((n,p)=>n+p.models.length,0),sourceUnchanged:true,privateInput:destination};
}
export function stageTrialModels(staged,input){
 const value=JSON.parse(fs.readFileSync(input));
 // Revalidate exported input without trusting arbitrary extra overlay operations.
 const flat=Object.values(value.original??{}).flatMap(p=>p.models??[]);
 if(!flat.length||flat.some(m=>!allowedTrialModel(m.id)))throw Error('TRIAL_UNEXPECTED_MODEL');
 for(const[id,p]of Object.entries(value.original)){
  const active=value.active?.[id];if(!active||!value.access?.[active.apiKeyEnv]||value.initial?.refs?.[p.apiKeyEnv]!==value.access[active.apiKeyEnv])throw Error('TRIAL_INPUT_INTEGRITY');
  const family=p.models.every(m=>/^gpt-/i.test(m.id))?'openai':p.models.length===1&&p.models[0].id==='deepseek-flash'?'claude':null;
  if(!family)throw Error('TRIAL_MIXED_GROUP');
  const expected={...p,displayName:family,apiKeyEnv:active.apiKeyEnv,models:p.models.map(m=>m.id==='deepseek-flash'?{...m,name:TRIAL_ALIAS}:m)};
  if(JSON.stringify(expected)!==JSON.stringify(active))throw Error('TRIAL_ALIAS_CHANGED_ROUTE');
 }
 if(Object.keys(value.original).length!==Object.keys(value.active).length)throw Error('TRIAL_INPUT_INTEGRITY');
 if(Object.keys(value.active).length!==2||new Set(Object.values(value.active).map(p=>p.displayName)).size!==2||new Set(flat.map(m=>m.id)).size!==flat.length)throw Error('TRIAL_TWO_GROUPS_REQUIRED');
 const defaults=path.join(staged,'defaults'),write=(file,obj)=>{const bytes=Buffer.from(JSON.stringify(obj,null,2)+'\n');fs.writeFileSync(path.join(defaults,file),bytes,{mode:0o600});return hash(bytes);};
 const overlay=[{id:'ui-settings-general',disabled:true},{id:'llm-pi-ai',config:{providers:value.active}},{id:'agent-default-model',config:value.selection}];
 const fresh=[{id:'ui-settings-general',config:{welcomeNoticeVersion:'2026-09-28.1'}},{id:'llm-pi-ai',config:{providers:value.original}},{id:'agent-default-model',config:value.selection}];
 return {version:1,overlaySHA256:write('internal-trial.patch.json',overlay),accessSHA256:write('internal-trial-access.json',value.access),initialSHA256:write('internal-trial-initial.json',value.initial),profileSHA256:write('profile.yml',fresh),groups:Object.keys(value.original).length,models:flat.length,settingsHidden:true,displayAlias:TRIAL_ALIAS,upstreamModel:'deepseek-flash',upgradeChannel:'latest',persistentRestrictions:false};
}
