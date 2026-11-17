import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
export const REASONING_UPSTREAM_SHA='1a3ae58f9b4493e15459cc5000ec80f21b5d3f4a9dea6ffb6bc28e5b8817ae8a';
export const REASONING_EXTENSION='Naumi preserve provider reasoning default v1';
const sha=b=>createHash('sha256').update(b).digest('hex');
function transform(code){const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('REASONING_ANCHOR_CHANGED');code=code.replace(a,b);};
 replace('\treasoning: z.union(THINKING_LEVELS),','\treasoning: z.union(THINKING_LEVELS),\n\tpreserveReasoningDefault: z.boolean(),');
 replace('const reasoning = resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning);',`const reasoning = resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning);
            // ${REASONING_EXTENSION}: change only this request's model, never catalog or explicit off.
            const dispatchModel = profile.preserveReasoningDefault === true && reasoning === void 0 && model.reasoning
                ? {...model, thinkingLevelMap:{...model.thinkingLevelMap, off:null}} : model;`);
 replace('snapshot.models.streamSimple(model, context, {','snapshot.models.streamSimple(dispatchModel, context, {');return code;}
export function extendReasoningDefaults(original){
 if(sha(original)===REASONING_UPSTREAM_SHA)return transform(original);
 if(original.includes(REASONING_EXTENSION)){let restored=original.replace('\treasoning: z.union(THINKING_LEVELS),\n\tpreserveReasoningDefault: z.boolean(),','\treasoning: z.union(THINKING_LEVELS),').replace(`const reasoning = resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning);
            // ${REASONING_EXTENSION}: change only this request's model, never catalog or explicit off.
            const dispatchModel = profile.preserveReasoningDefault === true && reasoning === void 0 && model.reasoning
                ? {...model, thinkingLevelMap:{...model.thinkingLevelMap, off:null}} : model;`,'const reasoning = resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning);').replace('snapshot.models.streamSimple(dispatchModel, context, {','snapshot.models.streamSimple(model, context, {');if(sha(restored)===REASONING_UPSTREAM_SHA&&transform(restored)===original)return original;}
 throw Error('REASONING_UPSTREAM_CHANGED');
}
export function installReasoningDefaults(file){const before=fs.readFileSync(file,'utf8'),after=extendReasoningDefaults(before);if(before===after)return {changed:false,sha256:sha(after)};const backup=file+'.naumi-original';if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==REASONING_UPSTREAM_SHA)throw Error('REASONING_BACKUP_CHANGED');if(!fs.existsSync(backup))fs.writeFileSync(backup,before);const tmp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(tmp,after);fs.renameSync(tmp,file);return {changed:true,originalSHA256:sha(before),sha256:sha(after)};}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log('REASONING_EXTENSION '+JSON.stringify(installReasoningDefaults(path.resolve(process.argv[2]??'node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'))));
