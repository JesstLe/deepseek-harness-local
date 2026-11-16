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
console.log('NAUMI_SYNC packages=2 bundle_enabled=1');
