'use strict';
// Same-origin Canvas session remains inside its existing Chromium partition.
const MAX=3*1024*1024,ROOT='/api/plugin-market/v1';
function validate(input){if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['endpoint','method','body'].includes(k)))throw Error('MARKET_REQUEST_FORBIDDEN');const method=input.method??'GET';if(typeof input.endpoint!=='string'||input.endpoint.length>2048)throw Error('MARKET_REQUEST_FORBIDDEN');const u=new URL(input.endpoint,'http://market.invalid');if(u.origin!=='http://market.invalid'||u.hash||u.username||!u.pathname.startsWith(ROOT+'/'))throw Error('MARKET_REQUEST_FORBIDDEN');
 const route=u.pathname.slice(ROOT.length);if(!(method==='GET'&&(/^\/(?:me|packages)$/.test(route)||/^\/(?:packages|downloads)\/[a-f0-9-]{36}$/.test(route))||method==='POST'&&/^\/(?:drafts|publish|visibility|download|installed|feedback)$/.test(route)))throw Error('MARKET_REQUEST_FORBIDDEN');if(method==='GET'&&input.body!==undefined||method==='POST'&&(typeof input.body!=='string'||Buffer.byteLength(input.body)>MAX))throw Error('MARKET_BODY_INVALID');return{endpoint:u.pathname+u.search,method,body:input.body};}
class MarketSession{
 constructor({identity}){this.identity=identity;this.running=0;}
 descriptor(){const i=this.identity();return i?.active?{protocolVersion:1,origin:i.active.origin}:null;}
 async perform(input,{signal}={}){const request=validate(input),identity=this.identity();if(!identity?.active||!identity.client)throw Error('MARKET_LOGIN_REQUIRED');const active=identity.active,client=identity.client,issuer=active.origin;this.running++;
  try{const response=await client.session.fetch(issuer+request.endpoint,{method:request.method,credentials:'include',redirect:'error',cache:'no-store',headers:{Accept:'application/json',...(request.method==='POST'?{'Content-Type':'application/json','x-naumi-market':'1',Origin:issuer}:{})},...(request.body===undefined?{}:{body:request.body}),signal:AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])])});if(!response.headers.get('content-type')?.includes('application/json'))throw Error('MARKET_RESPONSE_INVALID');const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>MAX+65536)throw Error('MARKET_RESPONSE_TOO_LARGE');chunks.push(Buffer.from(chunk));}if(this.identity()!==identity||identity.active!==active||identity.client!==client)throw Error('MARKET_ACCOUNT_CHANGED');return{status:response.status,body:Buffer.concat(chunks).toString('utf8')};
  }catch(error){throw Error(/^MARKET_/.test(error.message)?error.message:'MARKET_UNAVAILABLE_NO_REPLAY');}finally{this.running--;}
 }
}
module.exports={MarketSession,validate};
