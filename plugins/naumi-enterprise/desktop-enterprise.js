import fs from 'node:fs';
import path from 'node:path';

/** A finite session API, not a cookie exporter or general HTTP proxy. */
export class DesktopEnterpriseTransport{
 constructor({origin,home=process.env.DSH_HOME,standalone=!!process.env.NAUMI_DESKTOP_INSTANCE_ID,fetch:request=globalThis.fetch}={}){Object.assign(this,{origin,home,standalone,request});}
 descriptor(){
  if(!this.standalone||!this.home)return null;const file=path.join(this.home,'naumi-desktop-bridge.json');
  try{const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error();const d=JSON.parse(fs.readFileSync(file,'utf8'));
   if(d.version!==1||!Number.isInteger(d.port)||d.port<1||d.port>65535||!Number.isInteger(d.pid)||d.pid<1||!/^[a-f0-9]{64}$/.test(d.token)||d.enterprise?.protocolVersion!==1||d.enterprise.origin!==this.origin)throw Error();return d;
  }catch(e){if(e.code==='ENOENT')return null;throw Error('ENTERPRISE_BRIDGE_INVALID');}
 }
 available(){return !!this.descriptor();}
 async fetch(endpoint,options={}){
  const d=this.descriptor();if(!d)throw Error('COLLABORATION_LOGIN_REQUIRED');
  if(!(endpoint==='/api/workspace'&&(options.method??'GET')==='GET'||endpoint==='/api/digital-employees'&&['GET','POST'].includes(options.method??'GET')))throw Error('ENTERPRISE_REQUEST_FORBIDDEN');
  let response;try{response=await this.request(`http://127.0.0.1:${d.port}/enterprise/request`,{method:'POST',headers:{Authorization:'Bearer '+d.token,'Content-Type':'application/json'},body:JSON.stringify({origin:this.origin,endpoint,method:options.method??'GET',...(options.body===undefined?{}:{body:options.body})}),redirect:'error',signal:AbortSignal.any([...(options.signal?[options.signal]:[]),AbortSignal.timeout(18000)])});}catch{throw Error('ENTERPRISE_UNAVAILABLE_NO_REPLAY');}
  const text=await response.text();if(text.length>9*1024*1024)throw Error('ENTERPRISE_RESPONSE_TOO_LARGE');let result;try{result=JSON.parse(text);}catch{throw Error('ENTERPRISE_RESPONSE_INVALID');}
  if(!response.ok||!result.ok)throw Error(/^ENTERPRISE_[A-Z_]+$/.test(result.error)?result.error:'ENTERPRISE_UNAVAILABLE_NO_REPLAY');
  if(!Number.isInteger(result.data?.status)||result.data.status<200||result.data.status>599||typeof result.data.body!=='string')throw Error('ENTERPRISE_RESPONSE_INVALID');
  return new Response(result.data.body,{status:result.data.status,headers:{'Content-Type':'application/json'}});
 }
}
export function desktopCollaborationOrigin(fallback,env=process.env){
 if(!env.NAUMI_DESKTOP_INSTANCE_ID)return fallback;
 const file=path.join(env.DSH_HOME,'desktop-enterprise.json');
 // A Canvas account can open the local workbench before linking enterprise collaboration.
 // No business session is granted: desktop requests still go through the scoped native bridge.
 if(!env.NAUMI_ENTERPRISE_ORIGIN&&!fs.existsSync(file))return fallback;
 const config=JSON.parse(fs.readFileSync(file,'utf8'));
 if(config.version!==1||config.origin!==env.NAUMI_ENTERPRISE_ORIGIN)throw Error('ENTERPRISE_CONFIG_INVALID');
 const u=new URL(config.origin);if(u.origin!==config.origin||u.username||u.password||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error('ENTERPRISE_CONFIG_INVALID');return u.origin;
}
