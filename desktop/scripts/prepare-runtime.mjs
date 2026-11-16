import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../..',import.meta.url)),target=path.join(root,'runtime/desktop-backend');
fs.mkdirSync(target,{recursive:true});
// Copy only an allowlisted runtime tree. No home, logs, credentials or personal profile is a source.
fs.cpSync(path.join(root,'node_modules'),path.join(target,'node_modules'),{recursive:true,dereference:true,filter:source=>!source.split(path.sep).some(x=>['.cache','.bin'].includes(x))});
fs.cpSync(path.join(root,'plugins'),path.join(target,'plugins'),{recursive:true});
for(const [source,name]of [['naumi-enterprise','dsh-enterprise'],['naumi-ui-layout','dsh-ui-layout']])fs.cpSync(path.join(root,'plugins',source),path.join(target,'node_modules/@naumi',name),{recursive:true});
fs.copyFileSync(process.execPath,path.join(target,'node.exe'));
const defaults=path.join(target,'defaults');fs.mkdirSync(defaults,{recursive:true});
fs.writeFileSync(path.join(defaults,'profile.json'),JSON.stringify({name:'naumi-profile-web',private:true,dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@deepseek-ai/dsh-experimental-agent-team-profile','@naumi/dsh-enterprise']}}},null,2));
fs.writeFileSync(path.join(defaults,'profile.yml'),'- id: ui-settings-general\n  config:\n    welcomeNoticeVersion: 2026-09-28.1\n');
fs.writeFileSync(path.join(defaults,'home.yml'),'- id: ui-theme\n  config:\n    preference: light\n- id: session-log-deepseek\n  config:\n    enabled: false\n');
fs.cpSync(path.join(root,'desktop/upstream'),path.join(target,'licenses/harness-browser'),{recursive:true});
const manifest={product:'Naumi',version:'0.2.0',node:process.versions.node,harness:'0.2.2-rc.1',agentDesktop:'1.3.1',personalCredentials:false,browserProfiles:false,bootstrap:'offline',nodeSHA256:createHash('sha256').update(fs.readFileSync(path.join(target,'node.exe'))).digest('hex')};
fs.writeFileSync(path.join(target,'runtime-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('DESKTOP_RUNTIME_READY node=24.19.0 harness=0.2.2-rc.1 agent_desktop=1.3.1 credentials=0 profiles=0');
