import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const SETTINGS_UPSTREAM_SHA='91f464ea8a6193df07c72aa359c3fa6f167a5420aadaccbd7d93b880e2c3149e';
export const SETTINGS_EXTENSION='Naumi employee settings presentation v1';
const sha=b=>createHash('sha256').update(b).digest('hex');
const edits=[
 ['const rows = useSections((s) => s);',`// ${SETTINGS_EXTENSION}: filter this shell view only; registrations and services stay live.
            const rows = useSections((s) => s).filter((row) => ["general", "models", "mcp"].includes(row.id));`],
 ['children: renderSlot("settings.action", {})','children: null /* Employee settings has no configuration-file action. */'],
];
function transform(code){for(const [before,after] of edits){if(code.split(before).length!==2)throw Error('SETTINGS_ANCHOR_CHANGED');code=code.replace(before,after);}return code;}
export function nativeSettingsOriginal(code){
 let original=code;for(const [before,after]of edits)original=original.replace(after,before);
 if(sha(original)!==SETTINGS_UPSTREAM_SHA)throw Error('SETTINGS_UPSTREAM_CHANGED');
 return original;
}
export function extendNativeSettings(code){
 if(sha(code)===SETTINGS_UPSTREAM_SHA)return transform(code);
 let original=code;for(const [before,after]of edits)original=original.replace(after,before);
 if(sha(original)===SETTINGS_UPSTREAM_SHA&&transform(original)===code)return code;
 throw Error('SETTINGS_UPSTREAM_CHANGED');
}
export function installNativeSettings(file){
 const before=fs.readFileSync(file,'utf8'),after=extendNativeSettings(before);
 if(before===after)return{changed:false,sha256:sha(after)};
 const backup=file+'.naumi-original';
 if(fs.existsSync(backup)&&sha(fs.readFileSync(backup))!==SETTINGS_UPSTREAM_SHA)throw Error('SETTINGS_BACKUP_CHANGED');
 if(!fs.existsSync(backup))fs.writeFileSync(backup,before,{flag:'wx'});
 const temp=file+'.'+randomUUID()+'.tmp';
 try{fs.writeFileSync(temp,after,{flag:'wx'});fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
 return{changed:true,originalSHA256:sha(before),sha256:sha(after)};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log('SETTINGS_EXTENSION '+JSON.stringify(installNativeSettings(path.resolve(process.argv[2]??'node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'))));
