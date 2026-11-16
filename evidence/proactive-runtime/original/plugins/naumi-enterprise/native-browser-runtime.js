import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {EgoBrowserRuntime,validateBrowserInput} from './browser-runtime.js';
/** Human input never travels through this transport. Only structured agent operations use it. */
export class NativeBrowserRuntime {
  constructor({home=process.env.DSH_HOME??path.join(os.homedir(),'.dsh'),legacy=new EgoBrowserRuntime()}={}){this.home=home;this.legacy=legacy;}
  descriptor(){
    const file=path.join(this.home,'naumi-desktop-bridge.json');if(!fs.existsSync(file))return null;
    let d;try{d=JSON.parse(fs.readFileSync(file,'utf8'));}catch{throw Error('NATIVE_BROWSER_BRIDGE_INVALID');}
    if(d.version!==1||!Number.isInteger(d.port)||d.port<1||d.port>65535||!/^\w{64}$/.test(d.token))throw Error('NATIVE_BROWSER_BRIDGE_INVALID');return d;
  }
  status(){try{return this.descriptor()?{status:'connected',engine:'chromium',presentation:'native-webview'}:this.legacy.status();}catch(e){return {status:'disconnected',engine:'chromium',error:e.message};}}
  async perform(sessionId,input,{signal}={}){
    const descriptor=input.frame===true?null:this.descriptor();
    if(!descriptor)return this.legacy.perform(sessionId,input,{signal});
    const args=validateBrowserInput(input);let response;
    try{response=await fetch(`http://127.0.0.1:${descriptor.port}/op`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+descriptor.token},body:JSON.stringify({sessionId,input:args}),signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(45000)])});}
    catch(e){if(signal?.aborted)throw signal.reason;throw Error(e.name==='TimeoutError'?'NATIVE_BROWSER_TIMEOUT_NO_REPLAY':'NATIVE_BROWSER_DISCONNECTED_NO_REPLAY');}
    const result=await response.json();if(!response.ok||!result.ok)throw Error(result.error??'NATIVE_BROWSER_OPERATION_FAILED_NO_REPLAY');return result.data;
  }
  async dispose(){await this.legacy.dispose();}
}
