import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {readBridge,requestBlender} from './blender-bridge/client.js';

const exec=promisify(execFile),delay=ms=>new Promise(r=>setTimeout(r,ms));
export const blenderHome=()=>path.join(process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),'naumi','blender');
const atomic=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{mode:0o600});fs.renameSync(temp,file);};
const alive=pid=>{if(!Number.isInteger(pid)||pid<1)return false;try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}};
function pending(home){try{const v=JSON.parse(fs.readFileSync(path.join(home,'pending.json'),'utf8'));return alive(v.pid)?v:null;}catch{return null;}}
function acquire(home){const file=path.join(home,'launch.lock');for(let i=0;i<2;i++)try{const fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));return {fd,file};}catch(e){if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('BLENDER_LAUNCH_IN_PROGRESS');}if(alive(owner.pid))throw Error('BLENDER_LAUNCH_IN_PROGRESS');fs.unlinkSync(file);}throw Error('BLENDER_LAUNCH_IN_PROGRESS');}
export function loadBlenderConfig(home){try{const v=JSON.parse(fs.readFileSync(path.join(home,'config.json'),'utf8'));if(v.version!==1||!Number.isInteger(v.revision)||v.revision<0||v.executable!==null&&typeof v.executable!=='string')throw Error();return v;}catch(e){if(e.code==='ENOENT')return {version:1,revision:0,executable:null};throw Error('BLENDER_CONFIG_INVALID');}}
export async function inspectBlender(executable){
  if(!path.isAbsolute(executable)||path.basename(executable).toLowerCase()!==(process.platform==='win32'?'blender.exe':'blender'))throw Error('BLENDER_EXECUTABLE_INVALID');
  const stat=fs.statSync(executable);if(!stat.isFile())throw Error('BLENDER_EXECUTABLE_INVALID');
  const {stdout}=await exec(executable,['--version'],{timeout:10000,maxBuffer:8192,windowsHide:true});
  const version=/^Blender (\d+)\.(\d+)\.(\d+)([^\r\n]*)/m.exec(stdout);if(!version||Number(version[1])<4)throw Error('BLENDER_VERSION_UNSUPPORTED');
  return {executable,version:version[0].trim()};
}
export async function discoverBlender({platform=process.platform,env=process.env,exists=fs.existsSync,inspect=inspectBlender}={}){
  const candidates=new Set();if(env.NAUMI_BLENDER_EXECUTABLE)candidates.add(env.NAUMI_BLENDER_EXECUTABLE);
  const dirs=platform==='win32'?[path.join(env.ProgramFiles??'C:/Program Files','Blender Foundation'),path.join(env.LOCALAPPDATA??os.homedir(),'Programs','Blender Foundation')]:platform==='darwin'?['/Applications/Blender.app/Contents/MacOS']:['/usr/bin','/usr/local/bin','/snap/bin'];
  for(const dir of dirs){const binary=platform==='win32'?'blender.exe':'blender';if(exists(path.join(dir,binary)))candidates.add(path.join(dir,binary));try{for(const entry of fs.readdirSync(dir,{withFileTypes:true}))if(entry.isDirectory()&&/^blender/i.test(entry.name))candidates.add(path.join(dir,entry.name,binary));}catch{}}
  const found=[];for(const candidate of candidates)if(exists(candidate))try{found.push(await inspect(candidate));}catch{}
  return found.sort((a,b)=>b.version.localeCompare(a.version,undefined,{numeric:true}));
}
export function blenderMcpConfig(home=blenderHome()){
  return {serverName:'naumi_blender',transport:'stdio',command:process.execPath,args:[fileURLToPath(new URL('./blender-bridge/server.mjs',import.meta.url))],env:{NAUMI_BLENDER_HOME:home},cwd:fileURLToPath(new URL('.',import.meta.url)),toolCallTimeoutMs:150000,failOnStartupError:false,maxInstructionBytes:8192,reconnect:{enabled:true,initialDelayMs:500,maxDelayMs:15000,maxAttempts:5}};
}
export class BlenderRuntime{
  constructor({home=blenderHome(),discover=discoverBlender,inspect=inspectBlender,spawnProcess=spawn}={}){Object.assign(this,{home,discover,inspect,spawnProcess});this.serial=Promise.resolve();}
  async candidates(){if(!this.cached||Date.now()-this.scannedAt>300000){this.cached=await this.discover();this.scannedAt=Date.now();}return this.cached;}
  async status(){
    const config=loadBlenderConfig(this.home),candidates=await this.candidates();let engine=config.executable?candidates.find(c=>c.executable===config.executable):candidates[0];
    if(config.executable&&!engine)try{engine=await this.inspect(config.executable);}catch{}
    let connected=false,instance=null,descriptor=null;try{descriptor=readBridge(this.home);instance=await requestBlender(this.home,'hello',{}, {timeoutMs:1500});connected=instance?.protocol===1&&instance.name==='naumi-blender';}catch{}
    const running=!!descriptor&&alive(descriptor.pid);
    return {revision:config.revision,bundledMcp:true,engineBundled:false,installed:!!engine,engine:engine??null,candidates,connected,running,unresponsive:running&&!connected,instance:connected?{pid:instance.pid,version:instance.blenderVersion}:null,launching:!connected&&!running&&(!!this.starting||!!pending(this.home)),telemetry:false};
  }
  execute(fn){const run=this.serial.then(fn);this.serial=run.catch(()=>{});return run;}
  save(executable,revision){return this.execute(async()=>{const old=loadBlenderConfig(this.home);if(old.revision!==revision)throw Error('BLENDER_CONFIG_CONFLICT');const state=await this.status();if(state.running||state.launching)throw Error('BLENDER_DISCONNECT_REQUIRED');if(executable!==null)await this.inspect(executable);atomic(path.join(this.home,'config.json'),{...old,revision:old.revision+1,executable});this.cached=null;return this.status();});}
  start({headless=false}={}){return this.execute(async()=>{
    const before=await this.status();if(before.connected)return before;if(before.running)throw Error('BLENDER_BUSY');if(before.launching)throw Error('BLENDER_START_PENDING');if(!before.engine)throw Error('BLENDER_NOT_INSTALLED');
    fs.mkdirSync(this.home,{recursive:true});const {fd,file:lock}=acquire(this.home);
    this.starting=true;let child;
    try{
      const run=path.join(this.home,'runs',randomUUID()),file=path.join(run,'launch.json');fs.mkdirSync(run,{recursive:true});
      const spec={version:1,home:this.home,instanceId:randomUUID(),token:randomBytes(32).toString('hex'),headless};atomic(file,spec);
      const bootstrap=fileURLToPath(new URL('./blender-bridge/addon.py',import.meta.url));
      child=this.spawnProcess(before.engine.executable,[...headless?['--background']:[],'--factory-startup','--python',bootstrap,'--',file],{windowsHide:headless,detached:!headless,stdio:'ignore'});
      this.lastChild=child;let failed=false;child.once('error',()=>{failed=true;});if(!headless)child.unref();
      if(child.pid)atomic(path.join(this.home,'pending.json'),{pid:child.pid,instanceId:spec.instanceId});
      const deadline=Date.now()+45000;
      while(Date.now()<deadline){if(failed||child.exitCode!==null)throw Error('BLENDER_LAUNCH_FAILED');try{const result=await requestBlender(this.home,'hello',{}, {timeoutMs:800});if(result?.protocol===1&&readBridge(this.home)?.instanceId===spec.instanceId){fs.unlinkSync(path.join(this.home,'pending.json'));return this.status();}}catch{}await delay(150);}
      // No retry or kill: the window may be opening slowly and may already contain user edits.
      throw Error('BLENDER_START_PENDING');
    }finally{this.starting=false;if(fd!==undefined){fs.closeSync(fd);fs.unlinkSync(lock);}}
  });}
  disconnect(){return this.execute(async()=>{await requestBlender(this.home,'disconnect',{}, {timeoutMs:5000});return this.status();});}
  async close(){await this.serial;/* The user-owned Blender window and scene outlive the Host. */}
}
