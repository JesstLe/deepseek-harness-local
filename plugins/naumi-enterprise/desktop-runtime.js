import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

export const AGENT_DESKTOP_VERSION='1.3.1';
export const DESKTOP_SERVER_NAME='naumi_desktop';
const require=createRequire(import.meta.url);
/** Resolve packaged native artifacts, never npx/PATH or a network download. */
export function resolveDesktopRuntime({manifestPath=require.resolve('agent-desktop/package.json'),platform=process.platform,arch=process.arch,readFile=fs.readFileSync,exists=fs.existsSync}={}) {
  const manifest=JSON.parse(readFile(manifestPath,'utf8'));
  if(manifest.version!==AGENT_DESKTOP_VERSION)throw Error(`agent-desktop version mismatch: expected ${AGENT_DESKTOP_VERSION}`);
  if(!['win32','darwin','linux'].includes(platform)||!['x64','arm64'].includes(arch))throw Error('Unsupported agent-desktop platform: '+platform+'-'+arch);
  const bin=path.join(path.dirname(manifestPath),'bin');
  const command=path.join(bin,`agent-desktop-${platform}-${arch}${platform==='win32'?'.exe':''}`);
  const checks=[];
  const verify=file=>{
    if(!exists(file)||!exists(file+'.sha256'))throw Error('Missing packaged agent-desktop artifact: '+path.basename(file));
    const actual=createHash('sha256').update(readFile(file)).digest('hex');
    const expected=readFile(file+'.sha256','utf8').trim();
    if(!/^[a-f0-9]{64}$/.test(expected)||expected!==actual)throw Error('agent-desktop checksum mismatch: '+path.basename(file));
    checks.push({file:path.basename(file),sha256:actual});
  };
  verify(command);
  const env={};
  if(platform==='darwin'){
    const helper=path.join(bin,`agent-desktop-macos-helper-${platform}-${arch}`);verify(helper);env.AGENT_DESKTOP_MACOS_HELPER_PATH=helper;
  }
  if(platform==='linux')verify(path.join(bin,`agent-desktop-linux-clipboard-owner-${platform}-${arch}`));
  return {version:manifest.version,platform,arch,command,env,checks};
}

export function desktopMcpConfig(runtime=resolveDesktopRuntime()) {
  return {serverName:DESKTOP_SERVER_NAME,transport:'stdio',command:runtime.command,args:['mcp','--session','naumi'],env:runtime.env,cwd:path.dirname(runtime.command),toolCallTimeoutMs:60000,failOnStartupError:false,maxInstructionBytes:32768,reconnect:{enabled:true,initialDelayMs:500,maxDelayMs:30000,maxAttempts:10}};
}

export function desktopSkillConfig() {
  return {providerName:'naumi-desktop',includeDefaultRoots:false,customSkillDirs:[fileURLToPath(new URL('./skills',import.meta.url))],watch:false};
}
