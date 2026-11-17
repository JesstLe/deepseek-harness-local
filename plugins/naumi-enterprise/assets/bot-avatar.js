import {BOT_FORMS,BOT_PALETTES,botAppearance} from './bot-appearance-model.js';
import {botCatalog} from './bot-sidebar-model.js';

const components=new WeakMap();
let runtime;
const loadRuntime=()=>runtime??=import('./bot-avatar-runtime.js');
export function createBotAvatar(React){
 if(components.has(React))return components.get(React);
 const h=React.createElement;
 function Avatar({bot,state='idle',className='',appearance,staticPreview=false}){
  const mount=React.useRef(null),instance=React.useRef(null),latestState=React.useRef(state),look=botAppearance({...bot,...(appearance?{appearance}:{})});latestState.current=state;
  React.useEffect(()=>{let disposed=false;void loadRuntime().then(({createNaumiBot})=>{if(disposed)return;instance.current=createNaumiBot(mount.current,{id:bot.id,appearance:look,state:latestState.current,autostart:!staticPreview,eyeScale:1,label:bot.name});}).catch(error=>{if(!disposed){mount.current.dataset.avatarError='true';console.error('Naumi Bot avatar:',error);}});return()=>{disposed=true;instance.current?.destroy();instance.current=null;};},[bot.id,look.shape,look.palette,staticPreview]);
  React.useEffect(()=>{instance.current?.setState(state);},[state]);
  return h('span',{ref:mount,className:'naumi-bot-avatar naumi-character '+className,'aria-hidden':true,'data-character':look.shape});
 }
 components.set(React,Avatar);return Avatar;
}

export function createAppearanceDialog(React){
 const h=React.createElement,Avatar=createBotAvatar(React),source=botCatalog();
 return function AppearanceDialog({bot,onClose}){
  const catalog=React.useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot),current=catalog.bots.find(b=>b.id===bot.id)??bot;
  const [base,setBase]=React.useState(current),[draft,setDraft]=React.useState(()=>botAppearance(current)),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),[conflict,setConflict]=React.useState(false);
  const ref=React.useRef(null),flight=React.useRef(false),alive=React.useRef(true);
  React.useEffect(()=>{alive.current=true;const previous=document.activeElement;ref.current?.querySelector('button[aria-pressed=true]')?.focus();return()=>{alive.current=false;if(previous?.isConnected)previous.focus();};},[]);
  const close=()=>{if(!flight.current)onClose();},reload=()=>{setBase(current);setDraft(botAppearance(current));setConflict(false);setError('');};
  const key=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Tab'){const list=[...ref.current.querySelectorAll('button:not(:disabled)')],first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  const save=async()=>{if(flight.current||conflict||current.status!=='active')return;flight.current=true;setBusy(true);setError('');try{await source.appearance(base,draft);if(alive.current)onClose();}catch(e){if(alive.current){setConflict(e.message==='BOT_CONFLICT');setError(e.message==='BOT_CONFLICT'?'Bot 已更新，请重新载入':e.message==='BOT_ARCHIVED'?'Bot 已归档':'保存失败，请重试');}}finally{flight.current=false;if(alive.current)setBusy(false);}};
  const old=botAppearance(base),unchanged=old.shape===draft.shape&&old.palette===draft.palette,disabled=busy||conflict||current.status!=='active';
  return h('div',{className:'nx-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget)close();}},h('section',{ref,className:'nx-dialog naumi-appearance-dialog',role:'dialog','aria-modal':true,'aria-label':'Bot 形象',onKeyDown:key},
   h('header',null,h('h2',null,'Bot 形象'),h('button',{type:'button',className:'nx-close','aria-label':'关闭',onClick:close,disabled:busy},'×')),
   h('div',{className:'naumi-appearance-hero'},h(Avatar,{bot,appearance:draft}),h('strong',null,bot.name)),
   h('fieldset',{disabled},h('legend',null,'形象'),h('div',{className:'naumi-form-grid'},BOT_FORMS.map(form=>h('button',{key:form.id,type:'button','aria-label':form.name,'aria-pressed':draft.shape===form.id,onClick:()=>setDraft(v=>({...v,shape:form.id}))},h(Avatar,{bot:{id:'preset-'+form.id,name:form.name},appearance:{shape:form.id,palette:draft.palette},staticPreview:true}),h('span',null,form.name))))),
   h('fieldset',{disabled},h('legend',null,'配色'),h('div',{className:'naumi-palette-grid'},BOT_PALETTES.map(p=>h('button',{key:p.id,type:'button','aria-label':p.name,title:p.name,'aria-pressed':draft.palette===p.id,onClick:()=>setDraft(v=>({...v,palette:p.id})),style:{'--bot-swatch':p.color}},draft.palette===p.id?'✓':'')))),
   error&&h('p',{role:'alert',className:'naumi-appearance-error'},error),conflict&&h('button',{type:'button',onClick:reload,disabled:busy},'重新载入'),
   h('footer',null,h('button',{type:'button',disabled:busy,onClick:close},'取消'),h('button',{type:'button',className:'nx-primary',disabled:disabled||unchanged,onClick:save},busy?'保存中…':'保存'))));
 };
}
