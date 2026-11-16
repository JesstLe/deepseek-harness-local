import fs from 'node:fs';
import path from 'node:path';
const packages=[['naumi-enterprise','@naumi/dsh-enterprise'],['naumi-ui-layout','@naumi/dsh-ui-layout']];
const manifest='.dsh/profiles/web/package.json';
const profile=JSON.parse(fs.readFileSync(manifest,'utf8'));
for(const [folder,name]of packages){
  const target=path.join('.dsh/profiles/web/node_modules',name);
  if(!fs.existsSync(target))throw Error(`Install ${name} into the Web profile first. See NAUMI_CUSTOMIZATION.md.`);
  for(const file of fs.readdirSync('plugins/'+folder,{recursive:true})){
    const source=path.join('plugins',folder,file);
    if(fs.statSync(source).isFile()){fs.mkdirSync(path.dirname(path.join(target,file)),{recursive:true});fs.copyFileSync(source,path.join(target,file));}
  }
}
if(!profile.dsh.profile.bundles.includes('@naumi/dsh-enterprise'))profile.dsh.profile.bundles.push('@naumi/dsh-enterprise');
fs.writeFileSync(manifest,JSON.stringify(profile,null,2)+'\n');
console.log('NAUMI_SYNC packages=2 bundle_enabled=1');
