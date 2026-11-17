import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

// Release-owned pin, deliberately outside the supplied bundle's manifest.
export const CREATION_MANIFEST_SHA256='c32e6acb697c30cfab6e89928f23ad466e3eb52b7b9b15bca3f369aee03d0ac0';
export const CREATION_SOURCE='8dcf44189ebad64c289ec333063486a00ccfb447';
export const creationBundle=fileURLToPath(new URL('./third-party/naumi-creation',import.meta.url));
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function verifiedCreationAdapter(bundle=creationBundle){
 const root=await fs.realpath(bundle),bytes=await fs.readFile(path.join(root,'manifest.json'));
 if(digest(bytes)!==CREATION_MANIFEST_SHA256)throw Error('CREATION_MANIFEST_PIN_MISMATCH');
 const m=JSON.parse(bytes);if(m.sourceCommit!==CREATION_SOURCE||m.dirty!==false)throw Error('CREATION_FIXED_SOURCE_REQUIRED');
 for(const [name,hash]of Object.entries(m.files)){
  const file=await fs.realpath(path.resolve(root,name)),rel=path.relative(root,file);
  if(!rel||rel.startsWith('..')||path.isAbsolute(rel)||digest(await fs.readFile(file))!==hash)throw Error('CREATION_BUNDLE_HASH_MISMATCH');
 }
 // Do not import or evaluate any adapter bytes before the external pin AND file checks.
 return import(pathToFileURL(path.join(root,'naumi-creation.mjs')).href);
}
