import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const CUA_VERSION='0.54.0';
export const CUA_SHA256='99a4b7a04fb3a25a450cc64ed4b806406c18aa08f27ec83a8364a0c601b1865e';
export const CUA_ARCHIVE_SHA256='c0b92cb56ec7863ca177a2813bf5e22bdea5772a56f5bc4e8be064eed34498d7';
export const CUA_ARCHIVE_URL=`https://github.com/trycua/cua/releases/download/cua-driver-rs-v${CUA_VERSION}/cua-driver-rs-${CUA_VERSION}-windows-x86_64.zip`;
// Offline pinned artifact only; no PATH, global installation, updates or runtime downloads.
export function resolveDesktopRuntime({platform=process.platform,arch=process.arch,command=fileURLToPath(new URL('./third-party/cua-driver/win32-x64/cua-driver.exe',import.meta.url)),readFile=fs.readFileSync}={}){
 if(platform!=='win32'||arch!=='x64')throw Error('CUA_PLATFORM_NOT_PACKAGED');
 let bytes;try{bytes=readFile(command);}catch{throw Error('CUA_BUNDLE_MISSING');}
 if(createHash('sha256').update(bytes).digest('hex')!==CUA_SHA256)throw Error('CUA_BUNDLE_HASH_MISMATCH');
 return {engine:'cua',version:CUA_VERSION,platform,arch,command,args:['mcp','--direct','--embedded'],env:{CUA_DRIVER_RS_TELEMETRY_ENABLED:'false',CUA_TELEMETRY_ENABLED:'false'},checks:[{file:path.basename(command),sha256:CUA_SHA256}]};
}
export function desktopSkillConfig(){return {providerName:'naumi-desktop',includeDefaultRoots:false,customSkillDirs:[fileURLToPath(new URL('./skills',import.meta.url))],watch:false};}
