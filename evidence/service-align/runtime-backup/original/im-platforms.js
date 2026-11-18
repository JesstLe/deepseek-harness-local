import dingtalk from './im-adapters/platforms/dingtalk.js';
import feishu from './im-adapters/platforms/feishu.js';

const fail=(code,permanent=true)=>{throw Object.assign(Error(code),{permanent});};
async function json(response){const body=await response.json();if(!response.ok||body.code&&body.code!==0||body.errcode&&body.errcode!==0)throw Object.assign(Error('IM_PLATFORM_REJECTED'),{status:response.status,permanent:response.status!==429&&response.status<500});return body;}

/** Bounded, same-platform network boundary shared by unchanged protocol implementations. */
export function platformEnvironment(platform,{request=fetch,WebSocket:Socket=WebSocket,config}={}){
  const allowed=platform==='dingtalk'?['api.dingtalk.com','oapi.dingtalk.com']:['open.feishu.cn','open.larksuite.com'];
  return {WebSocket:Socket,config,log:{warn(){}},fetch:async(url,options={})=>{
    const parsed=new URL(url);
    if(!config&&(parsed.protocol!=='https:'||parsed.username||parsed.password||!allowed.includes(parsed.hostname)))fail('IM_PLATFORM_ORIGIN');
    const response=await request(url,{...options,redirect:'error',signal:options.signal?AbortSignal.any([options.signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});
    // Adapter image reads must not allocate an unbounded response body.
    if(parsed.pathname.includes('/resources/')){
      const reader=response.body?.getReader();if(!reader)fail('IM_RESOURCE_MISSING');const chunks=[];let size=0;
      try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>5*1024*1024)fail('IM_RESOURCE_TOO_LARGE');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
      return new Response(Buffer.concat(chunks),{status:response.status,headers:response.headers});
    }
    return response;
  }};
}

/** Add outbound file capability without replacing the reused stream/WebSocket adapters. */
function withFiles(adapter){return {...adapter,async sendFile(fields,env,chat,{name,data}){
  if(data.byteLength>10*1024*1024)fail('IM_FILE_TOO_LARGE');
  if(adapter.id==='feishu'){
    const base=fields.domain==='lark'?'https://open.larksuite.com':'https://open.feishu.cn';
    const token=(await json(await env.fetch(base+'/open-apis/auth/v3/tenant_access_token/internal',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({app_id:fields.appId,app_secret:fields.appSecret})}))).tenant_access_token;
    if(!token)fail('IM_TOKEN_MISSING');
    const form=new FormData();form.set('file_type','stream');form.set('file_name',name);form.set('file',new Blob([data]),name);
    const uploaded=await json(await env.fetch(base+'/open-apis/im/v1/files',{method:'POST',headers:{authorization:'Bearer '+token},body:form}));
    if(!uploaded.data?.file_key)fail('IM_FILE_RECEIPT_MISSING');
    const sent=await json(await env.fetch(base+'/open-apis/im/v1/messages?receive_id_type=chat_id',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({receive_id:chat.key,msg_type:'file',content:JSON.stringify({file_key:uploaded.data.file_key})})}));
    return {messageId:sent.data?.message_id};
  }
  const token=(await json(await env.fetch('https://oapi.dingtalk.com/gettoken?appkey='+encodeURIComponent(fields.clientId)+'&appsecret='+encodeURIComponent(fields.clientSecret)))).access_token;
  if(!token)fail('IM_TOKEN_MISSING');
  const form=new FormData();form.set('media',new Blob([data]),name);
  const uploaded=await json(await env.fetch('https://oapi.dingtalk.com/media/upload?access_token='+encodeURIComponent(token)+'&type=file',{method:'POST',body:form}));
  if(!uploaded.media_id)fail('IM_FILE_RECEIPT_MISSING');
  const direct=chat.kind==='direct',body={robotCode:fields.clientId,msgKey:'sampleFile',msgParam:JSON.stringify({mediaId:uploaded.media_id,fileName:name,fileType:name.split('.').pop()}),...(direct?{userIds:[chat.key]}:{openConversationId:chat.key})};
  const sent=await json(await env.fetch('https://api.dingtalk.com/v1.0/robot/'+(direct?'oToMessages/batchSend':'groupMessages/send'),{method:'POST',headers:{'x-acs-dingtalk-access-token':token,'content-type':'application/json'},body:JSON.stringify(body)}));
  return {messageId:sent.processQueryKey};
}};}
export const IM_PLATFORMS={dingtalk:withFiles(dingtalk),feishu:withFiles(feishu)};
