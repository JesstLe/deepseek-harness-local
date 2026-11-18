import fs from 'node:fs';
import path from 'node:path';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export function desktopIdentityHandler({id,key,bundleId,homeHash,enterpriseOrigin='',pid=process.pid,maintenance,onStop=()=>{if(!process.emit('SIGTERM'))process.exit(0);}}){
  if(!/^[0-9a-f-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{64}$/.test(bundleId)||!/^[a-f0-9]{64}$/.test(homeHash))throw Error('DESKTOP_IDENTITY_INVALID');
  return (req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');res.writeHead(405).end();return;}
    const nonce=req.headers['x-naumi-desktop-challenge'];
    if(req.headers.origin||typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce)){res.writeHead(403).end();return;}
    // The actual listener, never Host/X-Forwarded-* supplied by a requester or relay.
    const port=req.socket?.localPort;if(!Number.isInteger(port)||port<1||port>65535){res.writeHead(403).end();return;}
    if(req.method==='POST'){
      const action=req.headers['x-naumi-desktop-action'];
      if(action){
        const ticket=req.headers['x-naumi-desktop-ticket'],value=req.headers['x-naumi-desktop-stop'];
        if(!['quiesce','resume','quiesce-stop'].includes(action)||typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket)){res.writeHead(403).end();return;}
        const expected=createHmac('sha256',key).update([2,action,nonce,id,pid,bundleId,homeHash,port,enterpriseOrigin,ticket].join('|')).digest();
        if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!timingSafeEqual(expected,Buffer.from(value,'hex'))){res.writeHead(403).end();return;}
        try{
          if(!maintenance)throw Error('INSTALL_MAINTENANCE_UNSUPPORTED');
          if(action==='resume')maintenance.resume(ticket);else maintenance.quiesce(ticket);
          if(action==='quiesce-stop')res.once('finish',()=>setImmediate(onStop));
          res.setHeader('Connection','close');res.writeHead(200).end(JSON.stringify({version:2,maintenanceProtocol:1,state:action==='resume'?'ready':action==='quiesce-stop'?'stopping':'quiesced'}));
        }catch(error){res.writeHead(409).end(JSON.stringify({error:/^INSTALL_[A-Z_]+$/.test(error.message)?error.message:'INSTALL_ACTIVITY_UNKNOWN'}));}
        return;
      }
      const value=req.headers['x-naumi-desktop-stop'],expected=createHmac('sha256',key).update([2,'stop',nonce,id,pid,bundleId,homeHash,port,enterpriseOrigin].join('|')).digest();
      if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value)||!timingSafeEqual(expected,Buffer.from(value,'hex'))){res.writeHead(403).end();return;}
      // Host compression wraps end(chunk, encoding) and can discard its callback.
      // finish belongs to the underlying response and survives those wrappers.
      res.once('finish',()=>setImmediate(onStop));res.setHeader('Connection','close');res.writeHead(200).end(JSON.stringify({version:2,stopping:true}));return;
    }
    const proof=createHmac('sha256',key).update([2,nonce,id,pid,bundleId,homeHash,port,enterpriseOrigin].join('|')).digest('hex');
    res.writeHead(200).end(JSON.stringify({version:2,id,pid,bundleId,homeHash,port,enterpriseOrigin,proof}));
  };
}
export function installDesktopIdentity(ctx,env=process.env){
  if(!env.NAUMI_DESKTOP_INSTANCE_ID&&!env.NAUMI_DESKTOP_BUNDLE_ID)return;
  if(!env.DSH_HOME||!path.isAbsolute(env.DSH_HOME))throw Error('DESKTOP_IDENTITY_HOME_REQUIRED');
  const file=path.join(env.DSH_HOME,'desktop-instance.json');
  if(fs.lstatSync(file).isSymbolicLink())throw Error('DESKTOP_IDENTITY_INVALID');
  const identity=JSON.parse(fs.readFileSync(file,'utf8'));
  let canonical=fs.realpathSync.native(env.DSH_HOME);if(process.platform==='win32')canonical=canonical.toLowerCase();
  const homeHash=createHash('sha256').update('naumi-home-v1\0'+canonical).digest('hex');
  if(identity.version!==1||identity.id!==env.NAUMI_DESKTOP_INSTANCE_ID||identity.homeHash!==homeHash)throw Error('DESKTOP_IDENTITY_INVALID');
  let maintenance;
  if(env.NAUMI_DESKTOP_MAINTENANCE==='1'){
    maintenance=createDesktopMaintenance();
    ctx.inject(['agents','tools'],scope=>{
      maintenance.inspect=()=>scope.agents.list();
      scope.on('agent/pre-step',async(_payload,next)=>maintenance.blocked()?{kind:'reject'}:next());
      const guard=scope.tools.guard(()=>maintenance.blocked()?'INSTALL_MAINTENANCE_ACTIVE':undefined);scope.effect(()=>guard);
      scope.on('tools/execute',async(_exec,next)=>{maintenance.enter();try{return await next();}finally{maintenance.leave();}});
      scope.on('llm/stream',async function*(_options,next){maintenance.enter();try{yield* next();}finally{maintenance.leave();}});
    });
  }
  const handler=desktopIdentityHandler({...identity,maintenance,bundleId:env.NAUMI_DESKTOP_BUNDLE_ID,enterpriseOrigin:env.NAUMI_ENTERPRISE_ORIGIN??''});
  ctx.effect(()=>ctx.webServer.register({kind:'exact',path:'/naumi/desktop-instance',handler}));
  // Use the registry's first-use transaction, not OS Documents discovery or a shared global folder.
  // Existing registries/history and deliberate default-workspace deletions remain authoritative.
  ctx.inject(['workspaceRegistry'],async scope=>{
    await scope.workspaceRegistry.initializeDefault(async()=>{
      const directory=path.join(env.DSH_HOME,'workspace');
      if(fs.existsSync(directory)&&(!fs.lstatSync(directory).isDirectory()||fs.lstatSync(directory).isSymbolicLink()))throw Error('DESKTOP_WORKSPACE_UNMANAGED');
      return directory;
    });
  });
}

/** Synchronous admission latch closes the idle-check/start race. A lost installer
 * releases the transient latch after 30s; the installation lease separately
 * prevents a new GUI while its exact installer process is alive. */
export function createDesktopMaintenance({inspect,clock=Date.now,leaseMs=30000}={}){
  let ticket=null,until=0,active=0;
  const blocked=()=>{if(ticket&&clock()>=until){ticket=null;until=0;}return !!ticket;};
  return {inspect,blocked,
    enter(){if(blocked())throw Error('INSTALL_MAINTENANCE_ACTIVE');active++;},
    leave(){active--;if(active<0)throw Error('INSTALL_ACTIVITY_UNKNOWN');},
    quiesce(value){
      if(blocked()&&ticket!==value)throw Error('INSTALL_MAINTENANCE_BUSY');
      const previous=ticket;ticket=value;until=clock()+leaseMs;
      try{const agents=this.inspect?.();if(!Array.isArray(agents)||agents.some(a=>!a||!['idle','running'].includes(a.status)))throw Error('INSTALL_ACTIVITY_UNKNOWN');if(active||agents.some(a=>a.status==='running'))throw Error('INSTALL_RUNNING_TASKS');}
      catch(error){ticket=previous;if(!previous)until=0;throw error;}
    },
    resume(value){if(blocked()&&ticket!==value)throw Error('INSTALL_MAINTENANCE_BUSY');ticket=null;until=0;}
  };
}
