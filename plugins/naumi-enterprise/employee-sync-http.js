import path from 'node:path';
import {z} from 'zod';
import {EmployeeSync} from './employee-sync.js';
import {businessCookie} from './domain.js';
import {EmployeeEnterpriseWork,enterpriseWorkCommand} from './employee-enterprise-work.js';

const command=z.discriminatedUnion('action',[
  z.object({action:z.literal('enroll'),name:z.string().trim().min(1).max(100)}).strict(),
  z.object({action:z.literal('enable'),enabled:z.boolean(),confirmedPrivateUpload:z.literal(true)}).strict(),
  z.object({action:z.literal('bind'),botId:z.string().min(1).max(200),employeeId:z.string().uuid()}).strict(),
  z.object({action:z.literal('sync')}).strict(),
  z.object({action:z.literal('resolve'),id:z.string().max(500),choice:z.enum(['local','remote'])}).strict(),
  z.object({action:z.literal('manage'),command:z.record(z.string(),z.unknown())}).strict(),
  z.object({action:z.literal('business'),botId:z.string().min(1).max(200),command:enterpriseWorkCommand}).strict(),
  z.object({action:z.literal('business_retry'),botId:z.string().min(1).max(200),operationId:z.string().uuid()}).strict(),
]);
export function installEmployeeSync(scope,directory,data,{origin,sync:provided}={}){
  if(!origin&&!provided)return null;
  const sync=provided??new EmployeeSync({file:path.join(path.dirname(directory.file),'employee-sync.sqlite'),store:data,directory,origin});
  sync.enterpriseWork=new EmployeeEnterpriseWork(sync);
  scope.effect(()=>scope.webServer.register({kind:'exact',path:'/naumi/employee-sync',handler:async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Type','application/json; charset=utf-8');
    const send=(status,value)=>{if(!res.destroyed)res.writeHead(status).end(JSON.stringify(value));};
    const a=scope.connection.admit(req);if('rejection'in a){send(a.rejection,{error:'HARNESS_AUTH_REQUIRED'});return;}
    if(a.peer.principal.kind!=='owner'){send(403,{error:'HARNESS_OWNER_REQUIRED'});return;}
    try{
      const q=new URL(req.url,'http://localhost').searchParams;
      if(req.method==='GET'){
        if(q.get('view')==='catalog'){const cookie=businessCookie(req.headers.cookie);if(!cookie){send(401,{error:'COLLABORATION_LOGIN_REQUIRED'});return;}send(200,await sync.catalog(cookie));}
        else if(q.get('view')==='shared')send(200,sync.sharedMemories());
        else if(q.get('view')==='operations')send(200,sync.enterpriseWork.operations(z.string().min(1).max(200).parse(q.get('botId'))));
        else send(200,sync.status());return;
      }
      if(req.method!=='POST'){send(405,{error:'METHOD_NOT_ALLOWED'});return;}
      if(req.headers['x-naumi-employee-sync']!=='1'||req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&![`http://${req.headers.host}`,`https://${req.headers.host}`].includes(req.headers.origin)){send(403,{error:'EMP_SAME_ORIGIN_REQUIRED'});return;}
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>30*1024*1024){send(413,{error:'EMP_REQUEST_TOO_LARGE'});return;}chunks.push(c);}
      let p;try{p=command.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{send(400,{error:'EMP_INVALID_REQUEST'});return;}
      const cookie=businessCookie(req.headers.cookie);
      if(['enroll','bind','manage'].includes(p.action)&&!cookie){send(401,{error:'COLLABORATION_LOGIN_REQUIRED'});return;}
      let result;
      if(p.action==='enroll')result=await sync.enroll(cookie,p.name);
      if(p.action==='bind')result=await sync.bind(p.botId,p.employeeId,cookie);
      if(p.action==='enable')result=sync.setEnabled(p.enabled);
      if(p.action==='sync')result=await sync.sync();
      if(p.action==='resolve')result=sync.resolve(p.id,p.choice);
      if(p.action==='manage')result=await sync.manager(p.command,cookie);
      if(p.action==='business')result=await sync.enterpriseWork.command(p.botId,p.command);
      if(p.action==='business_retry')result=await sync.enterpriseWork.retry(p.botId,p.operationId);
      send(200,result);
    }catch(e){const code=/^[A-Z_]+$/.test(e.message)?e.message:'EMP_CONTROL_UNAVAILABLE';send(/CONFLICT|REVISION|REPLAY/.test(code)?409:/REQUIRED|REVOKED|FORBIDDEN|APPROVAL/.test(code)?403:/UNAVAILABLE/.test(code)?503:400,{error:code});}
  }}));
  sync.start();return sync;
}
