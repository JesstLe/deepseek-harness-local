'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomic,exists}=require('./profile.cjs');
const MAX_REQUEST=1024*1024,MAX_RESPONSE=8*1024*1024;
function enterpriseOrigin(value){
 try{if(typeof value!=='string'||value.length>2048||value!==value.trim())throw Error();const u=new URL(value);
  if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw Error();return u.origin;
 }catch{throw Error('ENTERPRISE_ORIGIN_INVALID');}
}
function readConnection(home){
 const file=path.join(home,'desktop-enterprise.json');if(!exists(file))return null;
 if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw Error('ENTERPRISE_CONFIG_INVALID');
 let v;try{v=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('ENTERPRISE_CONFIG_INVALID');}
 if(v.version!==1||enterpriseOrigin(v.origin)!==v.origin)throw Error('ENTERPRISE_CONFIG_INVALID');return v;
}
function connect(home,origin){
 origin=enterpriseOrigin(origin);const prior=readConnection(home);
 // Switching issuer must create/migrate an isolated profile, never reuse signed device/cache state.
 if(prior&&prior.origin!==origin)throw Error('ENTERPRISE_PROFILE_SWITCH_REQUIRED');
 if(!prior)atomic(path.join(home,'desktop-enterprise.json'),{version:1,origin});return {version:1,origin};
}
function validateRequest(input,origin){
 if(!input||Array.isArray(input)||Object.keys(input).some(k=>!['origin','endpoint','method','body'].includes(k))||input.origin!==origin)throw Error('ENTERPRISE_REQUEST_FORBIDDEN');
 const method=input.method??'GET';
 if(!(input.endpoint==='/api/workspace'&&method==='GET'||input.endpoint==='/api/digital-employees'&&['GET','POST'].includes(method)))throw Error('ENTERPRISE_REQUEST_FORBIDDEN');
 if(method==='GET'&&input.body!==undefined||method==='POST'&&(typeof input.body!=='string'||Buffer.byteLength(input.body)>MAX_REQUEST))throw Error('ENTERPRISE_BODY_INVALID');
 if(method==='POST'){let v;try{v=JSON.parse(input.body);}catch{throw Error('ENTERPRISE_BODY_INVALID');}if(!v||typeof v!=='object'||Array.isArray(v))throw Error('ENTERPRISE_BODY_INVALID');
  // Chromium may retransmit a request on transport failure. Every command must retain the
  // caller's durable UUID for the enterprise transaction/receipt deduplication authority.
  if(typeof v.operationId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.operationId))throw Error('ENTERPRISE_OPERATION_ID_REQUIRED');
 }
 return {endpoint:input.endpoint,method,body:input.body};
}
class EnterpriseSession{
 constructor({origin,session}){this.origin=enterpriseOrigin(origin);this.session=session;this.running=0;}
 descriptor(){return {protocolVersion:1,origin:this.origin};}
 async perform(input,{signal}={}){
  const request=validateRequest(input,this.origin);if(this.running>=4)throw Error('ENTERPRISE_BUSY_NO_REPLAY');this.running++;
  try{
   const response=await this.session.fetch(this.origin+request.endpoint,{method:request.method,body:request.body,credentials:'include',redirect:'error',headers:{Accept:'application/json',...(request.method==='POST'?{'Content-Type':'application/json',Origin:this.origin}:{})},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)])});
   if(!response.headers.get('content-type')?.toLowerCase().includes('application/json'))throw Error('ENTERPRISE_RESPONSE_INVALID');
   const reader=response.body?.getReader();if(!reader)throw Error('ENTERPRISE_RESPONSE_INVALID');let bytes=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>MAX_RESPONSE)throw Error('ENTERPRISE_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
   const body=Buffer.concat(chunks).toString('utf8');try{JSON.parse(body);}catch{throw Error('ENTERPRISE_RESPONSE_INVALID');}
   // Only JSON and status cross the loopback bridge. No Cookie/Set-Cookie or arbitrary headers.
   return {status:response.status,body};
  }catch(error){throw Error(/^ENTERPRISE_[A-Z_]+$/.test(error.message)?error.message:'ENTERPRISE_UNAVAILABLE_NO_REPLAY');}
  finally{this.running--;}
 }
}
module.exports={enterpriseOrigin,readConnection,connect,validateRequest,EnterpriseSession,MAX_REQUEST,MAX_RESPONSE};
