import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {z} from 'zod';
import {BlenderRuntime,blenderHome} from '../blender-runtime.js';
import {requestBlender} from './client.js';

export function createBlenderServer(home=process.env.NAUMI_BLENDER_HOME??blenderHome()){
 const server=new McpServer({name:'naumi-blender',version:'1.0.0'},{instructions:'Naumi local Blender tools. First inspect blender_status and get_scene_info. If disconnected, the user can launch Blender in Settings > Blender. Preserve existing objects unless explicitly asked to replace them. execute_blender_code is full bpy/Python and inherits the existing tool approval policy, not a sandbox. Use one UUID requestId per mutation and reuse it only for the SAME request. A timeout is UNKNOWN: query operation_status, never blindly rerun with another UUID. Preview is not file delivery; save requested .blend/export/render files into the task workspace and use native present. No paid asset generation or telemetry is included.'});
 const runtime=new BlenderRuntime({home});
 const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],...value?.state==='failed'?{isError:true}:{}});
 const wrap=fn=>async(args,ctx)=>{try{return await fn(args,ctx);}catch(e){return {isError:true,content:[{type:'text',text:/^BLENDER_[A-Z_]+$/.test(e.message)?e.message:'BLENDER_OPERATION_FAILED'}]};}};
 const read={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
 server.registerTool('blender_status',{description:'Check bundled MCP, installed Blender and authenticated local connection separately. Does not launch Blender.',inputSchema:z.object({}).strict(),annotations:read},wrap(async()=>result(await runtime.status())));
 server.registerTool('get_scene_info',{description:'Read the actual connected Blender scene, object count and object names. Does not change the scene.',inputSchema:z.object({}).strict(),annotations:read},wrap(async(_,ctx)=>result(await requestBlender(home,'get_scene_info',{}, {signal:ctx.signal}))));
 server.registerTool('get_object_info',{description:'Read one exact named Blender object.',inputSchema:z.object({name:z.string().min(1).max(256)}).strict(),annotations:read},wrap(async(args,ctx)=>result(await requestBlender(home,'get_object_info',args,{signal:ctx.signal}))));
 server.registerTool('execute_blender_code',{description:'Execute requested Python/bpy in the managed Blender main thread. Full local Python access; writes require the existing tool permission. Stable UUID requestId required; query receipt on timeout, never blind replay.',inputSchema:z.object({requestId:z.uuid(),code:z.string().min(1).max(131072)}).strict(),annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:true}},wrap(async({requestId,code},ctx)=>result(await requestBlender(home,'execute_code',{code},{requestId,signal:ctx.signal}))));
 server.registerTool('operation_status',{description:'Reconcile the exact durable mutation UUID, including completed, failed and unknown. Does not rerun it.',inputSchema:z.object({requestId:z.uuid()}).strict(),annotations:read},wrap(async(args,ctx)=>result(await requestBlender(home,'operation_status',args,{signal:ctx.signal}))));
 server.registerTool('render_preview',{description:'Render a Workbench camera preview and return a PNG image; restores render settings afterward. Requires an existing scene camera. Not final file delivery.',inputSchema:z.object({requestId:z.uuid(),width:z.number().int().min(64).max(1600).default(640),height:z.number().int().min(64).max(1200).default(480)}).strict(),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}},wrap(async({requestId,...args},ctx)=>{
  const receipt=await requestBlender(home,'render_preview',args,{requestId,signal:ctx.signal});if(receipt.state!=='completed')return result(receipt);
  const file=path.resolve(receipt.imagePath),folder=path.resolve(home,'previews');if(!file.startsWith(folder+path.sep)||path.basename(file)!==requestId+'.png')throw Error('BLENDER_PREVIEW_SCOPE');
  const bytes=fs.readFileSync(file);if(bytes.length>6*1024*1024||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('BLENDER_PREVIEW_INVALID');
  return {content:[{type:'image',mimeType:'image/png',data:bytes.toString('base64')},{type:'text',text:JSON.stringify({requestId,state:'completed',preview:true})}]};
 }));
 return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){serveStdio(()=>createBlenderServer());}
