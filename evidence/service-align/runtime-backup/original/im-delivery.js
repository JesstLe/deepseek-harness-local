import {chunkMarkdown} from './im-adapters/format.js';

export function originOf(input){return {bindingId:input.bindingId,bindingRevision:input.bindingRevision,userId:input.userId,connectionId:input.connectionId,chat:input.chat,inputId:input.id};}

/** One durable send per chunk. Unknown receipt is NOT a reason to call the model again. */
export class IMDelivery{
  constructor({store,getHandle,sendFile}){Object.assign(this,{store,getHandle,sendFile});}
  text(input,key,text,buttons,meta={}){
    const chunks=chunkMarkdown(String(text||'（回复已结束）'),3000);
    chunks.forEach((text,index)=>this.store.enqueue(originOf(input),`${key}:text:${index}`,{type:'text',text,...meta,...buttons&&index===chunks.length-1?{buttons}:{}}));
  }
  files(input,key,files){for(const [index,ref] of (files??[]).entries())this.store.enqueue(originOf(input),`${key}:file:${index}`,{type:'file',ref});}
  async pump(){
    const blocked=new Set();
    for(const row of this.store.outputs()){
      if(['queued','unknown','failed'].includes(row.state)&&!this.store.valid(row)){this.store.updateOutput(row.id,{state:'revoked',previousState:row.state});continue;}
      if(row.payload.interactionId&&this.store.interaction(row.payload.interactionId)?.state!=='open'&&row.state==='queued'){this.store.updateOutput(row.id,{state:'revoked'});continue;}
      if(['unknown','failed'].includes(row.state)){blocked.add(row.bindingId);continue;}
      if(row.state!=='queued')continue;
      if(!this.store.valid(row)){this.store.updateOutput(row.id,{state:'revoked'});continue;}
      if(row.nextAt>Date.now()){blocked.add(row.bindingId);continue;}if(blocked.has(row.bindingId))continue;
      const handle=this.getHandle(row.connectionId);if(!handle)continue;
      if(row.payload.interactionId&&this.store.interaction(row.payload.interactionId)?.state!=='open'){this.store.updateOutput(row.id,{state:'revoked'});continue;}
      this.store.updateOutput(row.id,{state:'sending',attempt:row.attempt+1});
      try{
        const receipt=row.payload.type==='file'?await this.sendFile(row):await handle.send(row.chat,row.payload);
        this.store.updateOutput(row.id,{state:'sent',receipt:receipt??{},sentAt:new Date().toISOString(),error:null});
      }catch(e){
        // Explicit rate-limit rejection is retryable. Network/timeout/5xx can have committed remotely.
        const retry=e.status===429&&row.attempt<5;
        const state=retry?'queued':e.permanent===true?'failed':'unknown';
        this.store.updateOutput(row.id,{state,nextAt:Date.now()+Math.min(60000,2000*2**row.attempt),error:retry?'IM_RATE_LIMITED':state==='unknown'?'IM_SEND_UNKNOWN':'IM_SEND_REJECTED'});
        blocked.add(row.bindingId);
      }
    }
  }
}
