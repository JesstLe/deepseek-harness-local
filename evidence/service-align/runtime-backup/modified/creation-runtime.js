import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {defineTool} from '@deepseek-ai/dsh-tools';
import {NativeToolExecutor} from '@deepseek-ai/dsh-tool-executor-native';
import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';
import {creationBundle,verifiedCreationAdapter,CREATION_MANIFEST_SHA256,digest} from './creation-bundle.js';

const prefix='mcp__naumi_creation__',uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
const key=v=>digest(JSON.stringify(stable(v)));
const binding=v=>({site:v.site,account:v.account,tokenId:v.tokenId,workspace:v.workspace});
const within=(root,file)=>{const rel=path.relative(root,file);return !!rel&&rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);};
export function readCreationBinding(home){
 const file=path.join(home,'naumi/creation/connection.json');if(!fs.existsSync(file))return null;
 const info=fs.lstatSync(file);if(!info.isFile()||info.isSymbolicLink()||info.size>16384)throw Error('CREATION_BINDING_INVALID');
 const v=JSON.parse(fs.readFileSync(file,'utf8'));
 if(v.version!==1||!uuid.test(v.bindingId)||typeof v.account!=='string'||!v.account.includes('@')||typeof v.tokenId!=='string'||!v.tokenId||!/^[-\w]{0,128}$/.test(v.workspace)||!path.isAbsolute(v.tokenFile)||!path.isAbsolute(v.ownerRoot))throw Error('CREATION_BINDING_INVALID');
 const site=new URL(v.site);if(site.origin!==v.site||site.username||site.password||site.protocol!=='https:'&&!(site.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(site.hostname)))throw Error('CREATION_BINDING_INVALID');
 if(!/^[a-f0-9]{64}$/.test(v.tokenFileSha256??'')||digest(fs.readFileSync(v.tokenFile))!==v.tokenFileSha256)throw Error('CREATION_TOKEN_BINDING_CHANGED');
 const owner=JSON.parse(fs.readFileSync(path.join(v.ownerRoot,'identity-owner.json'),'utf8'));
 if(owner.version!==1||owner.issuer!==v.site||owner.subject?.type!=='naumi-email-v1'||owner.subject.value!==v.account)throw Error('CREATION_ACCOUNT_MISMATCH');
 if(!within(fs.realpathSync(v.ownerRoot),fs.realpathSync(home))||!within(fs.realpathSync(v.ownerRoot),fs.realpathSync(v.tokenFile))||fs.lstatSync(v.tokenFile).isSymbolicLink())throw Error('CREATION_BINDING_INVALID');
 return v;
}
export class CreationIntents{
 constructor(home){this.home=path.join(home,'naumi/creation/intents');}
 file(b,id){if(!uuid.test(id))throw Error('CREATION_OPERATION_UUID_REQUIRED');return path.join(this.home,key({...binding(b),workspace:undefined,operationId:id})+'.json');}
 read(b,id){const file=this.file(b,id);try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
 assert(b,agent,id){const old=this.read(b,id);if(!old)throw Error('CREATION_ORIGINAL_OPERATION_REQUIRED');if(key(old.binding)!==key(binding(b))||old.sessionId!==agent.id)throw Error('CREATION_ORIGINAL_SCOPE_REQUIRED');return old;}
 admit(b,agent,args){
  if(typeof args.tool!=='string'||!args.arguments||typeof args.arguments!=='object'||Array.isArray(args.arguments))throw Error('CREATION_CALL_INVALID');
  const file=this.file(b,args.operationId),value={version:1,binding:binding(b),sessionId:agent.id,input:args,admittedAt:new Date().toISOString()},text=JSON.stringify(value,null,2)+'\n';
  fs.mkdirSync(this.home,{recursive:true,mode:0o700});try{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}catch(e){if(e.code!=='EEXIST')throw e;const old=this.assert(b,agent,args.operationId);if(key(old.input)!==key(args))throw Error('CREATION_OPERATION_CONFLICT');}
  return value;
 }
}
export class CreationSessions{
 constructor({ctx,home,bundle=creationBundle,readBinding=()=>readCreationBinding(home),adapter=verifiedCreationAdapter,installDeps={mcpClient,filesystemSkills}}){Object.assign(this,{ctx,home,bundle,readBinding,adapter,installDeps});this.entries=new Map();this.tails=new Map();this.intents=new CreationIntents(home);this.enabled=true;}
 serial(agent,fn){const next=(this.tails.get(agent)??Promise.resolve()).then(fn),settled=next.catch(()=>{});this.tails.set(agent,settled);void settled.then(()=>{if(this.tails.get(agent)===settled)this.tails.delete(agent);});return next;}
 async ensure(agent){return this.serial(agent,async()=>{
  const selected=this.enabled?this.readBinding():null,existing=this.entries.get(agent);let cwd;
  if(selected)cwd=await this.ctx.workingDirectory.ensure(agent,new AbortController().signal);
  const fingerprint=selected?key({...selected,cwd}):null;if(existing?.fingerprint===fingerprint)return existing;
  if(existing){this.entries.delete(agent);await existing.dispose();}
  if(!selected)return null;
  const adapter=await this.adapter(this.bundle);if(!this.enabled||key(this.readBinding())!==key(selected))throw Error('CREATION_ACCOUNT_CHANGED');const row={fingerprint,binding:selected,cwd,adapter,receipts:new Map(),ready:false,error:null,dispose:async()=>{}};
  const registration=agent.ctx.inject(['tools','skills'],async scope=>{
   const dispose=await adapter.installNaumiCreation(scope,{bundle:this.bundle,expectedManifestSha256:CREATION_MANIFEST_SHA256,site:selected.site,account:selected.account,tokenFile:selected.tokenFile,workspace:selected.workspace,fileRoot:cwd},this.installDeps);
   scope.effect(()=>dispose);
   scope.systemPrompt.section({name:'naumi:creation-delivery',order:scope.systemPrompt.getSectionOrder('MCP_SERVERS')+1,text:'Naumi creation is account and Session scoped. Use naumi_tools for current schema/availability and naumi_connection for authorization; installation is not readiness. Use a stable UUID in naumi_call; the host persists its complete original intent before dispatch. Recover only the original account/token/workspace/Session operation. After naumi_download_media returns a path/bytes/sha256 receipt, call naumi_present_download with that exact receipt to validate and execute the original native present tool in this Session. Do not invent a file card or claim delivery from an URL alone. Upload once and preserve its receipt; unknown calls never trigger a fresh upload or paid operation.'});
   scope.on('tools/execute',async(exec,next)=>{
    if(exec.agent!==agent||!exec.name.startsWith(prefix))return next();
    const current=this.enabled?this.readBinding():null;if(!current||key(current)!==key(selected))throw Error('CREATION_ACCOUNT_CHANGED');
    if(exec.name===prefix+'naumi_call')this.intents.admit(selected,agent,exec.arguments);
    if(exec.name===prefix+'naumi_call_status')this.intents.assert(selected,agent,exec.arguments.operationId);
    const result=await next();
    if(exec.name===prefix+'naumi_download_media'&&!result.isError){const receipt=result.value?.structuredContent;if(receipt)row.receipts.set(key(receipt),receipt);}
    return result;
   });
   scope.effect(()=>scope.tools.register(defineTool({name:'naumi_present_download',description:'Present an actual download from this Naumi connection in this Session. Use the exact path, bytes and sha256 returned by naumi_download_media; never invent a receipt.',parameters:{receipt:{type:'object',required:true,additionalProperties:false,properties:{path:{type:'string',required:true},bytes:{type:'integer',required:true},sha256:{type:'string',required:true},url:{type:'string'},contentType:{type:'string'}}},description:{type:'string'}},output:{schema:{type:'json'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},execute:async(args,exec)=>{
    if(exec.agent!==agent||this.entries.get(agent)!==row||!this.enabled||key(this.readBinding())!==key(selected))throw Error('CREATION_ORIGINAL_SCOPE_REQUIRED');
    const receipt=[...row.receipts.values()].find(r=>r.path===args.receipt.path&&r.bytes===args.receipt.bytes&&r.sha256===args.receipt.sha256);if(!receipt)throw Error('CREATION_VERIFIED_DOWNLOAD_REQUIRED');
    return adapter.presentNaumiDownload({receipt,fileRoot:cwd,signal:exec.signal,description:args.description??'Naumi 创作结果',present:async input=>{
     const batch=await new NativeToolExecutor(scope).execute({agent,signal:exec.signal,calls:[{type:'tool-call',id:'naumi-present-'+randomUUID(),name:'present',arguments:JSON.stringify(input)}]});const result=batch.results[0]?.result;if(!result||result.isError)throw Error('CREATION_NATIVE_PRESENT_REJECTED');return result.value;
    }});
   }})));
  });
  row.dispose=async()=>{await registration.dispose();row.receipts.clear();};this.entries.set(agent,row);
  try{await registration;}catch(e){this.entries.delete(agent);await row.dispose();throw e;}
  return row;
 });}
 async health(agent){const row=await this.ensure(agent);if(!row)return {configured:false,ready:false};const names=agent.ctx.tools.definitions(agent).filter(t=>t.name.startsWith(prefix)).map(t=>t.name);
  if(!names.includes(prefix+'naumi_connection'))return {configured:true,ready:false,toolCount:names.length};
  const batch=await new NativeToolExecutor(agent.ctx).execute({agent,signal:AbortSignal.timeout(15000),calls:[{type:'tool-call',id:'naumi-health-'+randomUUID(),name:prefix+'naumi_connection',arguments:'{}'}]});const result=batch.results[0]?.result;
  const me=result?.value?.structuredContent;if(result?.isError||me?.account?.email?.toLowerCase()!==row.binding.account||me?.token?.id!==row.binding.tokenId)return {configured:true,ready:false,toolCount:names.length,error:'CREATION_AUTH_NOT_READY'};
  row.ready=true;return {configured:true,ready:true,toolCount:names.length,account:row.binding.account,workspace:row.binding.workspace,tokenId:row.binding.tokenId,budget:me.budget??null};
 }
 async remove(agent){return this.serial(agent,async()=>{const row=this.entries.get(agent);this.entries.delete(agent);await row?.dispose();});}
 async disconnect(){this.enabled=false;await Promise.all([...new Set([...this.entries.keys(),...this.tails.keys()])].map(a=>this.remove(a)));}
 async refresh(){await this.disconnect();this.enabled=true;for(const agent of this.ctx.agents.list())await this.ensure(agent);}
 async close(){await this.disconnect();}
}
