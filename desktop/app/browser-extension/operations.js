// Deliberately fixed operations: the model never supplies an evaluate expression.
const literal=JSON.stringify;
export function pageExpression(input){
 const {action,selector,text,key,deltaX=0,deltaY=0}=input;
 if(action==='state')return `({title:document.title,url:location.href,loading:document.readyState!=='complete'})`;
 if(action==='snapshot')return `(()=>{const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';const selector=e=>{if(e.id)return '#'+CSS.escape(e.id);const p=[];for(let n=e;n&&n!==document.documentElement;n=n.parentElement){let i=1;for(let s=n.previousElementSibling;s;s=s.previousElementSibling)if(s.tagName===n.tagName)i++;p.unshift(n.tagName.toLowerCase()+':nth-of-type('+i+')');}return 'html>'+p.join('>');};return {title:document.title,url:location.href,snapshot:{title:document.title,url:location.href,text:(document.body?.innerText||'').slice(0,16000),elements:[...document.querySelectorAll('a,button,input,textarea,select,[role=button],[contenteditable=true]')].filter(visible).slice(0,160).map(e=>({selector:selector(e),role:e.getAttribute('role')||e.tagName.toLowerCase(),type:e.getAttribute('type'),name:(e.getAttribute('aria-label')||e.innerText||e.getAttribute('placeholder')||'').slice(0,160)}))}}})()`;
 if(action==='wheel')return `(()=>{window.scrollBy(${Number(deltaX)||0},${Number(deltaY)||0});return {scrolled:true}})()`;
 if(['click','fill','text','press'].includes(action)){
  if(selector!==undefined&&(typeof selector!=='string'||!selector||selector.length>4096))throw Error('INVALID_BROWSER_SELECTOR');
  if(['fill','text'].includes(action)&&(typeof text!=='string'||text.length>16384))throw Error('INVALID_BROWSER_TEXT');
  const find=selector?`document.querySelector(${literal(selector)})`:'document.activeElement';
  const editable=`if(!e.matches('input:not([type=password]):not([type=file]):not([type=hidden]),textarea,[contenteditable=true]'))throw Error('BROWSER_FIELD_NOT_EDITABLE');`;
  const prefix=`const e=${find};if(!e||!e.getClientRects().length||e.disabled)throw Error('BROWSER_ELEMENT_NOT_VISIBLE');e.scrollIntoView({block:'center',inline:'center'});`;
  if(action==='click'&&selector)return `(()=>{${prefix}e.click();return {clicked:true}})()`;
  if(action==='fill'||action==='text')return `(()=>{${prefix}${editable}e.focus();const text=${literal(text)};if(e.isContentEditable)e.textContent=${action==='text'?'e.textContent+text':'text'};else{const p=e.tagName==='TEXTAREA'?HTMLTextAreaElement:HTMLInputElement;Object.getOwnPropertyDescriptor(p.prototype,'value').set.call(e,${action==='text'?'e.value+text':'text'});}e.dispatchEvent(new Event('input',{bubbles:true}));return {filled:true}})()`;
  if(action==='press'&&selector)return `(()=>{${prefix}e.focus();return {focused:true}})()`;
 }
 throw Error('INVALID_BROWSER_ACTION');
}
export function parsePair(value){
 const u=new URL(value);if(u.protocol!=='naumi-browser:'||u.hostname!=='connect'||!/^\d{1,5}$/.test(u.searchParams.get('port')||'')||!(/^[a-f0-9]{64}$/).test(u.searchParams.get('token')||''))throw Error('BROWSER_PAIR_INVALID');
 const port=Number(u.searchParams.get('port'));if(port<1||port>65535)throw Error('BROWSER_PAIR_INVALID');
 return {base:`http://127.0.0.1:${port}`,token:u.searchParams.get('token')};
}
