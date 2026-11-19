import {pageExpression,parsePair} from './operations.js';
let polling=false;
const state=async()=>(await chrome.storage.session.get('connection')).connection;
async function save(value){await chrome.storage.session.set({connection:value});}
async function request(connection,path,body){
 const response=await fetch(connection.base+path,{method:'POST',headers:{Authorization:'Bearer '+connection.token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error('BROWSER_CONNECTION_ENDED');return response.json();
}
async function detachAll(connection){await chrome.storage.session.remove('connection');for(const tabId of connection?.tabs||[]){await request(connection,'/detach',{tabId}).catch(()=>{});try{await chrome.debugger.detach({tabId});}catch{}}}
async function evaluate(tabId,expression){
 const r=await chrome.debugger.sendCommand({tabId},'Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,timeout:10000});
 if(r.exceptionDetails)throw Error('BROWSER_PAGE_OPERATION_FAILED');return r.result.value;
}
async function operate(job,connection){
 const {tabId,input}=job;if(!connection.tabs.includes(tabId))throw Error('BROWSER_TAB_NOT_APPROVED');
 const tab=await chrome.tabs.get(tabId);const u=new URL(tab.url);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('BROWSER_TAB_INVALID');
 const action=input.action;
 if(action==='navigate'){
  const next=new URL(input.url);if(!['https:','http:'].includes(next.protocol)||next.username||next.password)throw Error('INVALID_BROWSER_URL');
  await chrome.tabs.update(tabId,{url:next.href});
 }else if(action==='select')await chrome.tabs.update(tabId,{active:true});
 else if(action==='back'||action==='forward'){
  const h=await chrome.debugger.sendCommand({tabId},'Page.getNavigationHistory');const e=h.entries[h.currentIndex+(action==='back'?-1:1)];if(e)await chrome.debugger.sendCommand({tabId},'Page.navigateToHistoryEntry',{entryId:e.id});
 }else if(action==='reload')await chrome.tabs.reload(tabId);
 else if(action==='finish')return {retained:true,url:tab.url,title:tab.title};
 else if(action==='login')return evaluate(tabId,input.expression);
 else if(action==='press'){
  if(input.selector)await evaluate(tabId,pageExpression(input));
  const parts=String(input.key).split('+'),key=parts.pop();const mask={Alt:1,Control:2,Ctrl:2,Meta:4,Shift:8};if(parts.some(p=>!mask[p])||!key||key.length>32)throw Error('INVALID_BROWSER_KEY');
  const modifiers=parts.reduce((n,p)=>n|mask[p],0),code={Enter:13,Tab:9,Escape:27,Backspace:8,ArrowDown:40,ArrowUp:38,ArrowLeft:37,ArrowRight:39}[key]||(key.length===1?key.toUpperCase().charCodeAt(0):0);
  if(!code)throw Error('INVALID_BROWSER_KEY');await chrome.debugger.sendCommand({tabId},'Input.dispatchKeyEvent',{type:'keyDown',key,windowsVirtualKeyCode:code,modifiers});await chrome.debugger.sendCommand({tabId},'Input.dispatchKeyEvent',{type:'keyUp',key,windowsVirtualKeyCode:code,modifiers});
 }else if(action==='click'){
  const point=input.selector?await evaluate(tabId,pageExpression(input)):input;
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y)||point.x<0||point.y<0)throw Error('INVALID_BROWSER_POINT');
  for(const [type,buttons]of [['mousePressed',1],['mouseReleased',0]])await chrome.debugger.sendCommand({tabId},'Input.dispatchMouseEvent',{type,x:point.x,y:point.y,button:'left',buttons,clickCount:1});
 }else if(action==='wheel'){
  const values={x:input.x??60,y:input.y??60,deltaX:input.deltaX??0,deltaY:input.deltaY??0};if(Object.values(values).some(x=>!Number.isFinite(x)))throw Error('INVALID_BROWSER_NUMBER');await chrome.debugger.sendCommand({tabId},'Input.dispatchMouseEvent',{type:'mouseWheel',...values});
 }else return evaluate(tabId,pageExpression(input));
 const current=await chrome.tabs.get(tabId);return {url:current.url,title:current.title};
}
async function poll(){
 if(polling)return;polling=true;
 try{while(true){
  const connection=await state();if(!connection?.tabs.length)break;
  let response;try{response=await request(connection,'/poll',{});}catch{await detachAll(connection);break;}
  for(const job of response.jobs){
   if((await state())?.token!==connection.token)return;
   try{await request(connection,'/permit',{id:job.id});}catch{await detachAll(connection);return;}
   let result;try{result={id:job.id,ok:true,data:await operate(job,connection)};}catch{result={id:job.id,ok:false};}
   // Result loss is never repaired by executing the action again.
   try{await request(connection,'/result',result);}catch{await detachAll(connection);return;}
  }
 }}finally{polling=false;}
}
export async function connectCurrent(message){
  const config=message.pair?parsePair(message.pair):await state();if(!config)throw Error('BROWSER_PAIR_REQUIRED');
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id||!/^https?:\/\//.test(tab.url||''))throw Error('BROWSER_TAB_INVALID');
  let {instanceId}=await chrome.storage.session.get('instanceId');if(!instanceId){instanceId=crypto.randomUUID();await chrome.storage.session.set({instanceId});}
  const previous=await state();if(previous&&previous.token!==config.token)await detachAll(previous);
  const tabs=previous?.token===config.token?previous.tabs:[];
  if(!tabs.includes(tab.id))await chrome.debugger.attach({tabId:tab.id},'1.3');
  try{await request(config,'/attach',{tabId:tab.id,instanceId,title:tab.title||'',url:tab.url});}catch(error){if(!tabs.includes(tab.id))await chrome.debugger.detach({tabId:tab.id}).catch(()=>{});throw error;}
  await save({...config,tabs:[...new Set([...tabs,tab.id])]});void poll();return {connected:true,tabs:new Set([...tabs,tab.id]).size};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(sender.id!==chrome.runtime.id||sender.tab)return;
 void(async()=>{
  if(message.action==='status'){const s=await state();return {connected:!!s?.tabs.length,tabs:s?.tabs.length||0};}
  if(message.action==='disconnect'){await detachAll(await state());return {disconnected:true};}
  if(message.action==='connect')return connectCurrent(message);
  throw Error('BROWSER_ACTION_INVALID');
 })().then(value=>reply({ok:true,...value})).catch(()=>reply({ok:false,error:'连接未完成，请检查连接码与当前标签页'}));return true;
});
chrome.debugger.onDetach.addListener(source=>void(async()=>{const s=await state();if(!s?.tabs.includes(source.tabId))return;s.tabs=s.tabs.filter(x=>x!==source.tabId);await save(s);await request(s,'/detach',{tabId:source.tabId}).catch(()=>{});})());
chrome.alarms.create('connection',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(()=>void poll());
void poll();
