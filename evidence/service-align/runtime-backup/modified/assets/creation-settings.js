export function installCreationUI(ctx,React){
 const api=globalThis.naumiDesktop;if(!api?.creation)return()=>{};
 const h=React.createElement;
 function Creation(){const [state,setState]=React.useState(null),[error,setError]=React.useState(false);
  React.useEffect(()=>{let alive=true;api.creation({action:'state'}).then(v=>{if(alive){if(v.ok)setState(v);else setError(true);}}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};},[]);
  return h('section',{className:'nb3d','aria-label':'Naumi 创作'},h('header',null,h('h2',null,'Naumi 创作')),
   h('article',{className:'nb3d-panel'},h('div',{className:'nb3d-main'},h('div',null,h('h3',null,state?.account??'Naumi 账号'),h('span',{className:'nb3d-status'},error?'授权状态待核对':state?state.authorized?'已保存授权':'未授权':'加载中…'))),
    h('dl',null,h('div',null,h('dt',null,'客户端'),h('dd',null,'1.1.0 · MCP')),h('div',null,h('dt',null,'空间'),h('dd',null,state?.workspace||'个人空间')),h('div',null,h('dt',null,'连接'),h('dd',null,'按会话隔离'))),
    h('footer',null,h('button',{type:'button',className:'nb3d-primary',onClick:()=>api.openIdentity()},'管理创作授权'))));
 }
 return ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'naumi-creation',order:31,label:()=> 'Naumi 创作'},Creation));
}
