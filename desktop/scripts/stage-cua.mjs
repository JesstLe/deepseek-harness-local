import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {CUA_ARCHIVE_URL,CUA_ARCHIVE_SHA256,resolveDesktopRuntime} from '../../plugins/naumi-enterprise/desktop-runtime.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
/** Build-time only. Do not run upstream's global installer or optional extensions. */
export async function stageCuaDriver(plugin=fileURLToPath(new URL('../../plugins/naumi-enterprise',import.meta.url)),{archive}={}){
 const directory=path.join(plugin,'third-party/cua-driver/win32-x64'),command=path.join(directory,'cua-driver.exe');
 if(fs.existsSync(command))return resolveDesktopRuntime({command});
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('CUA_BUILD_PLATFORM_NOT_PACKAGED');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-cua-build-'));
 try{
  let bytes;if(archive)bytes=fs.readFileSync(archive);else{const r=await fetch(CUA_ARCHIVE_URL,{signal:AbortSignal.timeout(120000)});if(!r.ok)throw Error('CUA_ARCHIVE_HTTP_'+r.status);bytes=Buffer.from(await r.arrayBuffer());}
  if(hash(bytes)!==CUA_ARCHIVE_SHA256)throw Error('CUA_ARCHIVE_HASH_MISMATCH');
  fs.writeFileSync(path.join(tmp,'driver.zip'),bytes);
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`$ErrorActionPreference='Stop'; $env:PSModulePath=Join-Path $env:SystemRoot 'System32\\WindowsPowerShell\\v1.0\\Modules'; Expand-Archive -LiteralPath ${quote(path.join(tmp,'driver.zip'))} -DestinationPath ${quote(path.join(tmp,'unpack'))}; $f=Get-ChildItem -LiteralPath ${quote(path.join(tmp,'unpack'))} -Filter cua-driver.exe -Recurse; if(@($f).Count -ne 1){throw 'CUA_ARCHIVE_LAYOUT'}; $s=Get-AuthenticodeSignature -LiteralPath $f.FullName; if($s.Status -ne 'Valid' -or $s.SignerCertificate.Subject -notmatch 'CN="?Cua AI, Inc\\.'){throw 'CUA_SIGNATURE_INVALID'}`],{windowsHide:true,stdio:'pipe'});
  const find=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?find(path.join(dir,e.name)):e.name==='cua-driver.exe'?[path.join(dir,e.name)]:[]);
  const source=find(path.join(tmp,'unpack'))[0];resolveDesktopRuntime({command:source});fs.mkdirSync(directory,{recursive:true});fs.copyFileSync(source,command);
  return resolveDesktopRuntime({command});
 }finally{if(path.resolve(tmp).startsWith(path.resolve(os.tmpdir())+path.sep))fs.rmSync(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){const r=await stageCuaDriver();console.log('CUA_STAGED version='+r.version+' sha256='+r.checks[0].sha256);}
