import {openBotOverview} from './bot-overview.js';
import {botCatalog} from './bot-sidebar-model.js';
import {createBotAvatar} from './bot-avatar.js';
import {BOT_FORMS,BOT_PALETTES} from './bot-appearance-model.js';
export const PRIMARY_PANEL='naumi-primary-bot';
export const CREATE_BOT_EVENT='naumi:create-bot';
export function primaryBot(catalog){return catalog.bots.find(b=>b.id===catalog.primaryBotId&&b.status==='active')??null;}
export function enterBotMode(ctx,catalog){
 if(catalog.status!=='ready')throw Error('BOT_DIRECTORY_UNAVAILABLE');
 const bot=primaryBot(catalog),navigation=ctx.layout.beginNavigation?.();
 if(bot)return Promise.resolve((ctx.get?.('sessions')??ctx.sessions)?.refresh?.()).then(()=>{if(!navigation?.aborted)openBotOverview(ctx,bot.id);});ctx.layout.selectPanel(PRIMARY_PANEL);return Promise.resolve();
}
export function installPrimaryBotUI(ctx,React){
 const h=React.createElement,Dialog=createEmployeeDialog(ctx,React);
 function CreationOverlay(){const [open,setOpen]=React.useState(false);React.useEffect(()=>{const show=e=>setOpen({fields:e.detail?.fields});window.addEventListener(CREATE_BOT_EVENT,show);return()=>window.removeEventListener(CREATE_BOT_EVENT,show);},[]);return open?h(Dialog,{initialFields:open.fields,onClose:()=>setOpen(false)}):null;}
 const main=ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:PRIMARY_PANEL},createPrimaryBotPage(ctx,React)));
 const overlay=ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'naumi-create-bot',order:95},CreationOverlay));
 return()=>{main();overlay();};
}
export function createEmployeeDialog(ctx,React){
 const h=React.createElement,source=botCatalog();return function EmployeeDialog({onClose,initialFields}){
  const catalog=React.useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot),[name,setName]=React.useState(initialFields?.name??''),[purpose,setPurpose]=React.useState(initialFields?.purpose??''),[kind,setKind]=React.useState(initialFields?.kind??'agent'),[busy,setBusy]=React.useState(false),[error,setError]=React.useState(''),form=React.useRef(null),request=React.useRef(null),flight=React.useRef(false),alive=React.useRef(true),prior=React.useRef(document.activeElement);
  React.useEffect(()=>{alive.current=true;form.current?.querySelector('input')?.focus();return()=>{alive.current=false;prior.current?.isConnected&&prior.current.focus();};},[]);
  const pending=catalog.creations?.find(c=>c.actor==='owner'&&c.state==='pending'),locked=busy||!!pending;
  React.useEffect(()=>{if(pending){request.current=pending.requestId;setName(pending.name);setPurpose(pending.purpose);setKind(pending.kind);}},[pending?.requestId]);
  const change=fn=>{request.current=null;setError('');fn();};
  const submit=async e=>{e.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError('');request.current??=crypto.randomUUID();try{
    const bot=await source.primary({action:'create',requestId:request.current,expectedRevision:catalog.revision,fields:{name:name.trim(),purpose:purpose.trim(),kind}});
    if(alive.current){await (ctx.get?.('sessions')??ctx.sessions)?.refresh?.();ctx.layout.beginNavigation?.();ctx.uiWorkspace.openSession(bot.homeSessionId);onClose();}
   }catch(e){if(alive.current)setError(primaryError(e));}finally{flight.current=false;if(alive.current)setBusy(false);}};
  const keys=e=>{if(e.key==='Escape'&&!busy){e.preventDefault();onClose();}if(e.key==='Tab'){const list=[...form.current.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled)')],first=list[0],last=list.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}};
  return h('div',{className:'nbc-modal-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget&&!busy)onClose();}},h('form',{ref:form,className:'nbc-create npb-staff',role:'dialog','aria-modal':true,'aria-label':'创建 Bot',onSubmit:submit,onKeyDown:keys},h('header',null,h('h2',null,'创建 Bot'),h('button',{type:'button',className:'nbc-icon','aria-label':'关闭创建',disabled:busy,onClick:onClose},'×')),
   h('label',{className:'nbc-field'},'名称',h('input',{value:name,maxLength:80,required:true,disabled:locked,onChange:e=>change(()=>setName(e.target.value))})),
   h('label',{className:'nbc-field'},'类型',h('select',{value:kind,disabled:locked,onChange:e=>change(()=>setKind(e.target.value))},h('option',{value:'agent'},'智能体'),h('option',{value:'team'},'团队'))),
   h('label',{className:'nbc-field'},'职责',h('textarea',{value:purpose,maxLength:2000,rows:4,required:true,disabled:locked,onChange:e=>change(()=>setPurpose(e.target.value))})),error&&h('p',{className:'nbc-error',role:'alert'},error),
   h('footer',null,h('button',{type:'button',disabled:busy,onClick:onClose},'取消'),h('button',{type:'submit',className:'nbc-primary',disabled:busy||catalog.status!=='ready'||!name.trim()||!purpose.trim()},busy?'创建中…':pending?'继续创建':'创建'))));
 };
}
export const primaryError=e=>({BOT_CONFLICT:'目录已更新，请确认后重试。',BOT_PRIMARY_PENDING:'主 Bot 正在准备，请刷新后继续。',BOT_PRIMARY_REQUEST_CONFLICT:'这次创建已有记录，请继续原来的设置。',BOT_NAME_EXISTS:'这个名称已在使用。',BOT_WORKSPACE_REQUIRED:'请先在线程模式中选择一个工作区。',BOT_PRIMARY_HOME_ARCHIVED:'请先恢复这个 Bot 的接待会话。',BOT_PRIMARY_REQUIRED:'请先设置主 Bot。',BOT_CREATION_REQUEST_CONFLICT:'这次创建已被受理，请按原信息重试。',BOT_BUSY:'这个 Bot 仍有进行中的任务。',BOT_PRIMARY_MANAGER_REQUIRED:'请由主 Bot 管理其他 Bot。',BOT_ARCHIVED:'请选择启用中的 Bot。'}[e.message]??'创建尚未确认，请重试。');

export function createPrimaryBotPage(ctx,React){
 const h=React.createElement,{useState,useEffect,useRef,useSyncExternalStore}=React,source=botCatalog(),Avatar=createBotAvatar(React);
 return function PrimaryBotPage(){
  const catalog=useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot),existing=catalog.bots.filter(b=>b.status==='active');
  const [mode,setMode]=useState('create'),[name,setName]=useState(''),[selected,setSelected]=useState(''),[appearance,setAppearance]=useState(null),[customize,setCustomize]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const flight=useRef(false),request=useRef(null),alive=useRef(true),focus=useRef(null),restored=useRef(false);
  useEffect(()=>{alive.current=true;focus.current?.focus();return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(catalog.primarySetup&&!restored.current){restored.current=true;setMode('create');setName(catalog.primarySetup.name);setAppearance(catalog.primarySetup.appearance??null);request.current=catalog.primarySetup.requestId;}},[catalog.primarySetup]);
  useEffect(()=>{if(catalog.status==='ready'&&primaryBot(catalog))void enterBotMode(ctx,catalog).catch(e=>setError(primaryError(e)));},[catalog.status,catalog.primaryBotId]);
  const submit=async event=>{event.preventDefault();if(flight.current)return;flight.current=true;setBusy(true);setError('');
   try{request.current??=crypto.randomUUID();const bot=await source.primary(mode==='select'?{action:'select-primary',botId:selected,expectedRevision:catalog.revision}:
    {action:'create-primary',requestId:request.current,expectedRevision:catalog.revision,name:name.trim(),...(appearance?{appearance}:{})});
    if(alive.current)await enterBotMode(ctx,{...source.getSnapshot(),status:'ready',primaryBotId:bot.id,bots:[bot]});
   }catch(e){if(alive.current)setError(primaryError(e));}finally{flight.current=false;if(alive.current)setBusy(false);}
  };
  const preview={id:'primary-preview',name:name||'主 Bot',...(appearance?{appearance}:{})},locked=busy||!!catalog.primarySetup;
  return h('main',{className:'npb-page'},h('form',{className:'npb-card',onSubmit:submit,'aria-label':'设置主 Bot'},
   h('div',{className:'npb-mark'},h(Avatar,{bot:preview,staticPreview:true})),h('h1',null,'设置你的主 Bot'),
   existing.length>0&&!catalog.primarySetup&&h('div',{className:'npb-tabs',role:'group','aria-label':'主 Bot 来源'},h('button',{type:'button','aria-pressed':mode==='create',disabled:busy,onClick:()=>setMode('create')},'创建新的'),h('button',{type:'button','aria-pressed':mode==='select',disabled:busy,onClick:()=>setMode('select')},'使用现有 Bot')),
   mode==='select'&&!catalog.primarySetup?h('div',{className:'npb-options'},existing.map(bot=>h('label',{key:bot.id,'data-selected':selected===bot.id},h('input',{type:'radio',name:'primaryBot',value:bot.id,checked:selected===bot.id,disabled:busy,onChange:()=>setSelected(bot.id)}),h(Avatar,{bot,staticPreview:true}),h('span',null,bot.name)))):
    h(React.Fragment,null,h('label',{className:'npb-field'},'名称',h('input',{ref:focus,value:name,autoComplete:'off',maxLength:80,required:true,disabled:locked,placeholder:'给主 Bot 起个名字',onChange:e=>{setName(e.target.value);request.current=null;}})),
     h('button',{type:'button',className:'npb-appearance',disabled:locked,'aria-expanded':customize,onClick:()=>setCustomize(v=>!v)},'头像',h('span',null,customize?'−':'+')),
     customize&&h('div',{className:'npb-appearance-options'},h('div',{role:'group','aria-label':'头像形状'},BOT_FORMS.map(f=>h('button',{type:'button',key:f.id,'aria-pressed':appearance?.shape===f.id,disabled:locked,onClick:()=>{setAppearance(v=>({shape:f.id,palette:v?.palette??BOT_PALETTES[0].id}));request.current=null;}},f.name))),h('div',{role:'group','aria-label':'头像配色'},BOT_PALETTES.map(p=>h('button',{type:'button',key:p.id,'aria-pressed':appearance?.palette===p.id,disabled:locked,onClick:()=>{setAppearance(v=>({shape:v?.shape??BOT_FORMS[0].id,palette:p.id}));request.current=null;}},p.name))))),
   error&&h('div',{className:'npb-error',role:'alert'},error),['error','forbidden'].includes(catalog.status)&&h('button',{type:'button',className:'npb-appearance',onClick:()=>source.refresh()},'重新连接'),
   h('button',{className:'npb-submit',type:'submit',disabled:busy||catalog.status!=='ready'||(mode==='select'?!selected:!name.trim())},busy?'准备中…':catalog.primarySetup?'继续创建':mode==='select'?'设为主 Bot':'创建主 Bot')
  ));
 };
}
