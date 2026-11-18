import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
export const SIDEBAR_SHA='45868a5ae021b850f6ee6451b6d1168d3c72ddea81b3073b6cfbbebaf23c5257';
export const DELIVERABLES_SHA='0aa3fc762aa1debf106a67dccfbb7a640f40de0c774a2b091a8ddc6730257da5';
const sha=s=>createHash('sha256').update(s).digest('hex');
const SIDEBAR_MARK='Naumi explicit panel Session v1',FILES_MARK='Naumi shared native deliverables v1';
function transform(original,expected,mark,edit){
 if(original.includes(mark))throw Error('NATIVE_DELIVERY_USE_ORIGINAL_FOR_TRANSFORM');
 if(sha(original)!==expected)throw Error('NATIVE_DELIVERY_UPSTREAM_CHANGED');
 let code=original;const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('NATIVE_DELIVERY_ANCHOR_CHANGED '+a.slice(0,70));code=code.replace(a,b);};
 edit(replace);return code;
}
/** Explicit leases only. Native views still own retain, persisted tabs, mount,
 * adoption, focus, resources and disposal. No external access to private maps. */
export function extendNativeSidebar(original){return transform(original,SIDEBAR_SHA,SIDEBAR_MARK,replace=>{
 replace('const views = new SidebarSessionViews(ctx.sessions);',`const views = new SidebarSessionViews(ctx.sessions);
            // ${SIDEBAR_MARK}
            const panelSessions = (0, _deepseek_ai_dsh_client_store.createSnapshotStore)({});
            const panelLeases = new Map();
            const registerPanelSession = (panelId, sessionId) => {
                if(!panelId || !sessionId)throw Error('SIDEBAR_PANEL_SESSION_REQUIRED');
                if(panelLeases.has(panelId))throw Error('SIDEBAR_PANEL_SESSION_IN_USE');
                const lease = {};panelLeases.set(panelId,lease);
                panelSessions.set({...panelSessions.getSnapshot(),[panelId]:sessionId});
                return () => {
                    if(panelLeases.get(panelId)!==lease)return;
                    panelLeases.delete(panelId);
                    const next={...panelSessions.getSnapshot()};delete next[panelId];panelSessions.set(next);
                };
            };`);
 replace('views.select(current.getSnapshot().key);',`const panelId=ctx.layout.panelInfo.getSnapshot().activePanelId;
                    views.select(panelId === null ? current.getSnapshot().key : panelSessions.getSnapshot()[panelId]);`);
 replace('const unsubscribe = current.subscribe(sync);',`const unsubscribe = current.subscribe(sync);
                const unsubscribePanel=ctx.layout.panelInfo.subscribe(sync);
                const unsubscribeLeases=panelSessions.subscribe(sync);`);
 replace('unsubscribe();\n\t\t\t\t\tviews.dispose();',`unsubscribe();unsubscribePanel();unsubscribeLeases();
                    panelLeases.clear();
                    views.dispose();`);
 replace('ctx.effect(() => ctx.slots.inject("contextMenu.icon",',`controller.registerPanelSession=registerPanelSession;
            ctx.effect(() => ctx.slots.inject("contextMenu.icon",`);
 replace('show(layout.panelInfo.getSnapshot().activePanelId === null ? selected?.sessionId : void 0);',`const panelId=layout.panelInfo.getSnapshot().activePanelId;
                    show(panelId === null || panelSessions.getSnapshot()[panelId] !== undefined ? selected?.sessionId : void 0);`);
 replace('function RightbarRoot({ usePanelInfo, useViews, ...props }) {\n\t\t\tconst visible = usePanelInfo((info) => info.activePanelId === null);',`function RightbarRoot({ usePanelInfo, useViews, usePanelSessions, ...props }) {
            const panelId=usePanelInfo(info=>info.activePanelId);
            const leases=usePanelSessions(value=>value);
            const visible=panelId===null || leases[panelId]!==undefined;`);
 replace('hooks: { views: views.source },\n\t\t\t\t\t\t\tmountView:', 'hooks: { views: views.source, panelSessions },\n\t\t\t\t\t\t\tmountView:');
 });}
/** One upstream spec/controller/component for both turn tails and group cards. */
export function extendNativeDeliverables(original){return transform(original,DELIVERABLES_SHA,FILES_MARK,replace=>{
 replace('return matched === null ? null : (0, react_jsx_runtime.jsx)(Deliverables, {\n\t\t\t\t...props,\n\t\t\t\tmatched\n\t\t\t});', `return matched === null ? null : props.renderFactorySlot('naumi.native.deliverables',{matched,openFile:props.openFile});`);
 replace('function Deliverables({ matched, openFile,', 'function Deliverables({ matched, previewPresented, openFile,');
 replace('openFile(file.path);', 'if(previewPresented)previewPresented(file);else openFile(file.path);');
 replace('ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({',`// ${FILES_MARK}
            const nativeDeliverablesSpec = {`);
 replace('}, DeliverablesTail));',`};
            ctx.slots.inject("conversation.chat.turnTail", () => ctx.slots.register({name:"conversation.chat.turnTail",id:"@deepseek-ai/dsh-client-ui-deliverables"}, DeliverablesTail));
            ctx.slots.inject("main", () => ctx.slots.registerFactory({
                ...nativeDeliverablesSpec,name:'naumi.native.deliverables',scope:'session'
            }, function SharedNativeDeliverables(props){
                const previewPresented=file=>{
                    void Promise.resolve().then(()=>props.resolvePreviewPath?.(file) ?? file.snapshot?.path ?? file.path)
                    .then(path=>ctx.sidebarRight.openResource(sessionFileAddress(props.sessionId,path)))
                    .catch(error=>props.onPreviewError ? props.onPreviewError(error) : console.error('File preview failed:',error));
                };
                return (0,react_jsx_runtime.jsx)(Deliverables,{...props,previewPresented:props.files ? previewPresented : undefined,matched:props.matched ?? {changes:null,presented:props.files}});
            }));`);
 });}
export function installNativeDelivery(file,kind){
 const extend=kind==='sidebar'?extendNativeSidebar:extendNativeDeliverables,expected=kind==='sidebar'?SIDEBAR_SHA:DELIVERABLES_SHA;
 const before=fs.readFileSync(file,'utf8'),backup=file+'.naumi-original';
 const original=sha(before)===expected?before:fs.existsSync(backup)?fs.readFileSync(backup,'utf8'):null;
 if(original===null||sha(original)!==expected)throw Error('NATIVE_DELIVERY_ORIGINAL_CHANGED');
 const after=extend(original);
 if(before===after)return {changed:false,sha256:sha(after)};
 if(sha(before)!==expected)throw Error('NATIVE_DELIVERY_EXTENSION_CHANGED');
 if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==expected)throw Error('NATIVE_DELIVERY_BACKUP_CHANGED');
 if(!fs.existsSync(backup))fs.writeFileSync(backup,before);
 const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,after);fs.renameSync(temp,file);
 return {changed:true,originalSHA256:expected,sha256:sha(after)};
}
export function installNativeDeliveryExtensions(root){return {
 sidebar:installNativeDelivery(path.join(root,'@deepseek-ai/dsh-client-ui-sidebar-right/lib/client.js'),'sidebar'),
 deliverables:installNativeDelivery(path.join(root,'@deepseek-ai/dsh-client-ui-deliverables/lib/client.js'),'deliverables')
};}
