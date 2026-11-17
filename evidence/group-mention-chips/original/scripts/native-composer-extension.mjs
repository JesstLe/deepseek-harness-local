import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const NATIVE_COMPOSER_SHA='9a37949cc76603ea3a965ce4d0d6ca65885de4a9808345c38748e595ac396378';
export const PATCHED_COMPOSER_SHA='c38cc967d672238279fbcad9aee94fa85b380dbcd58d1be8826521d3e5065cda';
export const COMPOSER_EXTENSION='Naumi scoped composer transport v1';
const sha=value=>createHash('sha256').update(value).digest('hex');

/** Pinned upstream extension, NOT another editor. The native InputBar, Lexical
 * editor, submit machine, uploads, slots, model control and queue remain owned
 * by ui-conversation. Only an explicit Session-scoped transport can opt in. */
export function extendNativeComposer(original){
  if(original.includes(COMPOSER_EXTENSION)){if(sha(original)!==PATCHED_COMPOSER_SHA)throw Error('NATIVE_COMPOSER_EXTENSION_CHANGED');return original;}
  if(sha(original)!==NATIVE_COMPOSER_SHA)throw Error('NATIVE_COMPOSER_UPSTREAM_CHANGED');
  let code=original;
  const replace=(a,b)=>{if(code.split(a).length!==2)throw Error('NATIVE_COMPOSER_ANCHOR_CHANGED');code=code.replace(a,b);};
  replace('this.input = config.input;',`this.input = config.input;
                // ${COMPOSER_EXTENSION}
                this.composerTransports = new Map();
                ctx.effect(() => () => this.composerTransports.clear());`);
  replace('async sendSession(session, text, attachmentIds, mode, signal, accept) {',`registerComposerTransport(sessionId, transport) {
                if(this.composerTransports.has(sessionId))throw Error('COMPOSER_TRANSPORT_IN_USE');
                this.composerTransports.set(sessionId, transport);
                return () => {if(this.composerTransports.get(sessionId) === transport)this.composerTransports.delete(sessionId);};
            }
            async sendSession(session, text, attachmentIds, mode, signal, accept) {
                const transport = this.composerTransports.get(session.sessionId);
                if(transport){
                    const {attachments} = await this.serializeDraftAttachments(attachmentIds,true);
                    signal?.throwIfAborted();
                    const result = await transport.submit({text, attachments, mode, signal});
                    if(result.kind === 'success'){
                        accept?.();
                        for(const id of attachmentIds)this.releaseDraftAttachment(id);
                    }
                    return result;
                }`);
  replace('const result = await this.scopedSession("cancel").cancel();',`const transport = this.composerTransports.get(this.scopeId("cancel"));
                if(transport)return transport.cancel();
                const result = await this.scopedSession("cancel").cancel();`);
  replace('async serializeDraftAttachments(attachmentIds) {','async serializeDraftAttachments(attachmentIds, preferReceipts=false) {');
  replace('return { attachments: await Promise.all(attachments.map(async (attachment) => {',`return { attachments: await Promise.all(attachments.map(async (attachment) => {
                    if(preferReceipts && uploads[attachment.id]?.status === 'ready')return {type:'file',receiptId:uploads[attachment.id].receiptId};`);
  replace('const registerComposerBar = () => slots.register({','const nativeComposerSpec = {');
  replace('}, InputBar);\n\t\t\tslots.inject("main", function* () {',`};
            const registerComposerBar = () => slots.register({name:'conversation.composer.bar'},
                function NativeComposerSeat({renderFactorySlot,variant,blocked,disabled,workspacePickerOpen,onRequestWorkspace,placeholder,accessory}){
                    return renderFactorySlot('naumi.native.composer.bar',{variant,blocked,disabled,workspacePickerOpen,onRequestWorkspace,placeholder,accessory});
                });
            const registerSharedComposer = () => slots.registerFactory({
                ...nativeComposerSpec, name:'naumi.native.composer.bar', scope:'session-maybe'
            }, function SharedNativeComposer(props){
                const useNativeSession=props.useSession;
                const useSession=selector=>useNativeSession(s=>selector(s===void 0?s:{...s,running:props.groupBusy ?? s.running}));
                return (0, react_jsx_runtime.jsx)(InputBar,{...props,useSession});
            });
            const registerGroupComposer = () => slots.registerFactory({
                name:'naumi.group.composer',scope:'session',store:conversationStore,
                inject:sessionId=>({bindGroupDraft:write=>inputHub.shell(sessionId).bindDraftPersistence(write)})
            }, function GroupComposerBridge({renderFactorySlot,bindGroupDraft,actions,inputActions,groupBusy,placeholder,accessory}){
                (0,react.useEffect)(()=>{const unbind=bindGroupDraft(actions.setDraft);inputActions.persistDraft();return unbind;},[inputActions,actions]);
                return renderFactorySlot('naumi.native.composer.bar',{variant:'composer',groupBusy,placeholder,accessory});
            });
            slots.inject("main", function* () {`);
  replace('yield registerComposerBar();','yield registerSharedComposer();\n                yield registerGroupComposer();\n                yield registerComposerBar();');
  return code;
}

/** Atomic replacement breaks package-manager hardlinks; never writes a shared
 * inode. Keep a byte-identical sibling backup and reject unknown upstreams. */
export function installNativeComposer(file){
  const before=fs.readFileSync(file,'utf8'),after=extendNativeComposer(before);
  if(before===after)return {changed:false,sha256:sha(after)};
  const backup=file+'.naumi-original';
  if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==NATIVE_COMPOSER_SHA)throw Error('NATIVE_COMPOSER_BACKUP_CHANGED');
  if(!fs.existsSync(backup))fs.writeFileSync(backup,before);
  const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,after);fs.renameSync(temp,file);
  return {changed:true,originalSHA256:sha(before),sha256:sha(after),backup};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const file=path.resolve(process.argv[2]??'node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js');
  console.log('NATIVE_COMPOSER_EXTENSION '+JSON.stringify(installNativeComposer(file)));
}
