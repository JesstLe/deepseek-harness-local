import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';import {pathToFileURL} from 'node:url';
export const INPUT_TRIGGER_SHA='3f57b79e1f5f9a2378caadba05c3fead8baf1aa4dc80e3ffcd3718774f0b887f';
export const LEGACY_AGENT_TRIGGER_SHA='0614b5c819a88e9bd363bbca4f89ce4b56ad51eaa8729c87b91586c2024f0713';
export const AGENT_TRIGGER_SHA='a833af7291b1a7316432705d5e1767d5323ecf8783b49bc3acff8b4f9ebd2456';
export const AGENT_TRIGGER_EXTENSION='Naumi Session trigger policy v1';
const sha=s=>createHash('sha256').update(s).digest('hex');
/** Add only a Session-scoped provider/detection extension. The native menu,
 * focus, async cancellation, IME arbitration, revision CAS, Lexical insertion
 * and undo remain untouched. Unregistered Sessions keep the upstream grammar. */
export function extendAgentTriggers(original){
 if(original.includes(REFERENCE_SOURCE_EXTENSION)){if(sha(original)!==AGENT_TRIGGER_SHA)throw Error('AGENT_TRIGGER_EXTENSION_CHANGED');return original;}
 if(sha(original)===LEGACY_AGENT_TRIGGER_SHA)return extendReferenceSource(original);
 if(sha(original)!==INPUT_TRIGGER_SHA)throw Error('AGENT_TRIGGER_UPSTREAM_CHANGED');let code=original;
 const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('AGENT_TRIGGER_ANCHOR_CHANGED');code=code.replace(a,b);};
 replace('sources: [],\n\t\t\t\tcontrollers:',`sources: [],\n                // ${AGENT_TRIGGER_EXTENSION}\n                sessionTriggers: new Map(),\n\t\t\t\tcontrollers:`);
 replace('super(ctx, "inputTriggers");',`super(ctx, "inputTriggers");\n                ctx.effect(()=>()=>this.live.sessionTriggers.clear());`);
 replace('registerSource(src) {',`registerSessionTrigger(sessionId, policy) {
                const {live}=this;
                if(live.sessionTriggers.has(sessionId))throw Error('SESSION_TRIGGER_IN_USE');
                if(policy.trigger!=='@'||typeof policy.detect!=='function'||!policy.source)throw Error('SESSION_TRIGGER_INVALID');
                const dismiss=()=>{const binding=this.sessions().binding(sessionId);if(binding)live.controllers.get(binding)?.dismiss();};
                live.sessionTriggers.set(sessionId,policy);dismiss();
                return ()=>{if(live.sessionTriggers.get(sessionId)===policy){dismiss();live.sessionTriggers.delete(sessionId);}};
            }
            registerSource(src) {`);
 replace('const raw = detectTrigger(draft, caret, guard);',`const raw = this.deps.detect ? this.deps.detect(draft,caret,guard,draftRev) : detectTrigger(draft,caret,guard);`);
 replace('sessionId: id,\n\t\t\t\t\troster:',`sessionId: id,
                    detect:(draft,caret,guard,rev)=>{
                        const policy=live.sessionTriggers.get(id),hit=policy?.detect(draft,caret,guard,rev);
                        return hit===undefined?detectTrigger(draft,caret,guard):hit;
                    },
\t\t\t\t\troster:`);
 replace('live.sources.filter((s) => s.trigger === trigger)',`live.sources.filter((s) => s.trigger === trigger && (trigger!=='@'||!live.sessionTriggers.has(id)||s.name===live.sessionTriggers.get(id).source))`);
 return extendReferenceSource(code);
}
export const REFERENCE_SOURCE_EXTENSION='Naumi source reference presentation v1';
function extendReferenceSource(original){
 let code=original;const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('REFERENCE_SOURCE_ANCHOR_CHANGED');code=code.replace(a,b);};
 replace('serializeReference(source, ref, signal) {',`// ${REFERENCE_SOURCE_EXTENSION}
            renderReference(reference) {
                const owner=this.deps.roster.all().find(s=>s.name===reference.source);
                return owner?.renderReference?.(this.project(),reference);
            }
            serializeReference(source, ref, signal) {`);
 replace('if (owner?.codec === void 0) return Promise.reject',`if(owner?.serializeReference)return owner.serializeReference(this.project(),ref,signal);
                if (owner?.codec === void 0) return Promise.reject`);
 return code;
}
export function installAgentTriggers(file){
 const before=fs.readFileSync(file,'utf8'),after=extendAgentTriggers(before);if(before===after)return {changed:false,sha256:sha(after)};
 const backup=file+'.naumi-original';if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==INPUT_TRIGGER_SHA)throw Error('AGENT_TRIGGER_BACKUP_CHANGED');if(!fs.existsSync(backup))fs.writeFileSync(backup,before);
 const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,after);fs.renameSync(temp,file);return {changed:true,originalSHA256:sha(before),sha256:sha(after)};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log('AGENT_TRIGGER_EXTENSION '+JSON.stringify(installAgentTriggers(path.resolve(process.argv[2]??'node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js'))));
