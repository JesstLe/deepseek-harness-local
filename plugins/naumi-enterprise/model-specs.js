import fs from 'node:fs';
export const officialModelSpecs=JSON.parse(fs.readFileSync(new URL('./official-model-specs.json',import.meta.url),'utf8'));
const catalog=new Map(officialModelSpecs.models.map(row=>[row.id,Object.freeze(row)]));
export const officialSpec=id=>catalog.get(id)??null;
const fail=code=>{throw Object.assign(new Error(code),{code,status:400});};
const capacity=(m,p)=>({contextWindow:m?.contextWindow??p.defaultContextWindow??1000000,maxTokens:m?.maxTokens??p.defaultMaxTokens??128000});
export function modelSpecView(model,provider={}){
 const spec=officialSpec(model.id),configured=capacity(model,provider);
 return {...model,...configured,official:spec,contextLimit:spec?Math.min(spec.contextWindow,spec.maxInputTokens?spec.maxInputTokens+configured.maxTokens:Infinity):configured.contextWindow,outputLimit:spec?.maxOutputTokens??null};
}
/** Exact IDs only. Documented limits and connection budgets remain distinct. */
export function configureModelSpec(input,previous,provider={}, {reset=false}={}){
 const spec=officialSpec(input.id),old=capacity(previous,provider),result={...previous,...input};
 if(!spec){
  if(input.contextWindow!==undefined&&(!previous||input.contextWindow>old.contextWindow))fail('MODEL_SPEC_UNVERIFIED');

  if(input.contextWindow!==undefined||input.maxTokens!==undefined){const c=input.contextWindow??old.contextWindow,o=input.maxTokens??old.maxTokens;if(!Number.isSafeInteger(c)||!Number.isSafeInteger(o)||c<1||o<1||o>=c)fail('MODEL_TOKEN_BUDGET');}
  return result;
 }
 const outLimit=spec.maxOutputTokens??(spec.contextWindow-1);
 let output=input.maxTokens??old.maxTokens;
 if(input.maxTokens!==undefined&&!reset&&output>outLimit)fail('MODEL_OUTPUT_RANGE');
 output=Math.min(output,outLimit);
 if(output>=spec.contextWindow&&input.maxTokens===undefined)output=Math.max(1,Math.floor(spec.contextWindow/2));
 const contextLimit=Math.min(spec.contextWindow,spec.maxInputTokens?spec.maxInputTokens+output:Infinity);
 let context=input.contextWindow??(reset&&!spec.conditional?contextLimit:previous?.contextWindow??(spec.conditional?old.contextWindow:contextLimit));
 if(input.contextWindow!==undefined&&!reset&&context>contextLimit)fail('MODEL_CONTEXT_RANGE');
 context=Math.min(context,contextLimit);
 if(!Number.isSafeInteger(context)||!Number.isSafeInteger(output)||context<1||output<1||output>=context)fail('MODEL_TOKEN_BUDGET');
 result.contextWindow=context;result.maxTokens=output;
 return result;
}
export function refreshModelSpecs(providers){
 const changes=[],unknown=[],conditional=[];
 for(const[id,p]of Object.entries(providers)){
  if(!Array.isArray(p.models))continue;
  const models=p.models.map(m=>{
   const spec=officialSpec(m.id);if(!spec){unknown.push({group:id,model:m.id});return m;}if(spec.conditional)conditional.push({group:id,model:m.id});
   const next=configureModelSpec({id:m.id},m,p,{reset:true});
   if(next.contextWindow!==m.contextWindow||next.maxTokens!==m.maxTokens)changes.push({group:id,model:m.id,before:capacity(m,p),after:capacity(next,p),source:spec.source});return next;
  });
  if(models.some((m,i)=>m!==p.models[i]&&(m.contextWindow!==p.models[i].contextWindow||m.maxTokens!==p.models[i].maxTokens)))providers={...providers,[id]:{...p,models}};
 }
 return {providers,changes,unknown,conditional};
}
