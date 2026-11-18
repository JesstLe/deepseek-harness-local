'use strict';
// Provision only a NEW, empty Naumi-owned directory. Existing/external paths
// are never ACL-migrated here. The native sandbox still owns capability grants.
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile);
async function createManagedWorkspace(directory,{parent=path.dirname(directory),platform=process.platform,prepare=prepareWindowsWorkspace}={}){
 const target=path.resolve(directory),base=path.resolve(parent);
 if(path.dirname(target)!==base)throw Error('MANAGED_WORKSPACE_BOUNDARY');
 const check=p=>{const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink())throw Error('MANAGED_WORKSPACE_UNMANAGED');};
 check(base);const canonical=fs.realpathSync.native(base);
 if(fs.existsSync(target)){check(target);return {created:false};}
 const stage=fs.mkdtempSync(path.join(base,'.naumi-workspace-'));
 try{
  check(stage);if(path.dirname(fs.realpathSync.native(stage))!==canonical)throw Error('MANAGED_WORKSPACE_BOUNDARY');
  const acl=platform==='win32'?await prepare(stage,base):null;
  check(stage);if(fs.realpathSync.native(base)!==canonical||path.dirname(fs.realpathSync.native(stage))!==canonical||fs.readdirSync(stage).length)throw Error('MANAGED_WORKSPACE_CHANGED');
  // Rename publishes an initialized, empty directory; a failure never exposes
  // a half-provisioned target. Never replace any pre-existing target.
  if(fs.existsSync(target))throw Error('MANAGED_WORKSPACE_CONFLICT');
  fs.renameSync(stage,target);return {created:true,acl};
 }finally{
  // No recursive cleanup: unexpected contents/reparse changes are preserved.
  if(fs.existsSync(stage)&&fs.lstatSync(stage).isDirectory()&&!fs.lstatSync(stage).isSymbolicLink()&&!fs.readdirSync(stage).length)fs.rmdirSync(stage);
 }
}
async function prepareWindowsWorkspace(directory,parent,{execute=run,environment=process.env}={}){
 const executable=path.join(environment.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/powershell.exe');
 // A pwsh parent can export incompatible PS7 module paths to Windows PS5.
 // This one child uses only the inbox modules, not any user profile/module.
 const env={...environment,PSModulePath:path.join(environment.SystemRoot??'C:\\Windows','System32/WindowsPowerShell/v1.0/Modules')};
 let stdout;try{({stdout}=await execute(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'managed-workspace.ps1'),'-Directory',directory,'-Parent',parent],{env,windowsHide:true,encoding:'utf8',timeout:30000,maxBuffer:32768}));}catch(error){
  const code=String(error.stderr??'').match(/\bMANAGED_WORKSPACE_[A-Z_]+\b/)?.[0]??'MANAGED_WORKSPACE_ACL_PREPARE_FAILED';
  throw Object.assign(new Error(code,{cause:error}),{code});
 }
 let receipt;try{receipt=JSON.parse(stdout.replace(/^\uFEFF/,''));}catch{throw Error('MANAGED_WORKSPACE_ACL_UNVERIFIED');}if(receipt.status!=='OWNER_LABEL_READY')throw Error('MANAGED_WORKSPACE_ACL_UNVERIFIED');return receipt;
}
module.exports={createManagedWorkspace,prepareWindowsWorkspace};
