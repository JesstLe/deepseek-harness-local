import {randomBytes} from 'node:crypto';
import {originOf} from './im-delivery.js';

const invalid=()=>{throw Error('IM_ANSWER_INVALID');};
function answer(questions,text){
  const parts=text.split('|').map(v=>v.trim());if(parts.length!==questions.length)invalid();
  return {answers:questions.map((q,index)=>{
    const value=parts[index];if(!value)invalid();
    const numbers=/^\d+(?:\s*,\s*\d+)*$/.test(value)?value.split(',').map(v=>Number(v.trim())):null;
    if(numbers){if(!q.options||!q.multiSelect&&numbers.length!==1||new Set(numbers).size!==numbers.length)invalid();const selected=numbers.map(n=>q.options[n-1]?.label);if(selected.some(v=>!v))invalid();return {id:q.id,selected};}
    if(q.intent?.kind==='approval'){const choice=q.options?.find(o=>o.label===value);if(!choice||value===q.intent.always)invalid();return {id:q.id,selected:[value]};}
    return {id:q.id,selected:[],custom:value};
  })};
}

/** Only a scoped native answerer; no replacement approval policy or event fabrication. */
export class IMInteractions{
  constructor(service){this.service=service;}
  install(agent){
    const disposers=[];
    disposers.push(agent.ctx.on('approval/request',async(req,next)=>{
      if(req.agent!==agent)return next();const origin=await this.service.activeOrigin(agent.id);if(!origin)return next();
      return this.open(origin,{type:'approval',sessionId:agent.id,toolName:req.toolName,reason:req.reason??'',signal:req.signal});
    }));
    disposers.push(agent.ctx.on('user-questions/request',async(req,next)=>{
      if(req.agent!==agent)return next();const origin=await this.service.activeOrigin(agent.id);if(!origin)return next();
      const questions=req.questions.map(q=>({...q,...q.intent?.kind==='approval'?{options:q.options.filter(o=>o.label!==q.intent.always)}:{}}));
      return this.open(origin,{type:'question',sessionId:agent.id,questions,callId:req.wait?.callId,signal:req.signal,agent});
    }));
    return()=>{for(const dispose of disposers.reverse())dispose();};
  }
  open(input,request){
    const s=this.service,id=randomBytes(10).toString('hex'),expires=Date.now()+600000;
    const row={id,...originOf(input),sessionId:request.sessionId,type:request.type,questions:request.questions,callId:request.callId,state:'open',expires};
    if(request.signal?.aborted)return request.type==='approval'?Promise.resolve('cancelled'):Promise.reject(Error('ASK_ABORTED'));
    s.store.saveInteraction(row);
    let text,buttons;
    if(request.type==='approval'){
      text=`审批 · ${request.toolName}\n${request.reason}\n\n/answer ${id} allow\n/answer ${id} reject`;
      buttons=[{label:'允许一次',data:`im:${id}:allow`},{label:'拒绝',data:`im:${id}:reject`}];
    }else{
      text=request.questions.map((q,i)=>`${i+1}. ${q.question}${q.detail?'\n'+q.detail:''}\n${(q.options??[]).map((o,j)=>`${j+1}) ${o.label}`).join('\n')}`).join('\n\n')+`\n\n/answer ${id} 答案（多题用 | 分隔，多选用逗号）`;
      if(request.questions.length===1&&!request.questions[0].multiSelect)buttons=(request.questions[0].options??[]).slice(0,5).map((o,i)=>({label:o.label,data:`im:${id}:${i+1}`}));
    }
    s.delivery.text(input,'interaction:'+id,text,buttons,{interactionId:id});
    void s.kick();
    return new Promise((resolve,reject)=>{
      const ac=new AbortController();let settled=false;
      const finish=(state,value,error)=>{
        if(settled)return;settled=true;clearTimeout(timer);request.signal?.removeEventListener('abort',cancel);ac.abort();s.waiters.delete(id);
        s.store.saveInteraction({...s.store.interaction(id),state});error?reject(error):resolve(value);
      };
      const cancel=()=>finish('expired',request.type==='approval'?'cancelled':undefined,request.type==='question'?Error('ASK_ABORTED'):null);
      const timer=setTimeout(cancel,Math.max(1,expires-Date.now()));timer.unref?.();
      s.waiters.set(id,{cancel,answer:value=>finish('answered',value)});
      request.signal?.addEventListener('abort',cancel,{once:true});
      if(request.signal?.aborted){cancel();return;}
      // Native timed waits require a public UI claim. Abort releases it on answer, revoke or shutdown.
      if(request.callId&&request.agent?.ctx.userQuestions)void(async()=>{try{for await(const _ of request.agent.ctx.userQuestions.attachWait(request.agent,request.callId,ac.signal)){/* native service owns wait lifetime */}}catch{if(!ac.signal.aborted)cancel();}})();
    });
  }
  respond(connectionId,event,id,value){
    const s=this.service,row=s.store.interaction(id),waiter=s.waiters.get(id);
    if(!row||row.state!=='open'||row.expires<Date.now()||!waiter||!s.store.valid(row)||row.connectionId!==connectionId||row.chat.key!==event.chat.key||row.userId!==event.sender.id)return false;
    let result;
    if(row.type==='approval'){if(!['allow','reject'].includes(value))return false;result=value==='allow'?'allowed-once':'rejected';}
    else result=answer(row.questions,value);
    waiter.answer(result);return true;
  }
  async text(input){
    const m=/^\/answer\s+([a-f0-9]{20})\s+([\s\S]+)$/i.exec(input.text.trim());let ok=false;
    try{if(m)ok=this.respond(input.connectionId,{chat:input.chat,sender:{id:input.userId}},m[1],m[2].trim());}catch{}
    this.service.delivery.text(input,'answer:'+input.id,ok?'已提交':'确认已失效或答案格式不匹配');
  }
  async action(connectionId,event){const m=/^im:([a-f0-9]{20}):(.+)$/.exec(event.data??'');if(m)try{this.respond(connectionId,event,m[1],m[2]);}catch{}}
}
