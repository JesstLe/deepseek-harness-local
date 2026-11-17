import fs from 'node:fs';
import path from 'node:path';
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export function desktopIdentityHandler({id,key,bundleId,homeHash,enterpriseOrigin='',pid=process.pid,onStop=()=>{if(!process.emit('SIGTERM'))process.exit(0);}}){
  if(!/^[0-9a-f-]{36}$/.test(id)||!/^[a-f0-9]{64}$/.test(key)||!/^[a-f0-9]{64}$/.test(bundleId)||!/^[a-f0-9]{64}$/.test(homeHash))throw Error('DESKTOP_IDENTITY_INVALID');
  return (req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');res.setHeader('X-Content-Type-Options','nosniff');
    if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');res.writeHead(405).end();return;}
    const nonce=req.headers['x-naumi-desktop-challenge'];
    if(req.headers.origin||typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce)){res.writeHead(403).end();return;}
    // The actual listener, never Host/X-Forwarded-* supplied by a requester or relay.
    const port=req.socket?.localPort;if(!Number.isInteger(port)||port<1||port>65535){res.writeHead(403).end();return;}
    if(req.method==='POST'){
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
  const handler=desktopIdentityHandler({...identity,bundleId:env.NAUMI_DESKTOP_BUNDLE_ID,enterpriseOrigin:env.NAUMI_ENTERPRISE_ORIGIN??''});
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
