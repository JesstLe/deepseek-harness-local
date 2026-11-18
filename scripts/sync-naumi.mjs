import fs from 'node:fs';
import path from 'node:path';
import {installReasoningDefaults} from './native-reasoning-extension.mjs';
import {installAgentTriggers} from './native-agent-mentions-extension.mjs';
import {installNativeComposer} from './native-composer-extension.mjs';
import {installNativeSettings} from './native-settings-extension.mjs';
const packages=[['naumi-enterprise','@naumi/dsh-enterprise'],['naumi-ui-layout','@naumi/dsh-ui-layout'],['naumi-sidebar-browser','@naumi/dsh-sidebar-browser']];
const manifest='.dsh/profiles/web/package.json';
const profile=JSON.parse(fs.readFileSync(manifest,'utf8'));
for(const [folder,name]of packages){
  const target=path.join('.dsh/profiles/web/node_modules',name);
  if(!fs.existsSync(target)){
    if(name!=='@naumi/dsh-sidebar-browser')throw Error(`Install ${name} into the Web profile first. See NAUMI_CUSTOMIZATION.md.`);
    fs.mkdirSync(target,{recursive:true});profile.dependencies??={};profile.dependencies[name]='file:'+path.resolve('plugins',folder).replaceAll('\\','/');
  }
  for(const file of fs.readdirSync('plugins/'+folder,{recursive:true})){
    const source=path.join('plugins',folder,file);
    if(fs.statSync(source).isFile()){
      const destination=path.join(target,file);fs.mkdirSync(path.dirname(destination),{recursive:true});
      if(fs.existsSync(destination)){
        const a=fs.statSync(source),b=fs.statSync(destination);
        if(a.dev===b.dev&&a.ino===b.ino)continue;
        if(fs.readFileSync(source).equals(fs.readFileSync(destination)))continue;
      }
      fs.copyFileSync(source,destination);
    }
  }
}
if(!profile.dsh.profile.bundles.includes('@naumi/dsh-enterprise'))profile.dsh.profile.bundles.push('@naumi/dsh-enterprise');
const serialized=JSON.stringify(profile,null,2)+'\n';
if(fs.readFileSync(manifest,'utf8')!==serialized)fs.writeFileSync(manifest,serialized);
console.log('NAUMI_SYNC packages=3 bundle_enabled=1');
installNativeComposer(path.resolve('node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js'));
installAgentTriggers(path.resolve('node_modules/@deepseek-ai/dsh-client-ui-input-trigger/lib/client.js'));
installNativeSettings(path.resolve('node_modules/@deepseek-ai/dsh-client-ui-settings-general/lib/client.js'));

installReasoningDefaults(path.resolve('node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js'));
