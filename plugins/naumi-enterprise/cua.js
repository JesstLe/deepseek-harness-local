import {createMcpToolDefinition} from '@deepseek-ai/dsh-mcp-client';
import {isDeepStrictEqual} from 'node:util';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';
import {CuaRuntime} from './cua-runtime.js';
import {inspectCuaImageAdmission,requireCuaImageAdmission} from './cua-admission.js';
import {resolveDesktopRuntime,desktopSkillConfig,CUA_VERSION} from './desktop-runtime.js';

const number={type:'number'},integer={type:'integer'};
export const cuaSchema={type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:['status','list_windows','observe','click','double_click','right_click','type_text','press_key','hotkey','scroll','drag','release']},pid:integer,window_id:integer,app:{type:'string'},observationId:{type:'string'},x:number,y:number,from_x:number,from_y:number,to_x:number,to_y:number,text:{type:'string'},key:{type:'string'},keys:{type:'array',items:{type:'string'}},direction:{type:'string',enum:['up','down','left','right']},amount:{type:'integer'},button:{type:'string',enum:['left','right','middle']},count:{type:'integer'},duration_ms:{type:'integer'},delivery_mode:{type:'string',enum:['background','foreground']}}};
export function installCua(ctx,{runtime=new CuaRuntime(),resolve=resolveDesktopRuntime}={}){
 return ctx.inject(['tools','skills','agents','webServer','connection'],scope=>{
  scope.plugin(filesystemSkills,desktopSkillConfig());
  const definition=createMcpToolDefinition(scope,{name:'naumi_cua',rawName:'naumi_cua',description:'Operate the desktop with screenshot-grounded CUA. status, list_windows, then observe. Use the returned one-use observationId and screenshot coordinates; every action returns a fresh screenshot which must be inspected. One Session owns the desktop until release/expiry. Do not replay an uncertain action. No shell, DOM or accessibility actions in this tool.',inputSchema:cuaSchema,call:async(args,exec)=>{
   const id=exec.agent?.id;if(!id)throw Error('CUA_SESSION_REQUIRED');
   if(args.action==='status'){const [result,imageAdmission]=await Promise.all([runtime.perform(id,args,{signal:exec.signal}),inspectCuaImageAdmission(scope,exec.agent,exec.signal)]);return {...result,structuredContent:{...result.structuredContent,imageAdmission},content:[...result.content,{type:'text',text:JSON.stringify({imageAdmission})}]};}
   if(!['list_windows','release'].includes(args.action))requireCuaImageAdmission(await inspectCuaImageAdmission(scope,exec.agent,exec.signal));
   return runtime.perform(id,args,{signal:exec.signal});
  }});
  // Keep the original bridge projection, but do not leave an actionable observation when image admission fails.
  const execute=definition.execute,project=definition.projectContent,projections=new WeakMap();
  definition.execute=async(args,exec)=>{const value=await execute(args,exec);if(value.content.some(c=>c.type==='image')){const content=definition.output.render(args,value),p=project(exec,{value,content});if(!p?.some(c=>c.type==='image')){runtime.observations?.delete(exec.agent?.id);throw Error('CUA_IMAGE_ADMISSION_FAILED');}projections.set(exec,{value,content,projection:p});}return value;};
  definition.projectContent=(exec,result)=>{const p=projections.get(exec);projections.delete(exec);if(result.isError||!p||!isDeepStrictEqual(result.value,p.value)||!isDeepStrictEqual(result.content,p.content))return undefined;return p.projection;};
  scope.effect(()=>scope.tools.register(definition));
  scope.on('agent/created',({agent})=>runtime.attach(agent.id));
  scope.on('agent/disposed',({agent})=>runtime.remove(agent.id));
  scope.effect(()=>()=>runtime.close());
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/desktop',handler:async(req,res)=>{
   res.setHeader('Cache-Control','private, no-store');const send=(s,v)=>res.writeHead(s,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(v));
   const a=scope.connection.admit(req);if('rejection'in a){send(a.rejection,{error:'HARNESS_AUTH_REQUIRED'});return;}if(a.peer.principal.kind!=='owner'){send(403,{error:'HARNESS_OWNER_REQUIRED'});return;}
   if(req.method!=='GET'){res.setHeader('Allow','GET');send(405,{error:'READ_ONLY'});return;}
   let installed=false;try{resolve();installed=true;}catch{}
   const registered=scope.tools.definitions().some(t=>t.name==='naumi_cua');
   send(installed&&registered?200:503,{engine:'cua',version:CUA_VERSION,transport:'stdio',tool:'naumi_cua',status:!installed?'bundle_missing':runtime.connected?'connected':'installed',ready:installed&&registered&&runtime.connected,toolRegistered:registered,physicalInput:true,legacyDesktop:false});
  }}));
 });
}
