import test from 'node:test';
import assert from 'node:assert/strict';
import dingtalk from '../plugins/naumi-enterprise/im-adapters/platforms/dingtalk.js';
import feishu,{encodeFrame,decodeFrame} from '../plugins/naumi-enterprise/im-adapters/platforms/feishu.js';
import {IM_PLATFORMS,platformEnvironment} from '../plugins/naumi-enterprise/im-platforms.js';

const tick=()=>new Promise(r=>setTimeout(r,10));
class Socket extends EventTarget{
 static all=[];constructor(url){super();this.url=url;this.readyState=1;this.sent=[];Socket.all.push(this);}
 send(data){this.sent.push(data);}close(){this.readyState=3;}open(){this.dispatchEvent(new Event('open'));}
 message(data){this.dispatchEvent(new MessageEvent('message',{data}));}
}
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});

test('REAL DingTalk adapter admits before ACK, handles ping and sends to exact original direct/group destination',async t=>{
 Socket.all=[];const requests=[],messages=[],statuses=[];let release;
 const held=new Promise(r=>{release=r;});
 const env={WebSocket:Socket,fetch:async(url,options={})=>{requests.push({url,options});if(url.includes('/gettoken'))return response({errcode:0,access_token:'token'});if(url.includes('connections/open'))return response({endpoint:'wss://stream.dingtalk.com',ticket:'ticket'});return response({processQueryKey:'receipt'});}};
 const handle=dingtalk.connect({clientId:'app',clientSecret:'secret'},env,{onMessage:async m=>{messages.push(m);await held;},onStatus:s=>statuses.push(s.state)});t.after(()=>handle.stop());
 await tick();const socket=Socket.all[0];socket.open();assert.equal(statuses.at(-1),'ready');
 socket.message(JSON.stringify({type:'CALLBACK',headers:{messageId:'frame'},data:JSON.stringify({conversationType:'1',senderStaffId:'user',text:{content:'你好'},msgId:'message'})}));await tick();assert.equal(messages[0].chat.key,'user');assert.equal(socket.sent.length,0);release();await tick();assert.equal(JSON.parse(socket.sent[0]).headers.messageId,'frame');
 socket.message(JSON.stringify({type:'SYSTEM',headers:{topic:'ping'},data:'ping'}));assert.equal(JSON.parse(socket.sent.at(-1)).data,'ping');
 await handle.send({kind:'direct',key:'user'},{text:'结果'});await handle.send({kind:'group',key:'group-42'},{text:'群结果'});
 const bodies=requests.filter(r=>r.options.body).map(r=>JSON.parse(r.options.body));assert.deepEqual(bodies.find(b=>b.userIds)?.userIds,['user']);assert.equal(bodies.find(b=>b.openConversationId)?.openConversationId,'group-42');
});

test('REAL DingTalk adapter does not ACK failed durable admission and old stopped sockets ignore callbacks',async t=>{
 Socket.all=[];let count=0;const env={WebSocket:Socket,log:{warn(){}},fetch:async url=>url.includes('gettoken')?response({errcode:0,access_token:'x'}):response({endpoint:'wss://socket',ticket:'t'})};
 const handle=dingtalk.connect({clientId:'a',clientSecret:'b'},env,{onStatus(){},onMessage:async()=>{count++;throw Error('disk full');}});t.after(()=>handle.stop());await tick();const socket=Socket.all[0];socket.open();const message=JSON.stringify({type:'CALLBACK',headers:{messageId:'f'},data:JSON.stringify({conversationType:'1',senderStaffId:'u',text:{content:'x'},msgId:'m'})});socket.message(message);await tick();assert.equal(socket.sent.length,0);handle.stop();socket.message(message);await tick();assert.equal(count,1);
});

