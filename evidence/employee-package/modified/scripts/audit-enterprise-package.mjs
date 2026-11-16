import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parse} from 'acorn';
const require=createRequire(import.meta.url),root=fileURLToPath(new URL('..',import.meta.url));
export function packageImports(text){
  const values=[];
  function visit(node){
    if(!node||typeof node!=='object')return;
    if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)values.push(node.source.value);
    if(node.type==='ImportExpression'&&node.source.type==='Literal')values.push(node.source.value);
    for(const [key,value]of Object.entries(node))if(key!=='source')if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(parse(text,{ecmaVersion:'latest',sourceType:'module'}));return values;
}
export function auditPackage(directory,{packedFiles,checkInstalled=false,dependencyRoot}={}){
  directory=path.resolve(directory);const manifest=JSON.parse(fs.readFileSync(path.join(directory,'package.json'))),deps={...manifest.dependencies,...manifest.peerDependencies},imports=new Set(),files=[];
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name==='node_modules'||entry.name.startsWith('.'))continue;const p=path.join(dir,entry.name);if(entry.isDirectory())walk(p);else files.push(path.relative(directory,p).replaceAll('\\','/'));}};walk(directory);
  const packed=packedFiles?new Set(packedFiles):new Set(files);
  for(const file of files){
    if(!packed.has(file))throw Error('PACKAGE_FILE_OMITTED '+file);
    if(!/\.(?:m?js)$/.test(file))continue;
    for(const specifier of packageImports(fs.readFileSync(path.join(directory,file),'utf8'))){
      if(specifier.startsWith('node:'))continue;
      if(specifier.startsWith('/naumi/assets/')){if(!packed.has('assets/'+specifier.split('/').at(-1)))throw Error('PACKAGE_WEB_ASSET_MISSING '+specifier);continue;}
      if(specifier.startsWith('.')){const resolved=path.resolve(path.dirname(path.join(directory,file)),specifier),rel=path.relative(directory,resolved).replaceAll('\\','/');if(rel.startsWith('..')||!packed.has(rel))throw Error('PACKAGE_IMPORT_MISSING '+rel);continue;}
      const name=specifier.startsWith('@')?specifier.split('/').slice(0,2).join('/'):specifier.split('/')[0];
      if(!deps[name])throw Error('PACKAGE_DEPENDENCY_UNDECLARED '+name);imports.add(name);
      if(checkInstalled){
        const localRequire=createRequire(path.join(directory,file));
        // Import-only packages may not export package.json; inspect their manifest by Node lookup path.
        const candidates=localRequire.resolve.paths(name)??[],p=candidates.map(n=>path.join(n,name,'package.json')).find(fs.existsSync);
        if(!p)throw Error('PACKAGE_DEPENDENCY_MISSING '+name);
        if(dependencyRoot&&!path.resolve(p).startsWith(path.resolve(dependencyRoot)+path.sep))throw Error('PACKAGE_DEPENDENCY_OUTSIDE_BUNDLE '+name);
        const installed=JSON.parse(fs.readFileSync(p));
        if(/^\d/.test(deps[name])&&installed.version!==deps[name])throw Error('PACKAGE_DEPENDENCY_VERSION '+name);
      }
    }
  }
  return {files:files.length,externalImports:[...imports].sort(),status:'PASS'};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  const directory=process.argv[2]??path.join(root,'plugins/naumi-enterprise');
  console.log('PACKAGE_CLOSURE '+JSON.stringify(auditPackage(directory,{checkInstalled:true})));
}
