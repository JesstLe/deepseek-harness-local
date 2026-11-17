const labels={MODEL_URL_INVALID:'请填写 API 基础地址，不含密钥或请求路径',MODEL_KEY_REQUIRED:'请填写 API Key',MODEL_KEY_INVALID:'API Key 包含无效字符',MODEL_DUPLICATE_ID:'模型 ID 重复',MODEL_SETTINGS_CONFLICT:'配置已被更新，请重新载入后再保存',MODEL_SAVE_FAILED:'保存失败，请重试',MODEL_SETTINGS_READ_ONLY:'当前配置只读',OWNER_REQUIRED:'仅本机所有者可配置',AUTH_REQUIRED:'请重新连接工作台'};
async function request(body,signal){const r=await fetch('/naumi/model-connections',{credentials:'same-origin',signal,cache:'no-store',...body?{method:'POST',headers:{'Content-Type':'application/json','x-naumi-model-connections':'1'},body:JSON.stringify(body)}:{}});const v=await r.json();if(!r.ok)throw Object.assign(Error(labels[v.error]??'模型连接暂不可用'),{status:r.status});return v;}
export function installModelConnectionsUI(ctx,React){
 const h=React.createElement,{useState,useEffect,useRef}=React;
 function Connections(){
  const [data,setData]=useState(null),[draft,setDraft]=useState(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[conflict,setConflict]=useState(false),[notice,setNotice]=useState(''),[confirm,setConfirm]=useState(null);
  const alive=useRef(true),flight=useRef(false),form=useRef(null);
  useEffect(()=>{alive.current=true;const ac=new AbortController();request(null,ac.signal).then(v=>{if(alive.current)setData(v);}).catch(e=>{if(alive.current&&!ac.signal.aborted)setError(e.message);});return()=>{alive.current=false;ac.abort();};},[]);
  useEffect(()=>{if(draft)form.current?.querySelector('input')?.focus();},[draft?.id]);
  function edit(group){setDraft(group?{...group,modelText:group.models.map(m=>m.id).join('\n')}:{id:'custom-'+crypto.randomUUID().slice(0,8),displayName:'',baseURL:'',api:'openai-completions',modelText:''});setKey('');setError('');setNotice('');setConfirm(null);}
  function cancel(){setDraft(null);setKey('');setConfirm(null);if(!conflict)setError('');}
  async function reload(){if(flight.current)return;flight.current=true;setBusy(true);try{const v=await request();if(alive.current){setData(v);setConflict(false);cancel();setError('');}}catch(e){if(alive.current)setError(e.message);}finally{flight.current=false;if(alive.current)setBusy(false);}}
  async function submit(body){if(flight.current||conflict)return;flight.current=true;setBusy(true);setError('');setNotice('');try{const v=await request({...body,expectedRevision:data.revision});if(alive.current){setData(v);cancel();setNotice(v.defaultPending?'连接已保存，默认模型待更新':'已保存');}}catch(e){if(alive.current){setError(e.message);if(e.status===409)setConflict(true);}}finally{flight.current=false;if(alive.current)setBusy(false);}}
  function save(e){e.preventDefault();const ids=draft.modelText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);if(!ids.length){setError('请至少填写一个模型 ID');return;}submit({action:'save',id:draft.id,displayName:draft.displayName,baseURL:draft.baseURL,api:draft.api,models:ids.map(id=>({id,...draft.models?.find(m=>m.id===id)?.name?{name:draft.models.find(m=>m.id===id).name}:{}})),...key.trim()?{apiKey:key.trim()}: {}});}
  const locked=busy||conflict||!data?.writable,change=(field,value)=>setDraft(d=>({...d,[field]:value}));
  return h('section',{className:'nm-connections','aria-label':'模型连接'},
   h('header',null,h('h2',null,'模型连接'),!draft&&h('button',{type:'button',disabled:locked,onClick:()=>edit()},'添加连接')),
   error&&h('div',{className:'nm-error',role:'alert'},error,h('button',{type:'button',disabled:busy,onClick:reload},conflict?'重新载入':'重试')),
   notice&&h('div',{role:'status',className:'nm-notice'},notice),!data&&!error&&h('div',{role:'status'},'加载中…'),
   data&&!data.writable&&h('div',{role:'status'},'当前配置只读'),
   draft?h('form',{ref:form,onSubmit:save,className:'nm-form'},
    h('label',null,h('span',null,'分组名称'),h('input',{required:true,maxLength:120,value:draft.displayName,disabled:locked,onChange:e=>change('displayName',e.target.value)})),
    h('label',null,h('span',null,'API URL'),h('input',{type:'url',required:true,placeholder:'https://api.example.com/v1',maxLength:2048,value:draft.baseURL,disabled:locked,onChange:e=>change('baseURL',e.target.value)})),
    h('label',null,h('span',null,'API Key'),h('input',{type:'password',autoComplete:'new-password',required:!draft.configured,placeholder:draft.configured?'已配置，留空保留':'API Key',value:key,disabled:locked,onChange:e=>setKey(e.target.value)})),
    h('label',null,h('span',null,'接口协议'),h('select',{value:draft.api,disabled:locked,onChange:e=>change('api',e.target.value)},...Object.entries({'openai-completions':'OpenAI Chat Completions','openai-responses':'OpenAI Responses','anthropic-messages':'Anthropic Messages'}).map(([value,label])=>h('option',{key:value,value},label)))),
    h('label',{className:'nm-models'},h('span',null,'模型 ID（每行一个）'),h('textarea',{required:true,rows:5,maxLength:100000,disabled:locked,value:draft.modelText,onChange:e=>change('modelText',e.target.value)})),
    h('footer',null,h('button',{type:'button',disabled:busy,onClick:cancel},'取消'),h('button',{type:'submit',className:'nm-primary',disabled:locked},busy?'保存中…':'保存'))):
   data?.groups.length?h('div',{className:'nm-list'},...data.groups.map(g=>h('article',{key:g.id},h('div',{className:'nm-group-head'},h('h3',null,g.displayName),h('span',{className:g.configured?'nm-ready':'nm-missing'},g.configured?'已配置':'待配置')),h('div',{className:'nm-url'},g.baseURL),h('div',{className:'nm-chips'},...g.models.slice(0,8).map(m=>h('span',{key:m.id},m.name??m.id)),g.models.length>8&&h('span',null,'+'+(g.models.length-8))),h('footer',null,confirm===g.id?h(React.Fragment,null,h('span',null,'移除此连接？'),h('button',{disabled:locked,onClick:()=>submit({action:'remove',id:g.id})},'确认移除'),h('button',{disabled:busy,onClick:()=>setConfirm(null)},'取消')):h(React.Fragment,null,h('button',{disabled:locked||!g.editable,onClick:()=>edit(g)},'编辑'),h('button',{disabled:locked,onClick:()=>setConfirm(g.id)},'移除')))))):
   data&&h('div',{className:'nm-empty'},h('button',{disabled:locked,onClick:()=>edit()},'添加模型连接')));
 }
 return ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'models',order:10,label:()=> '模型连接'},Connections));
}
