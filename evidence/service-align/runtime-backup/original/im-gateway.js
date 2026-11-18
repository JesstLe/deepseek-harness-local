import {join,dirname} from 'node:path';
import {IMStore} from './im-store.js';
import {IMService} from './im-service.js';

export function createIMHandler(scope,service){return async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Naumi-IM','1');
  const send=(status,value)=>{if(!res.destroyed)res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify(value));};
  const admission=scope.connection.admit(req);if('rejection'in admission){send(admission.rejection,{error:'AUTH_REQUIRED'});return;}
  if(admission.peer.principal.kind!=='owner'){send(403,{error:'OWNER_REQUIRED'});return;}
  try{
    if(req.method==='GET'){send(200,await service.read());return;}
    if(req.method!=='POST'){res.setHeader('Allow','GET, POST');send(405,{error:'IM_METHOD'});return;}
    if(req.headers['x-naumi-im']!=='1'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'IM_SAME_ORIGIN'});return;}
    if(!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type']??'')){send(415,{error:'IM_JSON_REQUIRED'});return;}
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>32768){send(413,{error:'IM_BODY_TOO_LARGE'});return;}chunks.push(chunk);}
    let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'IM_INVALID_REQUEST'});return;}
    send(200,await service.execute(input));
  }catch(e){const code=/^IM_[A-Z_]+$/.test(e.message)?e.message:'IM_INVALID_REQUEST';send(code==='IM_CONFLICT'?409:code==='IM_CHECK_FAILED'?502:400,{error:code});}
};}

export function installIMGateway(ctx,directory,getTasks,getGroups){
  return ctx.inject(['webServer','connection','credentials','agents'],scope=>{
    let store;try{store=new IMStore(join(dirname(directory.file),'im-gateway.sqlite'));}catch{scope.logger.warn('IM_STORAGE_UNAVAILABLE');return;}
    const service=new IMService({store,directory,getTasks,getGroups,credentials:scope.credentials,ctx:scope,onError:code=>scope.logger.warn(code)});
    const removeOwner=directory.registerSessionOwner(sessionId=>store.sessionOwner(sessionId));
    const installed=new Map(),install=agent=>{if(!installed.has(agent))installed.set(agent,service.interactions.install(agent));};
    scope.on('agent/created',({agent})=>install(agent));scope.on('agent/disposed',({agent})=>{installed.get(agent)?.();installed.delete(agent);});
    for(const agent of scope.agents.list())install(agent);
    scope.on('session/event',(_session,event)=>{if(['turn/end','tool/result','user/message'].includes(event.type))void service.kick();});
    scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/im',handler:createIMHandler(scope,service)}));
    scope.effect(()=>{
      const timer=setInterval(()=>void service.kick(),2000);timer.unref?.();
      void service.sync().then(()=>service.kick()).catch(()=>scope.logger.warn('IM_START_PENDING'));
      return async()=>{clearInterval(timer);for(const dispose of installed.values())dispose();installed.clear();await service.close();removeOwner();};
    });
  });
}
