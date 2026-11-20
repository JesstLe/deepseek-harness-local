import fs from 'node:fs';import path from 'node:path';import{createHash}from'node:crypto';import{createRequire}from'node:module';
const {validate}=createRequire(import.meta.url)('../app/embedded-models.cjs');
export function stageEmbeddedModels(staged,input){
 const v=validate(JSON.parse(fs.readFileSync(input))),bytes=Buffer.from(JSON.stringify(v)+'\n');
 fs.writeFileSync(path.join(staged,'defaults/embedded-models.json'),bytes,{mode:0o600});
 return {version:1,revision:v.revision,sha256:createHash('sha256').update(bytes).digest('hex'),models:4,distribution:'two-user-test',credentialBearing:true};
}
