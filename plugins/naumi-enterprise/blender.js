import * as mcpClient from '@deepseek-ai/dsh-mcp-client';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {BlenderRuntime,blenderMcpConfig} from './blender-runtime.js';

const command=z.discriminatedUnion('action',[
  z.object({action:z.literal('detect')}).strict(),
  z.object({action:z.literal('select'),executable:z.string().min(1).max(4096).nullable(),expectedRevision:z.number().int().nonnegative()}).strict(),
  z.object({action:z.literal('start')}).strict(),z.object({action:z.literal('disconnect')}).strict(),
]);
export function createBlenderHandler(scope,runtime){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Naumi-Blender','1');
  const send=(status,value)=>{if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
  const a=scope.connection.admit(req);if('rejection'in a){send(a.rejection,{error:'AUTH_REQUIRED'});return;}if(a.peer.principal.kind!=='owner'){send(403,{error:'OWNER_REQUIRED'});return;}
  const read=async()=>{const names=scope.tools.definitions().filter(t=>t.name.startsWith('mcp__naumi_blender__'));return {...await runtime.status(),namespace:'naumi_blender',toolCount:names.length,toolRegistered:names.length===6};};
  try{
    if(req.method==='GET'){send(200,await read());return;}
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(req.headers['x-naumi-blender']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'SAME_ORIGIN_REQUIRED'});return;}
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){send(415,{error:'JSON_REQUIRED'});return;}
    let size=0;const chunks=[];for await(const b of req){size+=b.length;if(size>8192){send(413,{error:'BLENDER_BODY_TOO_LARGE'});return;}chunks.push(b);}
    let p;try{p=command.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{send(400,{error:'BLENDER_INVALID_REQUEST'});return;}
    if(p.action==='select')await runtime.save(p.executable,p.expectedRevision);
    if(p.action==='detect')runtime.cached=null;
    if(p.action==='start')await runtime.start();
    if(p.action==='disconnect')await runtime.disconnect();
    send(200,await read());
  }catch(e){const code=/^BLENDER_[A-Z_]+$/.test(e.message)?e.message:'BLENDER_OPERATION_FAILED';send(code==='BLENDER_CONFIG_CONFLICT'?409:400,{error:code});}
};}
export function installBlender(ctx){
  return ctx.inject(['tools','skills','webServer','connection'],scope=>{
    const runtime=new BlenderRuntime();
    scope.plugin(mcpClient,blenderMcpConfig(runtime.home));
    scope.plugin(filesystemSkills,{providerName:'naumi-blender',includeDefaultRoots:false,customSkillDirs:[fileURLToPath(new URL('./blender-skills',import.meta.url))],watch:false});
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/blender',handler:createBlenderHandler(scope,runtime)}));
    scope.effect(()=>()=>runtime.close());
  });
}
