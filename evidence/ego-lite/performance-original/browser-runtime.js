import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export const BROWSER_LOCK=JSON.parse(fs.readFileSync(new URL('./third-party/ego-lite/runtime-lock.json',import.meta.url),'utf8'));
const digest=x=>createHash('sha256').update(x).digest('hex');
const verified=new Map();
export function resolveBrowserRuntime({root,platform=process.platform,arch=process.arch}={}) {
  if(platform!=='win32'||arch!=='x64')throw Error('EGO_PLATFORM_NOT_PACKAGED');
  if(!root){
    let cursor=fileURLToPath(new URL('.',import.meta.url));
    while(!fs.existsSync(path.join(cursor,'runtime/ego-lite/win32-x64/Application/ego.exe'))){const up=path.dirname(cursor);if(up===cursor)throw Error('EGO_RUNTIME_NOT_INSTALLED');cursor=up;}
    root=cursor;
  }
  const app=path.resolve(root,'runtime/ego-lite/win32-x64/Application');
  for(const [relative,expected]of Object.entries(BROWSER_LOCK.binaries)){
    const file=path.join(app,relative);if(!fs.existsSync(file))throw Error('EGO_RUNTIME_INCOMPLETE');
    const stat=fs.statSync(file),stamp=`${stat.size}:${stat.mtimeMs}`;
    if(verified.get(file)!==stamp){if(digest(fs.readFileSync(file))!==expected)throw Error('EGO_RUNTIME_CHECKSUM_MISMATCH');verified.set(file,stamp);}
  }
  return {root,app,command:path.join(app,BROWSER_LOCK.browserVersion,'ego-browser.exe'),version:BROWSER_LOCK.browserVersion};
}

export const BROWSER_ACTIONS=['state','navigate','back','forward','reload','resize','click','fill','press','text','wheel','snapshot','tabs','select','dialog','finish'];
export function browserURL(value){
  if(typeof value!=='string'||value.length>8192)throw Error('INVALID_BROWSER_URL');
  const input=value.trim();if(input==='about:blank')return input;
  const url=new URL(/^[a-z][a-z\d+.-]*:/i.test(input)&&!/^localhost:\d/i.test(input)?input:(/^(?:localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(input)?'http://':'https://')+input);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('INVALID_BROWSER_URL');
  return url.href;
}
export function validateBrowserInput(input){
  if(!input||typeof input!=='object'||!BROWSER_ACTIONS.includes(input.action))throw Error('INVALID_BROWSER_ACTION');
  const out={action:input.action};
  for(const key of ['selector','text','key','label'])if(input[key]!==undefined){if(typeof input[key]!=='string'||input[key].length>(key==='text'?16384:4096))throw Error('INVALID_BROWSER_'+key.toUpperCase());out[key]=input[key];}
  for(const key of ['x','y','deltaX','deltaY','width','height','modifiers'])if(input[key]!==undefined){if(!Number.isFinite(input[key]))throw Error('INVALID_BROWSER_NUMBER');out[key]=input[key];}
  if(input.action==='navigate')out.url=browserURL(input.url);
  if(input.action==='resize'&&(!Number.isInteger(out.width)||out.width<320||out.width>2560||!Number.isInteger(out.height)||out.height<240||out.height>1600))throw Error('INVALID_BROWSER_VIEWPORT');
  if(input.action==='click'&&!out.selector&&(!(out.x>=0&&out.x<=2560)||!(out.y>=0&&out.y<=1600)))throw Error('INVALID_BROWSER_POINT');
  if(input.action==='fill'&&(!out.selector||out.text===undefined))throw Error('INVALID_BROWSER_FILL');
  if(input.action==='press'&&(!out.key||out.key.length>64))throw Error('INVALID_BROWSER_KEY');
  if(input.action==='select'&&!/^p\d+$/.test(out.label??''))throw Error('INVALID_BROWSER_PAGE');
  if(input.action==='dialog'){if(!['accept','dismiss'].includes(input.text))throw Error('INVALID_BROWSER_DIALOG');}
  out.frame=input.frame===true;return out;
}

/** Structured operations only; never interpolate page/script text into shell syntax. */
export class EgoBrowserRuntime {
  constructor({runtime,spawnProcess=spawn}={}){this.runtime=runtime;this.spawnProcess=spawnProcess;this.queues=new Map();this.pages=new Map();this.viewports=new Map();this.children=new Set();this.closed=false;}
  status(){try{const r=this.runtime??resolveBrowserRuntime();return {status:'installed',version:r.version,engine:'ego-lite',presentation:'interactive-stream'};}catch(e){return {status:'not_installed',error:e.message,engine:'ego-lite'};}}
  async perform(scope,input,{signal}={}){
    if(this.closed)throw Error('EGO_RUNTIME_DISPOSED');
    if(typeof scope!=='string'||!scope||scope.length>200)throw Error('INVALID_BROWSER_SCOPE');
    const args=validateBrowserInput(input),name='Naumi-'+digest(scope).slice(0,20);
    const before=this.queues.get(scope)??Promise.resolve();
    const job=before.catch(()=>{}).then(async()=>{if(this.closed)throw Error('EGO_RUNTIME_DISPOSED');signal?.throwIfAborted();if(args.action==='resize')this.viewports.set(scope,{width:args.width,height:args.height});const data=await this.run({name,label:this.pages.get(scope)??'p1',...this.viewports.get(scope),...args},signal);if(data.label)this.pages.set(scope,data.label);if(data.closed){this.pages.delete(scope);this.viewports.delete(scope);}return data;});
    this.queues.set(scope,job);try{return await job;}finally{if(this.queues.get(scope)===job)this.queues.delete(scope);}
  }
  run(input,signal){
    const r=this.runtime??resolveBrowserRuntime();
    const module=pathToFileURL(fileURLToPath(new URL('./browser-bridge.mjs',import.meta.url))).href;
    const code=`await (await import(${JSON.stringify(module)})).run(${JSON.stringify(input)})`;
    return new Promise((resolve,reject)=>{
      const child=this.spawnProcess(r.command,['nodejs','-e',code],{cwd:r.app,windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      this.children.add(child);let out='',err='',reason=null;
      const stop=error=>{reason??=error;child.kill();};
      const abort=()=>stop(signal.reason??Error('EGO_CANCELLED'));
      const timer=setTimeout(()=>stop(Error('EGO_OPERATION_TIMEOUT_NO_REPLAY')),45000);
      signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
      const consume=b=>{out+=b;if(out.length>12*1024*1024)stop(Error('EGO_OUTPUT_LIMIT'));};
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',consume);child.stderr.on('data',consume);
      child.on('error',e=>{reason=e;});
      child.on('close',()=>{
        clearTimeout(timer);signal?.removeEventListener('abort',abort);this.children.delete(child);
        if(reason){reject(reason);return;}
        const line=out.split(/\r?\n/).find(x=>x.startsWith('NAUMI_BROWSER_RESULT='));
        if(!line){reject(Error(/onboarding/i.test(out+err)?'EGO_ONBOARDING_REQUIRED':'EGO_CONNECTION_UNAVAILABLE'));return;}
        try{const result=JSON.parse(line.slice(21));if(!result.ok){reject(Error(result.error??'EGO_OPERATION_FAILED'));return;}resolve(result.data);}catch(e){reject(e);}
      });
    });
  }
  async dispose(){this.closed=true;for(const child of this.children)child.kill();await Promise.allSettled(this.queues.values());}
}
