import os from 'node:os';
import path from 'node:path';
import {CreationSessions} from './creation-runtime.js';

export function installCreation(ctx,{home=process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),onReady}={}){
 return ctx.inject(['agents','tools','systemPrompt','workingDirectory','webServer','connection'],scope=>{
  const manager=new CreationSessions({ctx:scope,home});onReady?.(manager);
  const ensure=async agent=>{try{await manager.ensure(agent);}catch{scope.logger.warn('CREATION_SESSION_NOT_READY');}};
  scope.on('agent/created',({agent})=>ensure(agent));
  scope.on('agent/disposed',({agent})=>manager.remove(agent));
  scope.on('agent/pre-step',async({agent},next)=>{await ensure(agent);return next();});
  for(const agent of scope.agents.list())void ensure(agent);
  scope.effect(()=>()=>manager.close());
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/creation',handler:async(req,res)=>{
   res.setHeader('Cache-Control','private, no-store');const send=(code,value)=>{if(!res.destroyed)res.writeHead(code,{'Content-Type':'application/json'}).end(JSON.stringify(value));};
   const a=scope.connection.admit(req);if('rejection'in a){send(a.rejection,{error:'CREATION_OWNER_REQUIRED'});return;}if(a.peer.principal.kind!=='owner'){send(403,{error:'CREATION_OWNER_REQUIRED'});return;}
   try{
    if(req.method==='GET'){
     const id=new URL(req.url,'http://local').searchParams.get('sessionId');if(!id){send(200,{namespace:'naumi_creation',sessions:manager.entries.size,enabled:manager.enabled});return;}
     const agent=scope.agents.list().find(a=>a.id===id);if(!agent){send(404,{error:'CREATION_SESSION_NOT_LOADED'});return;}send(200,await manager.health(agent));return;
    }
    if(req.method!=='POST'){send(405,{error:'CREATION_METHOD_INVALID'});return;}
    if(req.headers['x-naumi-creation']!=='1'||!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'CREATION_SAME_ORIGIN_REQUIRED'});return;}
    let bytes=0;const chunks=[];for await(const b of req){bytes+=b.length;if(bytes>1024)throw Error('CREATION_INPUT_INVALID');chunks.push(b);}
    const input=JSON.parse(Buffer.concat(chunks));if(Object.keys(input).length!==1||!['disconnect','refresh'].includes(input.action))throw Error('CREATION_INPUT_INVALID');
    if(input.action==='disconnect')await manager.disconnect();else await manager.refresh();send(200,{ok:true,namespace:'naumi_creation',sessions:manager.entries.size,enabled:manager.enabled});
   }catch(e){send(400,{error:/^CREATION_[A-Z_]+$/.test(e.message)?e.message:'CREATION_OPERATION_FAILED'});}
  }}));
 });
}
