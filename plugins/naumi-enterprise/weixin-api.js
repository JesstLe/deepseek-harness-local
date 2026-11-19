// Protocol adapted from Tencent openclaw-weixin 2.4.10 (MIT); see third-party/weixin/.
import {randomBytes} from 'node:crypto';
import {PRODUCT_VERSION} from './product-version.js';
export const WEIXIN_BASE='https://ilinkai.weixin.qq.com';
export function weixinBase(value=WEIXIN_BASE){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||u.pathname!=='/'||!(u.hostname==='weixin.qq.com'||u.hostname.endsWith('.weixin.qq.com')))throw Error('IM_WEIXIN_ORIGIN');return u.origin;}
const fail=(code,status)=>{throw Object.assign(Error(code),{status,permanent:status>=400&&status<500&&status!==429});};
export async function weixinRequest({baseURL=WEIXIN_BASE,path,token,body,signal,timeoutMs=40000,request=fetch}){
 const base=weixinBase(baseURL),headers={'iLink-App-Id':'bot','iLink-App-ClientVersion':'132106'};
 if(body!==undefined)Object.assign(headers,{'Content-Type':'application/json',AuthorizationType:'ilink_bot_token','X-WECHAT-UIN':Buffer.from(String(randomBytes(4).readUInt32BE())).toString('base64')});
 if(token)headers.Authorization='Bearer '+token;
 const res=await request(base+'/'+path,{method:body===undefined?'GET':'POST',headers,...body===undefined?{}:{body:JSON.stringify({...body,base_info:{channel_version:'2.4.10',bot_agent:'Naumi/'+PRODUCT_VERSION}})},redirect:'error',signal:AbortSignal.any([AbortSignal.timeout(timeoutMs),...signal?[signal]:[]])});
 if(!res.ok){await res.body?.cancel();fail('IM_WEIXIN_HTTP',res.status);}
 const chunks=[];let bytes=0;const reader=res.body?.getReader();if(!reader)fail('IM_WEIXIN_RESPONSE',502);
 try{for(;;){const r=await reader.read();if(r.done)break;bytes+=r.value.length;if(bytes>2*1024*1024)fail('IM_WEIXIN_RESPONSE_LIMIT',502);chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
 // Weixin message identifiers are uint64. Quote only unquoted ID fields, never round them.
 const raw=Buffer.concat(chunks).toString('utf8').replace(/("(?:message_id|seq)"\s*:\s*)(\d+)(?=\s*[,}])/g,'$1"$2"');let data;try{data=JSON.parse(raw);}catch{fail('IM_WEIXIN_RESPONSE',502);}
 if(data.ret&&data.ret!==0||data.errcode&&data.errcode!==0)fail(data.errcode===-14?'IM_WEIXIN_LOGIN_EXPIRED':'IM_WEIXIN_REJECTED',data.errcode===-14?401:400);
 return data;
}
