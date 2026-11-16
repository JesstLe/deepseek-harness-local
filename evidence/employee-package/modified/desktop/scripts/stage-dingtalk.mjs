import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const project=fileURLToPath(new URL('../..',import.meta.url));
export const dingTalkPin=JSON.parse(fs.readFileSync(new URL('../vendor/dingtalk.json',import.meta.url)));
const hash=(b,algorithm='sha256',encoding='hex')=>createHash(algorithm).update(b).digest(encoding);
export function verifyDingTalkArchive(bytes,pin=dingTalkPin){
  if('sha512-'+hash(bytes,'sha512','base64')!==pin.integrity)throw Error('DINGTALK_TARBALL_INTEGRITY');
}
export async function stageDingTalk(target,{archive,cache=path.join(project,'runtime/download-cache'),pin=dingTalkPin,download=fetch}={}){
  target=path.resolve(target);
  if(pin.platform!==process.platform||pin.arch!==process.arch)throw Error('DINGTALK_TARGET_UNSUPPORTED');
  fs.mkdirSync(cache,{recursive:true});archive??=path.join(cache,`${pin.name}-${pin.version}.tgz`);
  if(!fs.existsSync(archive)){
    const response=await download(pin.url,{redirect:'error',signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error('DINGTALK_DOWNLOAD_FAILED');
    const bytes=Buffer.from(await response.arrayBuffer());verifyDingTalkArchive(bytes,pin);
    const partial=archive+'.'+randomUUID()+'.tmp';fs.mkdirSync(path.dirname(archive),{recursive:true});fs.writeFileSync(partial,bytes);fs.renameSync(partial,archive);
  }
  verifyDingTalkArchive(fs.readFileSync(archive),pin);
  // The full immutable npm tarball is verified before either extraction; no postinstall runs.
  const temp=fs.mkdtempSync(path.join(path.resolve(cache),'extract-'));
  try{
    execFileSync('tar.exe',['-xf',path.resolve(archive),'-C',temp,'package/assets/'+pin.archive,'package/package.json','package/bin/dws.js']);
    const zip=path.join(temp,'package/assets',pin.archive);
    if(hash(fs.readFileSync(zip))!==pin.archiveSHA256)throw Error('DINGTALK_PLATFORM_INTEGRITY');
    const entries=execFileSync('tar.exe',['-tf',zip],{encoding:'utf8'}).trim().split(/\r?\n/);
    const allowed=['CHANGELOG.md','LICENSE','NOTICE','README.md','dws.exe'];
    if(entries.length!==allowed.length||entries.some(n=>!allowed.includes(n)))throw Error('DINGTALK_ARCHIVE_CONTENT_INVALID');
    const vendor=path.join(temp,'verified-vendor');fs.mkdirSync(vendor);execFileSync('tar.exe',['-xf',zip,'-C',vendor]);
    if(hash(fs.readFileSync(path.join(vendor,'dws.exe')))!==pin.executableSHA256)throw Error('DINGTALK_EXECUTABLE_INTEGRITY');
    const source=JSON.parse(fs.readFileSync(path.join(temp,'package/package.json')));
    if(source.name!==pin.name||source.version!==pin.version)throw Error('DINGTALK_MANIFEST_INVALID');
    const destination=path.join(target,'node_modules',pin.name);
    // Refuse stale/injected files instead of silently keeping an old installer or account file.
    if(fs.existsSync(destination))throw Error('DINGTALK_STAGE_TARGET_EXISTS');
    fs.mkdirSync(path.join(destination,'vendor'),{recursive:true});fs.mkdirSync(path.join(destination,'bin'));
    fs.copyFileSync(path.join(vendor,'dws.exe'),path.join(destination,'vendor/dws.exe'));
    for(const name of allowed.filter(n=>n!=='dws.exe'))fs.copyFileSync(path.join(vendor,name),path.join(destination,name));
    fs.copyFileSync(path.join(temp,'package/bin/dws.js'),path.join(destination,'bin/dws.js'));
    fs.writeFileSync(path.join(destination,'package.json'),JSON.stringify({name:pin.name,version:pin.version,license:pin.license,repository:pin.repository,bin:{dws:'bin/dws.js'},naumi:{platform:pin.platform,arch:pin.arch,executableSHA256:pin.executableSHA256,upstreamIntegrity:pin.integrity}},null,2)+'\n');
    fs.mkdirSync(path.join(target,'bin'),{recursive:true});fs.mkdirSync(path.join(target,'runtime'),{recursive:true});
    fs.copyFileSync(new URL('../runtime/dingtalk-cli.cjs',import.meta.url),path.join(target,'runtime/dingtalk-cli.cjs'));
    fs.writeFileSync(path.join(target,'bin/dws.cmd'),'@echo off\r\n"%~dp0..\\node.exe" "%~dp0..\\runtime\\dingtalk-cli.cjs" %*\r\nexit /b %errorlevel%\r\n');
    return {name:pin.name,version:pin.version,license:pin.license,sha256:pin.executableSHA256,upstreamIntegrity:pin.integrity,postinstallExecuted:false,globalSkillsInstalled:false};
  }finally{
    const resolved=path.resolve(temp),base=path.resolve(cache)+path.sep;
    if(!resolved.startsWith(base))throw Error('DINGTALK_CACHE_ESCAPE');
    fs.rmSync(resolved,{recursive:true,force:true});
  }
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const result=await stageDingTalk(process.argv[2]??path.join(project,'runtime/desktop-backend'),{archive:process.argv[3]});
  console.log('DINGTALK_STAGED '+JSON.stringify(result));
}
