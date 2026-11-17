const statuses={disabled:'已停用',connecting:'连接中',ready:'已连接',retrying:'重连中',error:'连接异常'};
const errors={IM_CONFLICT:'配置已变化，请刷新后重试',IM_SECRET_REQUIRED:'请填写应用密钥',IM_CHECK_FAILED:'连接验证失败，请核对应用配置',IM_PAIR_REQUIRED:'请重新配对',IM_GROUP_ALREADY_BOUND:'此群已有消息接入',IM_ACCOUNT_IMMUTABLE:'应用身份不可更换，请新建连接',IM_TARGET_KIND:'私聊请选择 Bot，群聊请选择群组',IM_CONNECTION_DISABLED:'请先启用连接'};
async function request(body,signal){const r=await fetch('/naumi/im',{credentials:'same-origin',cache:'no-store',signal,...body?{method:'POST',headers:{'content-type':'application/json','x-naumi-im':'1'},body:JSON.stringify(body)}:{}});const v=await r.json();if(!r.ok)throw Object.assign(Error(errors[v.error]??'消息接入暂不可用'),{status:r.status});return v;}

export function createIMSettings(React){
 const h=React.createElement,{useState,useEffect,useRef}=React;
 return function IMSettings(){
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[pairing,setPairing]=useState(null),[pair,setPair]=useState(null),[confirm,setConfirm]=useState(null),[userEdit,setUserEdit]=useState(null),[notice,setNotice]=useState('');
  const alive=useRef(false),flight=useRef(false),form=useRef(null);
  useEffect(()=>{alive.current=true;const ac=new AbortController();const load=()=>{if(!flight.current)request(null,ac.signal).then(v=>{if(alive.current){setData(prior=>prior?.revision>v.revision?prior:v);setError('');}}).catch(e=>{if(alive.current&&!ac.signal.aborted){if([401,403].includes(e.status))setData(null);setError(e.message);}});};load();const timer=setInterval(load,5000);return()=>{alive.current=false;clearInterval(timer);ac.abort();};},[]);
  useEffect(()=>{if(draft)form.current?.querySelector('input')?.focus();},[draft?.id]);
  const cancel=()=>{setDraft(null);setSecret('');};
  async function execute(body){
   if(flight.current||!data)return;flight.current=true;setBusy(true);setError('');setNotice('');
   try{const next=await request({...body,expectedRevision:data.revision});if(alive.current){setData(next);if(next.pair)setPair({...next.pair,connectionId:body.connectionId});if(next.checked)setNotice('连接验证通过');if(body.action==='save')cancel();if(body.action==='binding')setUserEdit(null);setConfirm(null);}return next;}
   catch(e){if(alive.current)setError(e.message);}
   finally{flight.current=false;if(alive.current)setBusy(false);}
  }
  function edit(c,platform){setDraft(c?{...c}:{id:crypto.randomUUID(),platform,name:'',appId:'',domain:'feishu'});setSecret('');setPairing(null);setPair(null);setError('');}
  function bind(c){setPairing({connectionId:c.id,chatKind:'direct',targetId:''});setPair(null);setDraft(null);setSecret('');}
  function field(label,props,options){return h('label',{className:'nim-field'},h('span',null,label),options?h('select',props,...options):h('input',props));}
  function button(label,onClick,props={}){return h('button',{type:'button',onClick,disabled:busy,...props},label);}
  const nameFor=b=>b.target.kind==='bot'?data.bots.find(v=>v.id===b.target.id)?.name:data.groups.find(v=>v.id===b.target.id)?.name;
  return h('section',{className:'nim-settings','aria-label':'消息接入'},
   h('header',{className:'nim-header'},h('h2',null,'消息接入'),!draft&&h('div',{className:'nim-actions'},button('添加钉钉',()=>edit(null,'dingtalk')),button('添加飞书',()=>edit(null,'feishu'),{className:'nim-primary'}))),
   error&&h('div',{role:'alert',className:'nim-error'},error,button('刷新',()=>request().then(setData).catch(e=>setError(e.message)))),notice&&h('div',{role:'status',className:'nim-notice'},notice),!data&&!error&&h('div',{role:'status'},'加载中…'),
   draft&&h('form',{className:'nim-panel nim-form',ref:form,onSubmit:e=>{e.preventDefault();void execute({action:'save',id:draft.id,platform:draft.platform,name:draft.name,appId:draft.appId,domain:draft.domain,...secret?{secret}:{}});}},
    h('div',{className:'nim-panel-heading'},h('h3',null,draft.platform==='dingtalk'?'钉钉':'飞书 / Lark'),h('a',{href:draft.platform==='dingtalk'?'https://open-dev.dingtalk.com/':'https://open.feishu.cn/app',target:'_blank',rel:'noopener noreferrer'},'开发者后台 ↗')),
    field('连接名称',{value:draft.name,required:true,maxLength:80,disabled:busy,onChange:e=>setDraft({...draft,name:e.target.value})}),
    field(draft.platform==='dingtalk'?'Client ID':'App ID',{value:draft.appId,required:true,maxLength:200,disabled:busy||draft.configured,onChange:e=>setDraft({...draft,appId:e.target.value})}),
    field(draft.platform==='dingtalk'?'Client Secret':'App Secret',{type:'password',autoComplete:'new-password',value:secret,required:!draft.configured,placeholder:draft.configured?'留空保留原密钥':'',disabled:busy,onChange:e=>setSecret(e.target.value)}),
    draft.platform==='feishu'&&field('平台',{value:draft.domain,disabled:busy||draft.configured,onChange:e=>setDraft({...draft,domain:e.target.value})},[h('option',{key:'feishu',value:'feishu'},'飞书'),h('option',{key:'lark',value:'lark'},'Lark')]),
    h('footer',{className:'nim-actions'},button('取消',cancel),h('button',{className:'nim-primary',type:'submit',disabled:busy},busy?'保存中…':'保存'))),
   !draft&&data&&h('div',{className:'nim-grid'},...data.connections.map(c=>h('article',{className:'nim-panel',key:c.id},
    h('div',{className:'nim-panel-heading'},h('div',{className:'nim-identity'},h('span',{className:'nim-platform','data-platform':c.platform,'aria-hidden':true},c.platform==='dingtalk'?'钉':'飞'),h('h3',null,c.name)),h('span',{className:'nim-status','data-state':c.state},statuses[c.state]??c.state)),
    h('code',{className:'nim-app'},c.appId),h('footer',{className:'nim-actions'},button('编辑',()=>edit(c)),button('验证',()=>execute({action:'check',id:c.id})),button(c.enabled?'停用':'启用',()=>execute({action:'enable',id:c.id,enabled:!c.enabled})),button('配对',()=>bind(c),{disabled:busy||!c.enabled,className:'nim-primary'}))))),
   pairing&&h('form',{className:'nim-panel nim-pair',onSubmit:e=>{e.preventDefault();void execute({action:'pair',connectionId:pairing.connectionId,chatKind:pairing.chatKind,target:{kind:pairing.chatKind==='direct'?'bot':'group',id:pairing.targetId}});}},
    h('div',{className:'nim-panel-heading'},h('h3',null,'配对会话'),button('关闭',()=>{setPairing(null);setPair(null);})),
    h('div',{className:'nim-pair-fields'},field('会话',{value:pairing.chatKind,disabled:busy,onChange:e=>{setPairing({...pairing,chatKind:e.target.value,targetId:''});setPair(null);}},[h('option',{key:'direct',value:'direct'},'私聊'),h('option',{key:'group',value:'group'},'群聊')]),
     field(pairing.chatKind==='direct'?'Bot':'Naumi 群组',{required:true,value:pairing.targetId,disabled:busy,onChange:e=>{setPairing({...pairing,targetId:e.target.value});setPair(null);}},[h('option',{key:'',value:''},'选择'),...(pairing.chatKind==='direct'?data.bots:data.groups).map(v=>h('option',{key:v.id,value:v.id},v.name))])),
    h('footer',{className:'nim-actions'},h('button',{type:'submit',className:'nim-primary',disabled:busy||!pairing.targetId},'生成配对码')),
    pair&&h('div',{className:'nim-code',role:'status'},h('code',null,'/pair '+pair.code),h('span',null,(pairing.chatKind==='group'?'在目标群 @机器人发送':'在机器人私聊发送')+' · 有效至 '+new Date(pair.expires).toLocaleTimeString()),button('复制',()=>navigator.clipboard.writeText('/pair '+pair.code)))) ,
   data?.bindings.length>0&&h('section',{className:'nim-bindings'},h('h3',null,'已配对会话'),...data.bindings.map(b=>h('article',{className:'nim-panel nim-binding',key:b.id},
    h('div',{className:'nim-panel-heading'},h('strong',null,nameFor(b)??'目标已移除'),h('span',{className:'nim-status','data-state':b.active?'ready':'disabled'},b.active?'已配对':'已解绑')),
    h('div',{className:'nim-binding-route'},h('span',null,b.chat.kind==='direct'?'私聊':'群聊'),h('code',null,b.chat.title||b.chat.key)),
    userEdit?.id===b.id?h('form',{onSubmit:e=>{e.preventDefault();void execute({action:'binding',id:b.id,active:b.active,users:userEdit.text.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)});}},h('label',{className:'nim-field'},'成员 ID（每行一个）'),h('textarea',{'aria-label':'授权成员 ID',value:userEdit.text,required:true,rows:3,disabled:busy,onChange:e=>setUserEdit({...userEdit,text:e.target.value})}),h('div',{className:'nim-actions'},button('取消',()=>setUserEdit(null)),h('button',{type:'submit',disabled:busy},'保存成员'))):
    h('footer',{className:'nim-actions'},button('成员 · '+b.users.length,()=>setUserEdit({id:b.id,text:b.users.join('\n')}),{disabled:busy||!b.active}),b.active&&(confirm===b.id?h(React.Fragment,null,button('确认解绑',()=>execute({action:'binding',id:b.id,active:false,users:b.users}),{className:'nim-danger'}),button('取消',()=>setConfirm(null))):button('解绑',()=>setConfirm(b.id))))))),
   data?.outbox.length>0&&h('section',null,h('h3',null,'待核对回执'),...data.outbox.map(o=>h('article',{key:o.id,className:'nim-panel nim-receipt'},h('strong',null,o.state==='unknown'?'发送结果待核对':'平台拒绝发送'),confirm===o.id?h('div',{className:'nim-actions'},button('已收到',()=>execute({action:'resolve',id:o.id,received:true,confirm:true})),button('未收到，重新发送',()=>execute({action:'resolve',id:o.id,received:false,confirm:true})),button('取消',()=>setConfirm(null))):button('核对',()=>setConfirm(o.id))))),
   data&&!data.connections.length&&!draft&&h('div',{className:'nim-empty'},h('span',{'aria-hidden':true},'↗'),h('strong',null,'添加消息连接'),h('div',{className:'nim-actions'},button('钉钉',()=>edit(null,'dingtalk')),button('飞书 / Lark',()=>edit(null,'feishu')))));
 };
}
export function installIMSettingsUI(ctx,React){return ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'im',order:20,label:()=> '消息接入'},createIMSettings(React)));}
