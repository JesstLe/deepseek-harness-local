import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../..',import.meta.url)),evidence=path.join(root,'evidence/naumi-desktop'),originalRoot=process.argv[2];
if(!originalRoot)throw Error('Supply the unchanged original checkout');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const candidates=(execFileSync('git',['ls-files','-m','-o','--exclude-standard','-z'],{cwd:root}).toString()+'\0'+execFileSync('git',['diff','--name-only','-z','HEAD'],{cwd:root}).toString()).split('\0').filter(Boolean);
const files=[...new Set(candidates)].filter(f=>!f.startsWith('evidence/')&&!f.startsWith('docs/')&&!['plugins/naumi-enterprise/client.js','plugins/naumi-ui-layout/client.js','plugins/naumi-ui-layout/UPSTREAM.json'].includes(f)).sort();
const manifest=[];
for(const file of files){
 const item={path:file,modifiedSHA256:hash(path.join(root,file))},source=path.join(originalRoot,file),original=path.join(evidence,'original',file);
 if(fs.existsSync(source)){if(!fs.existsSync(original)){fs.mkdirSync(path.dirname(original),{recursive:true});fs.copyFileSync(source,original);}item.originalSHA256=hash(original);}
 manifest.push(item);
}
fs.writeFileSync(path.join(evidence,'change-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(evidence,'original-hashes.json'),JSON.stringify(manifest.filter(x=>x.originalSHA256).map(x=>({path:x.path,sha256:x.originalSHA256})),null,2)+'\n');
const artifacts=['runtime/naumi-desktop-release/Naumi-Setup-0.2.0-x64.exe','runtime/naumi-desktop-release/win-unpacked/Naumi.exe','desktop/app/assets/naumi.ico'];
fs.writeFileSync(path.join(evidence,'release-hashes.json'),JSON.stringify(artifacts.map(file=>({path:file,bytes:fs.statSync(path.join(root,file)).size,sha256:hash(path.join(root,file))})),null,2)+'\n');
console.log(`EVIDENCE_SNAPSHOT originals=${manifest.filter(x=>x.originalSHA256).length} changed=${manifest.length}`);