test('REAL Feishu protobuf adapter reassembles fragments, ACKs after durable admission, preserves Lark domain and sends cards',async t=>{
 Socket.all=[];const requests=[],messages=[];let release;const held=new Promise(r=>{release=r;});
 const env={WebSocket:Socket,fetch:async(url,options={})=>{requests.push({url,options});if(url.includes('tenant_access_token'))return response({tenant_access_token:'token',expire:7200});if(url.includes('/bot/v3/info'))return response({code:0,bot:{open_id:'bot-open'}});if(url.includes('ws/endpoint'))return response({code:0,data:{URL:'wss://socket?service_id=1'}});return response({code:0,data:{message_id:'receipt'}});}};
 const handle=feishu.connect({appId:'app',appSecret:'secret',domain:'lark'},env,{onStatus(){},onMessage:async m=>{messages.push(m);await held;},onAction(){}});t.after(()=>handle.stop());await tick();const socket=Socket.all[0];assert.ok(socket);socket.open();
 const payload=Buffer.from(JSON.stringify({header:{event_type:'im.message.receive_v1'},event:{sender:{sender_id:{open_id:'human'}},message:{chat_type:'p2p',chat_id:'chat',message_id:'msg',message_type:'text',content:JSON.stringify({text:'hi'})}}}));const middle=Math.floor(payload.length/2);
 const frame=(seq,data)=>encodeFrame({method:1,headers:[{key:'type',value:'event'},{key:'message_id',value:'f'},{key:'sum',value:'2'},{key:'seq',value:String(seq)}],payload:data});
 socket.message(frame(1,payload.subarray(middle)));await tick();assert.equal(messages.length,0);const before=socket.sent.length;socket.message(frame(0,payload.subarray(0,middle)));await tick();assert.equal(messages.length,1);assert.equal(socket.sent.length,before);release();await tick();assert.equal(socket.sent.length,before+2);
 assert.equal(messages[0].messageId,'msg');assert.equal(messages[0].sender.id,'human');assert.ok(requests.every(r=>r.url.startsWith('https://open.larksuite.com')));
 await handle.send({kind:'direct',key:'chat'},{text:'审批',buttons:[{label:'允许一次',data:'im:token:allow'}]});const sent=JSON.parse(requests.at(-1).options.body);assert.equal(sent.receive_id,'chat');assert.equal(sent.msg_type,'interactive');assert.match(sent.content,/im:token:allow/);
 const decoded=decodeFrame(encodeFrame({SeqID:42,method:1,headers:[{key:'x',value:'y'}],payload:Buffer.from('abc')}));assert.equal(decoded.SeqID,42);assert.equal(decoded.payload.toString(),'abc');
});

test('platform network wrapper disallows credential redirect/off-platform webhooks and caps inbound resource bytes',async()=>{
 const env=platformEnvironment('dingtalk',{request:async(_u,o)=>{assert.equal(o.redirect,'error');return response({});},WebSocket:Socket});
 await assert.rejects(env.fetch('http://oapi.dingtalk.com/token'),/IM_PLATFORM_ORIGIN/);await assert.rejects(env.fetch('https://evil.invalid/hook'),/IM_PLATFORM_ORIGIN/);await env.fetch('https://oapi.dingtalk.com/gettoken');
 const resources=platformEnvironment('feishu',{WebSocket:Socket,request:async()=>new Response(Buffer.alloc(5*1024*1024+1))});await assert.rejects(resources.fetch('https://open.feishu.cn/open-apis/im/v1/messages/id/resources/key'),/IM_RESOURCE_TOO_LARGE/);
});

test('file capability uses real platform multipart endpoints and exact destination without local file paths',async()=>{
 for(const platform of ['feishu','dingtalk']){
  const requests=[],env={fetch:async(url,options={})=>{requests.push({url,options});if(url.includes('tenant_access_token'))return response({tenant_access_token:'t'});if(url.includes('gettoken'))return response({access_token:'t'});if(url.includes('media/upload'))return response({media_id:'media'});if(url.endsWith('/files'))return response({code:0,data:{file_key:'file-key'}});return response(platform==='feishu'?{code:0,data:{message_id:'sent'}}:{processQueryKey:'sent'});}};
  const receipt=await IM_PLATFORMS[platform].sendFile({appId:'a',appSecret:'s',clientId:'a',clientSecret:'s'},env,{kind:'group',key:'original-group'},{name:'report.txt',data:Buffer.from('abc')});
  assert.equal(receipt.messageId,'sent');const multipart=requests.find(r=>r.options.body instanceof FormData);assert.ok(multipart);assert.equal((multipart.options.body.get('file')??multipart.options.body.get('media')).name,'report.txt');assert.match(requests.at(-1).options.body,/original-group/);assert.doesNotMatch(requests.at(-1).options.body,/E:|Workspace/);
 }
});
