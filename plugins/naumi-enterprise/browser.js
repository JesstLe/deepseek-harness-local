import {defineTool} from '@deepseek-ai/dsh-tools';
import * as filesystemSkills from '@deepseek-ai/dsh-skill-filesystem';
import {fileURLToPath} from 'node:url';
import {BROWSER_ACTIONS} from './browser-runtime.js';
import {NativeBrowserRuntime} from './native-browser-runtime.js';

export function createBrowserTool(runtime){
  return defineTool({name:'naumi_browser',description:'Operate the same page displayed in this Naumi session’s right sidebar. Desktop uses native Chromium; Web uses the legacy ego transport. Read the naumi-browser skill first. Observe with snapshot before semantic click/fill. Never replay an uncertain write. No arbitrary JavaScript or shell execution.',
    parameters:{action:{type:'string',enum:BROWSER_ACTIONS,required:true},url:{type:'string'},selector:{type:'string'},text:{type:'string'},key:{type:'string'},label:{type:'string'},x:{type:'number'},y:{type:'number'},deltaX:{type:'number'},deltaY:{type:'number'}},
    output:{schema:{type:'json'},render:(_args,data)=>[{type:'text',text:JSON.stringify(data)}]},
    async execute(args,exec){const sessionId=exec.agent?.id;if(!sessionId)throw Error('BROWSER_SESSION_REQUIRED');return runtime.perform(sessionId,{...args,frame:false},{signal:exec.signal});}
  });
}

export function installEgoBrowser(ctx,{runtime=new NativeBrowserRuntime()}={}){
  let toolRegistered=false;
  ctx.effect(()=>()=>runtime.dispose());
  ctx.inject(['skills'],scope=>{scope.plugin(filesystemSkills,{providerName:'naumi-browser',includeDefaultRoots:false,watch:false,customSkillDirs:[],bundledSkillDir:fileURLToPath(new URL('./browser-skills',import.meta.url))});});
  ctx.inject(['tools'],scope=>scope.effect(()=>{const dispose=scope.tools.register(createBrowserTool(runtime));toolRegistered=true;return()=>{toolRegistered=false;dispose();};}));
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/naumi/browser',handler:async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,data)=>{if(!res.destroyed){res.writeHead(status);res.end(JSON.stringify(data));}};
    const admission=ctx.connection.admit(req);
    if('rejection'in admission){send(admission.rejection,{error:'HARNESS_AUTH_REQUIRED'});return;}
    if(admission.peer.principal.kind!=='owner'){send(403,{error:'HARNESS_OWNER_REQUIRED'});return;}
    if(req.method==='GET'){send(200,{...runtime.status(),toolRegistered});return;}
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'METHOD_NOT_ALLOWED'});return;}
    if(req.headers['x-naumi-browser']!=='1'){send(403,{error:'BROWSER_SAME_ORIGIN_REQUIRED'});return;}
    if(req.headers.origin){let origin;try{origin=new URL(req.headers.origin).origin;}catch{}if(origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`){send(403,{error:'BROWSER_SAME_ORIGIN_REQUIRED'});return;}}
    const controller=new AbortController(),closed=()=>{if(!res.writableEnded)controller.abort(Error('BROWSER_CLIENT_CLOSED'));};res.on('close',closed);
    try{
      let raw='',size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){send(413,{error:'BROWSER_BODY_TOO_LARGE'});return;}raw+=chunk.toString();}
      let body;try{body=JSON.parse(raw);}catch{send(400,{error:'INVALID_BROWSER_JSON'});return;}
      if(typeof body.sessionId!=='string'||!body.sessionId||body.sessionId.length>200){send(400,{error:'BROWSER_SESSION_REQUIRED'});return;}
      const result=await runtime.perform(body.sessionId,body,{signal:controller.signal});send(200,result);
    }catch(error){const code=String(error.message);send(/^(?:INVALID_|BROWSER_SESSION)/.test(code)?400:503,{error:/^[A-Z][A-Z0-9_]{2,80}$/.test(code)?code:'EGO_OPERATION_FAILED'});}
    finally{res.off('close',closed);}
  }}));
}
