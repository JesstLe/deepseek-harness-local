import {createHash} from 'node:crypto';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
class MutableSessionEventSource { constructor(){this.entries=[];this.listeners=new Set();}getSnapshot(){return{entries:this.entries};}subscribe(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn);}replace(entries){this.entries=entries;for(const fn of this.listeners)fn();}append(entry){this.replace([...this.entries,entry]);} }
import {conversationRows,roomDraft,roomPreview,groupReplyView,watchGroupReplies,createGroupCatalog,groupRequest} from '../plugins/naumi-enterprise/assets/bot-chat-model.js';

test('employee and group identities share one list; pin/search are presentation-only and names are not role constants',()=>{
 const bots=[{id:'one',name:'甲',status:'active'},{id:'two',name:'任意名称',status:'active'},{id:'old',name:'归档',status:'archived'}],rooms=[{id:'group',name:'联合讨论',members:[{botId:'one'}]}];
 assert.deepEqual(conversationRows(bots,rooms,'','two').map(r=>r.id),['two','one','group']);assert.equal(conversationRows(bots,rooms,'联合').length,1);assert.equal(conversationRows(bots,rooms,'归档').length,0);assert.equal(roomPreview(rooms[0],bots),'甲');assert.equal(bots[0].status,'active');
 roomDraft('a',{text:'未发送',targets:['one']});assert.equal(roomDraft('a').text,'未发送');assert.equal(roomDraft('b').text,'');
});
test('native stream binds exact message/turn, excludes reasoning and other turns, and returns original file refs',()=>{
 const event=(type,data,seq=1)=>({type:'event',event:{type,data,seq}}),entries=[event('turn/start',{turn:1}),event('user/message',{id:'other'}),event('assistant/message',{turn:1,message:{content:[{type:'text',text:'不属于这轮'}]}}),event('turn/start',{turn:2}),event('user/message',{id:'mine'}),event('assistant/live-chunk',{turn:2,attemptId:'a',chunk:{type:'reasoning-delta',text:'private reasoning'}}),event('assistant/live-chunk',{turn:2,attemptId:'a',chunk:{type:'text-delta',text:'开始'}}),event('assistant/live-chunk',{turn:2,attemptId:'a',chunk:{type:'text-delta',text:'协作'}})];
 assert.equal(groupReplyView(entries,'mine','s').text,'开始协作');assert.equal(groupReplyView(entries,'missing','s').text,'');
 entries.push(event('assistant/message',{turn:2,message:{content:[{type:'text',text:'正式结果'}]}}),event('deliverables/presented',{turn:2,files:[{path:'report.md'}]},9));const v=groupReplyView(entries,'mine','s');assert.equal(v.text,'正式结果');assert.deepEqual(v.files,[{path:'report.md',sessionId:'s',turn:2,seq:9,index:0}]);
});
test('client-native live feed subscriptions coalesce frames and release exactly once without Host prompting',async()=>{
 const source=new MutableSessionEventSource(),refs=[];let frames=[],values,release=0;
 const ctx={sessions:{retain(id,options){refs.push([id,options.source]);return{ready:Promise.resolve({eventSource:source}),release(){release++;}};}}};
 const stop=watchGroupReplies(ctx,[{id:'r',sessionId:'s',state:'sent'},{id:'queued',sessionId:'not-created',state:'queued'}],v=>values=v,{schedule:cb=>{frames.push(cb);return 1;},cancel:()=>{frames=[];}});await new Promise(r=>setImmediate(r));
 source.replace([{type:'event',event:{type:'turn/start',data:{turn:1},seq:1}},{type:'event',event:{type:'user/message',data:{id:'r'},seq:2}}],false);source.append({type:'event',event:{type:'assistant/message',seq:3,data:{turn:1,message:{content:[{type:'text',text:'native reply'}]}}}});assert.equal(frames.length,1);frames.shift()();assert.equal(values.r.text,'native reply');assert.deepEqual(refs,[['s','naumiGroupChat']]);stop();assert.equal(release,1);
});
test('shared group catalog has one load, retains selection, and never applies a stale response after last release',async()=>{
 let resolve,calls=0;const target=new EventTarget(),store=new Map(),storage={getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},catalog=createGroupCatalog({target,storage,fetcher:()=>{calls++;return new Promise(r=>resolve=r);}});
 const one=catalog.subscribe(()=>{}),two=catalog.subscribe(()=>{});assert.equal(calls,1);one();two();resolve({ok:true,json:async()=>({rooms:[{id:'late'}]})});await new Promise(r=>setImmediate(r));assert.equal(catalog.getSnapshot().rooms.length,0);
});
test('group writes retain the existing same-origin contract and stable caller-supplied request identity',async()=>{
 let captured;await groupRequest(undefined,{body:{action:'post',id:'fixed-id'},fetcher:async(url,options)=>{captured={url,options};return{ok:true,json:async()=>({accepted:true})};}});assert.equal(captured.options.headers['x-naumi-bot-groups'],'1');assert.equal(JSON.parse(captured.options.body).id,'fixed-id');assert.equal(captured.options.credentials,'same-origin');
});
test('unified UI removes separate group product navigation without changing backend/schema/model selection',()=>{
 const client=fs.readFileSync('plugins/naumi-enterprise/client.js','utf8'),sidebar=fs.readFileSync('plugins/naumi-enterprise/assets/bot-sidebar.js','utf8'),group=fs.readFileSync('plugins/naumi-enterprise/assets/bot-groups.js','utf8');assert(!client.includes("['naumi-bot-groups','Bot 群聊','chat']"));assert(client.includes("key:'naumi-conversation'"));assert(sidebar.includes('conversationRows('));assert(!group.includes('className:\'nbg-list\''));for(const text of ['setModel','selectModel','setPermission','session.prompt'])assert(!group.includes(text));
});


test('existing product-navigation SVG paths and Icon renderer remain byte-identical',()=>{const s=fs.readFileSync('plugins/naumi-enterprise/client.js','utf8'),a=s.indexOf('  const PATHS='),b=s.indexOf('  function apply(ctx)',a);assert.equal(createHash('sha256').update(s.slice(a,b)).digest('hex'),'7dc474dccdbdada7297e0afc91e1fb6c7fd52a66ee4b563bc405e67e687fb93a');const fixture=fs.readFileSync('scripts/render-unified-chat.mjs','utf8');assert(fixture.includes('${originalIcons}'));assert(!fixture.includes("['▦','◇','▣','✧','↗']"));});
