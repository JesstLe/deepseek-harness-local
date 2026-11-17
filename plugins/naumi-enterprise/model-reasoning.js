import fs from 'node:fs';
export const reasoningSpecs=JSON.parse(fs.readFileSync(new URL('./official-reasoning-specs.json',import.meta.url),'utf8'));
export const reasoningLevels=['off','minimal','low','medium','high','xhigh','max'];
const fail=code=>{throw Object.assign(Error(code),{code,status:400});};
export function reasoningSpec(id,api){const spec=reasoningSpecs.models.find(m=>m.id===id);return spec&&['anthropic-messages','openai-responses','openai-completions'].includes(api)?{...spec,mode:api==='anthropic-messages'?'adaptive':'native'}:null;}
export function validateEfforts(value){if(value===false)return false;if(!value||typeof value!=='object'||Array.isArray(value)||!Object.keys(value).some(k=>k!=='off'))fail('MODEL_REASONING_INVALID');const out={};for(const [k,v]of Object.entries(value)){if(!reasoningLevels.includes(k)||!(typeof v==='string'&&v.length>0&&v.length<=40&&/^[a-z0-9_-]+$/.test(v)||k==='off'&&v===null))fail('MODEL_REASONING_INVALID');out[k]=v;}return out;}
export function configureReasoning(input,configured,api){const next={...configured};delete next.reasoningPreset;delete next.reasoningMode;let efforts,mode;
 if(input.reasoningPreset==='inherit'){delete next.reasoningEfforts;return next;}
 if(input.reasoningPreset==='disabled')efforts=false;
 if(input.reasoningPreset==='official'){const spec=reasoningSpec(input.id,api);if(!spec)fail('MODEL_REASONING_UNVERIFIED');efforts=spec.efforts;mode=spec.mode;}
 if(input.reasoningEfforts!==undefined){if(input.reasoningPreset&&input.reasoningPreset!=='custom')fail('MODEL_REASONING_INVALID');efforts=validateEfforts(input.reasoningEfforts);mode=input.reasoningMode;}
 if(efforts!==undefined)next.reasoningEfforts=structuredClone(efforts);
 if(mode==='adaptive'){if(api!=='anthropic-messages')fail('MODEL_REASONING_PROTOCOL');next.compat={...next.compat,forceAdaptiveThinking:true};}
 if(mode==='budget'||mode==='native'){if(mode==='budget'&&api!=='anthropic-messages'||mode==='native'&&api==='anthropic-messages')fail('MODEL_REASONING_PROTOCOL');if(next.compat&&Object.hasOwn(next.compat,'forceAdaptiveThinking')){next.compat={...next.compat};delete next.compat.forceAdaptiveThinking;}}
 return next;
}
export function reasoningView(model,api){const declared=model.reasoningEfforts;return {...declared===undefined?{}:{reasoningEfforts:structuredClone(declared)},reasoningMode:api==='anthropic-messages'?(model.compat?.forceAdaptiveThinking?'adaptive':'budget'):'native',reasoningOfficial:reasoningSpec(model.id,api)};}
export function validateDefault(profile,level){if(level===undefined||level===null)return;for(const m of profile.models??[]){const efforts=m.reasoningEfforts;if(!efforts||!Object.hasOwn(efforts,level))fail('MODEL_REASONING_DEFAULT_UNSUPPORTED');}}
