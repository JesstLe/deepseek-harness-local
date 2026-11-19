import fs from 'node:fs';import path from 'node:path';import{createHash,randomUUID}from'node:crypto';import{pathToFileURL}from'node:url';
export const SIDEBAR_UPSTREAM_SHA='bb31f7870381f737b2cb45db4c7911a08a4949856bc86b648a10d3e85a3e9f89';
const sha=b=>createHash('sha256').update(b).digest('hex');
/** Per native workspace service, not global interception or a second store. */
export function createSidebarVisibility(){
 const sources=new Set(),listeners=new Set();let snapshot={waiting:false,sessionIds:[],workspaceIds:[]};
 const publish=()=>{const sessions=new Set(),workspaces=new Set();let waiting=false;for(const row of sources){const s=row.source.getSnapshot();waiting||=!!s.waiting;for(const id of s.sessionIds??[])sessions.add(id);for(const id of s.workspaceIds??[])workspaces.add(id);}snapshot={waiting,sessionIds:[...sessions],workspaceIds:[...workspaces]};for(const listener of listeners)listener();};
 return{getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},register(source){const row={source,stop:null};sources.add(row);row.stop=source.subscribe(publish);publish();let closed=false;return()=>{if(closed)return;closed=true;row.stop();sources.delete(row);publish();};}};
}
/** Presentation only; input stores, ordering, selection and retention untouched. */
export function sidebarProjection(list,workspaces,visibility){
 const hidden=new Set(visibility.sessionIds),hiddenWorkspaces=new Set(visibility.workspaceIds),visible=id=>!visibility.waiting&&!hidden.has(id);
 const byId=Object.fromEntries(Object.entries(list.byId).filter(([id])=>visible(id)));
 return{list:{...list,ids:list.ids.filter(visible),byId},workspaces:visibility.waiting?[]:workspaces.filter(w=>!hiddenWorkspaces.has(w.workspaceId)).map(w=>({...w,sessionIds:w.sessionIds.filter(visible)})),visible};
}
const edits=[
 ['function apply(ctx) {',`// Naumi native sidebar visibility v1: public, scoped, read-only presentation seam.\n\t\t${createSidebarVisibility.toString()}\n\t\t${sidebarProjection.toString()}\n\t\tfunction apply(ctx) {`],
 ['const uiWorkspace = new UiWorkspaceService(ctx, ctx.remote.directoryPicker, workspaces, sessions, viewInstance.actions, notify);',`const uiWorkspace = new UiWorkspaceService(ctx, ctx.remote.directoryPicker, workspaces, sessions, viewInstance.actions, notify);\n            const sidebarVisibility = createSidebarVisibility();\n            uiWorkspace.registerSidebarVisibility = sidebarVisibility.register;`],
 ['const browserInjected = () => ({','const browserInjected = () => ({\n                sidebarVisibility,'],
 ['function WorkspaceBrowser({ wide,','function WorkspaceBrowser({ sidebarVisibility, wide,'],
 ['const onSessionUnarchive = (sessionId) => {',`const visibility = (0, react.useSyncExternalStore)(sidebarVisibility.subscribe, sidebarVisibility.getSnapshot, sidebarVisibility.getSnapshot);\n            const visibleRows = sidebarProjection(list, orderedWorkspaces, visibility);\n            const onSessionUnarchive = (sessionId) => {`],
 ['\t\t\t\t\t\t\tlist,\n\t\t\t\t\t\t\tsessionIds: orderedFlatSessionIds,','\t\t\t\t\t\t\tlist: visibleRows.list,\n\t\t\t\t\t\t\tsessionIds: orderedFlatSessionIds,'],
 ['\t\t\t\t\t\t\tlist,\n\t\t\t\t\t\t\tshortcuts,','\t\t\t\t\t\t\tlist: visibleRows.list,\n\t\t\t\t\t\t\tshortcuts,'],
 ['sessionIds: orderedFlatSessionIds,','sessionIds: orderedFlatSessionIds.filter(visibleRows.visible),'],
 ['workspaces: orderedWorkspaces,','workspaces: visibleRows.workspaces,'],
 ['ungroupedSessionIds: orderedUngroupedSessionIds,','ungroupedSessionIds: orderedUngroupedSessionIds.filter(visibleRows.visible),'],
 ['remote: remoteSearch,','remote: { ...remoteSearch, items: remoteSearch.items.filter(row => visibleRows.visible(row.id)) },\n                            sidebarVisibility,'],
 ['function SearchResults({ useSessions,','function SearchResults({ sidebarVisibility, useSessions,'],
 ['const results = (0, react.useMemo)(() => deriveSearchResults(list, workspaces, query, archivedSessionIds, archivedFilter, statuses, currentRemote, resultLimit), [',`const visibility = (0, react.useSyncExternalStore)(sidebarVisibility.subscribe, sidebarVisibility.getSnapshot, sidebarVisibility.getSnapshot);\n            const filteredList = (0, react.useMemo)(() => sidebarProjection(list, workspaces, visibility).list, [list, workspaces, visibility]);\n            const results = (0, react.useMemo)(() => deriveSearchResults(filteredList, workspaces, query, archivedSessionIds, archivedFilter, statuses, currentRemote, resultLimit), [\n                filteredList,`],
];
const transform=code=>{for(const[a,b]of edits){if(code.split(a).length!==2)throw Error('SIDEBAR_VISIBILITY_ANCHOR_CHANGED '+a);code=code.replace(a,b);}return code;};
export function sidebarOriginal(code){let value=code;for(const[a,b]of [...edits].reverse())value=value.replace(b,a);if(sha(value)!==SIDEBAR_UPSTREAM_SHA)throw Error('SIDEBAR_VISIBILITY_UPSTREAM_CHANGED');return value;}
export function extendSidebarVisibility(code){const original=sidebarOriginal(code),extended=transform(original);if(code!==original&&code!==extended)throw Error('SIDEBAR_VISIBILITY_DRIFT');return extended;}
export function installSidebarVisibility(file){const before=fs.readFileSync(file,'utf8'),after=extendSidebarVisibility(before);if(before===after)return{changed:false,sha256:sha(after)};const backup=file+'.naumi-original';if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==SIDEBAR_UPSTREAM_SHA)throw Error('SIDEBAR_VISIBILITY_BACKUP_CHANGED');if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{flag:'wx'});const temp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(temp,after,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}return{changed:true,originalSHA256:sha(before),sha256:sha(after)};}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log('SIDEBAR_VISIBILITY '+JSON.stringify(installSidebarVisibility(path.resolve(process.argv[2]??'node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js'))));
