import {randomUUID} from 'node:crypto';
import {weixinBase,weixinRequest} from '../../weixin-api.js';
const sleep=(ms,signal)=>new Promise(resolve=>{const done=()=>{clearTimeout(t);signal.removeEventListener('abort',done);resolve();},t=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
export default {
 id:'weixin',capabilities:{files:false},async check(fields){weixinBase(fields.baseURL);if(!fields.token||!fields.ownerUserId)throw Error('IM_WEIXIN_CREDENTIAL');},
 connect(fields,env,{onMessage,onStatus}){
  const ac=new AbortController(),request=options=>weixinRequest({baseURL:fields.baseURL,token:fields.token,request:env.fetch,signal:ac.signal,...options});let failures=0;
  const handle={stop:()=>ac.abort(),async send(chat,payload){
   if(ac.signal.aborted||chat.kind!=='direct'||chat.key!==fields.ownerUserId)throw Object.assign(Error('IM_WEIXIN_OWNER'),{permanent:true});
   const context=env.loadState('context');if(!context?.token||context.userId!==fields.ownerUserId)throw Object.assign(Error('IM_WEIXIN_CONTEXT_REQUIRED'),{permanent:true});
   const id='naumi-'+randomUUID(),v=await request({path:'ilink/bot/sendmessage',timeoutMs:15000,body:{msg:{from_user_id:'',to_user_id:fields.ownerUserId,client_id:id,message_type:2,message_state:2,context_token:context.token,item_list:[{type:1,text_item:{text:payload.text}}]}}});
   return{messageId:String(v.message_id??id)};
  }};
  void(async()=>{onStatus({state:'connecting'});while(!ac.signal.aborted){try{
   const v=await request({path:'ilink/bot/getupdates',body:{get_updates_buf:env.loadState('cursor')??''},timeoutMs:40000});failures=0;onStatus({state:'ready'});
   if(!Array.isArray(v.msgs??[])||(v.msgs??[]).length>500)throw Error('IM_WEIXIN_RESPONSE');
   for(const m of v.msgs??[]){if(ac.signal.aborted)break;
    if(m.message_type!==1||m.group_id||m.from_user_id!==fields.ownerUserId||m.to_user_id&&m.to_user_id!==fields.botId)continue;
    const msgid=m.message_id??m.client_id;if(typeof msgid!=='string'||!msgid||msgid.length>200||typeof m.context_token!=='string'||m.context_token.length>16384)continue;
    const items=m.item_list??[],supported=items.length>0&&items.every(i=>i.type===1&&typeof i.text_item?.text==='string');const text=items.map(i=>i.text_item?.text??'').join('\n');
    // Persist context before durable admission; commit cursor only after every callback succeeded.
    env.saveState('context',{token:m.context_token,userId:m.from_user_id});
    await onMessage({chat:{key:m.from_user_id,kind:'direct'},sender:{id:m.from_user_id},messageId:msgid,text:supported&&text.length<=8000?text:'[微信非文字或超长消息]',unsupported:!supported||text.length>8000,images:[]});
   }
   if(!ac.signal.aborted&&typeof v.get_updates_buf==='string'&&v.get_updates_buf.length<65536)env.saveState('cursor',v.get_updates_buf);
   if(!(v.msgs??[]).length)await sleep(500,ac.signal);
  }catch(e){if(ac.signal.aborted)break;if(e.message==='IM_WEIXIN_LOGIN_EXPIRED'){onStatus({state:'error'});break;}onStatus({state:'retrying'});await sleep(Math.min(30000,1000*2**Math.min(++failures,5)),ac.signal);}}})();
  return handle;
 }
};
