/** One in-flight operation; resize and passive frames are latest-only, mutations stay ordered. */
export function browserViewport(width,height){return {width:Math.max(200,Math.min(2560,Math.round(width))),height:Math.max(120,Math.min(1600,Math.round(height)))};}
export function browserPoint(rect,viewport,x,y){
  const scale=Math.min(rect.width/viewport.width,rect.height/viewport.height),px=(x-rect.left)/scale,py=(y-rect.top)/scale;
  if(px<0||py<0||px>=viewport.width||py>=viewport.height)return null;
  return {x:Math.floor(px),y:Math.floor(py)};
}
export class BrowserScheduler {
  constructor({request,onState,onError=()=>{},onBusy=()=>{},resizeDelay=180,pollDelay=1200}){Object.assign(this,{request,onState,onError,onBusy,resizeDelay,pollDelay});this.actions=[];this.active=false;this.closed=false;this.version=0;this.stats={requests:0,resizeRequests:0,discardedFrames:0,maxConcurrent:0};}
  setActive(value){this.active=value;clearTimeout(this.pollTimer);if(value){this.frameWanted=true;this.poll();this.pump();}}
  setDragging(value){this.dragging=value;if(!value)this.pump();}
  poll(){this.pollTimer=setTimeout(()=>{if(!this.active||this.closed)return;this.frameWanted=true;this.pump();this.poll();},this.pollDelay);}
  resize(width,height){
    const size=browserViewport(width,height),key=`${size.width}x${size.height}`;if(key===this.desiredKey)return;
    this.desired=size;this.desiredKey=key;this.version++;this.resizing=true;clearTimeout(this.resizeTimer);
    this.resizeTimer=setTimeout(()=>{this.resizing=false;this.pump();},this.resizeDelay);
    return true;
  }
  perform(args){
    if(this.closed)return Promise.reject(Error('BROWSER_VIEW_CLOSED'));
    if(this.actions.length>=64)return Promise.reject(Error('BROWSER_INPUT_QUEUE_BUSY'));
    const promise=new Promise((resolve,reject)=>{this.actions.push({args,settlers:[{resolve,reject}]});});this.onBusy(true);this.pump();return promise;
  }
  nextAction(){
    const entry=this.actions.shift();
    // Typing bursts and wheel bursts can be composed, never replayed or moved across another action.
    while(entry&&['text','wheel'].includes(entry.args.action)&&this.actions[0]?.args.action===entry.args.action){
      const next=this.actions[0];
      if(entry.args.action==='text'){if((entry.args.text??'').length+(next.args.text??'').length>16384)break;entry.args={...entry.args,text:(entry.args.text??'')+(next.args.text??'')};}
      else entry.args={...next.args,deltaX:(entry.args.deltaX??0)+(next.args.deltaX??0),deltaY:(entry.args.deltaY??0)+(next.args.deltaY??0)};
      this.actions.shift();entry.settlers.push(...next.settlers);
    }
    return entry;
  }
  async pump(){
    if(this.closed||!this.active||this.inFlight||this.resizing||this.dragging)return;
    let entry,resize=false;
    if(this.desiredKey&&this.desiredKey!==this.appliedKey){entry={args:{action:'resize',...this.desired},settlers:[]};resize=true;}
    else entry=this.nextAction();
    if(!entry){if(!this.frameWanted)return;entry={args:{action:'state'},settlers:[]};}
    this.frameWanted=false;this.inFlight=true;const version=this.version,key=this.desiredKey;this.controller=new AbortController();
    this.stats.requests++;if(resize)this.stats.resizeRequests++;this.stats.maxConcurrent=Math.max(1,this.stats.maxConcurrent);
    try{
      const data=await this.request({...entry.args,frame:true},this.controller.signal);
      if(!this.closed){
        if(version===this.version){if(resize)this.appliedKey=key;this.onState(data);}
        else this.stats.discardedFrames++;
      }
      for(const s of entry.settlers)s.resolve(data);
    }catch(error){if(!this.closed&&version===this.version)this.onError(error);for(const s of entry.settlers)s.reject(error);if(resize&&version===this.version)this.appliedKey=key;}
    finally{this.inFlight=false;this.onBusy(this.actions.length>0);this.pump();}
  }
  dispose(){this.closed=true;this.active=false;clearTimeout(this.resizeTimer);clearTimeout(this.pollTimer);this.controller?.abort();for(const e of this.actions)for(const s of e.settlers)s.reject(Error('BROWSER_VIEW_CLOSED'));this.actions=[];}
}
