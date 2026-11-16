'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {createHash}=require('node:crypto');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function localSettings(app){
 let root=process.env.NAUMI_ROOT;
 const link=path.join(app.getPath('userData'),'backend-link.json');
 if(!root&&app.isPackaged&&fs.existsSync(link))root=JSON.parse(fs.readFileSync(link,'utf8')).root;
 if(!root&&!app.isPackaged)root=path.resolve(__dirname,'../..');
 if(root){
  root=path.resolve(root);const c=JSON.parse(fs.readFileSync(path.join(root,'config/local.json'),'utf8'));
  if(!['127.0.0.1','localhost'].includes(c.host)||!Number.isInteger(c.port))throw Error('INVALID_LOCAL_BACKEND');
  if(process.env.NAUMI_ROOT&&process.env.NAUMI_TEST!=='1'){fs.mkdirSync(path.dirname(link),{recursive:true});fs.writeFileSync(link,JSON.stringify({root},null,2)+'\n');}
  return {root,home:process.env.NAUMI_DSH_HOME??c.home,url:process.env.NAUMI_HOST_URL??`http://${c.host}:${c.port}`,node:process.env.NAUMI_NODE??'node.exe',logDir:path.join(root,'logs')};
 }
 root=path.join(process.resourcesPath,'backend');
 const home=path.join(app.getPath('userData'),'harness'),profile=path.join(home,'profiles/web');
 fs.mkdirSync(profile,{recursive:true});
 for(const [file,template]of [['package.json','profile.json'],['cordis.patch.yml','profile.yml']])if(!fs.existsSync(path.join(profile,file)))fs.copyFileSync(path.join(root,'defaults',template),path.join(profile,file));
 if(!fs.existsSync(path.join(home,'cordis.patch.yml')))fs.copyFileSync(path.join(root,'defaults/home.yml'),path.join(home,'cordis.patch.yml'));
 if(!fs.existsSync(path.join(profile,'node_modules')))fs.symlinkSync(path.join(root,'node_modules'),path.join(profile,'node_modules'),'junction');
 return {root,home,url:process.env.NAUMI_HOST_URL??'http://127.0.0.1:3080',node:path.join(root,'node.exe'),logDir:path.join(home,'logs')};
}
function launchFromLog(settings){
 for(const name of ['server.out.log','server.err.log']){let text='';try{text=fs.readFileSync(path.join(settings.logDir,name),'utf8');}catch{}const urls=text.match(/http:\/\/127\.0\.0\.1:\d+\/?\?token=[A-Za-z0-9_~.%-]+/g)??[];for(const url of urls.reverse())if(new URL(url).origin===settings.url)return url;}
 return settings.url;
}
async function ensureBackend(settings){
 const expected=createHash('sha256').update(fs.readFileSync(path.join(settings.root,'plugins/naumi-enterprise/assets/symbol.svg'))).digest('hex');
 const probe=async()=>{try{const r=await fetch(settings.url+'/naumi/assets/symbol.svg',{signal:AbortSignal.timeout(1500)});if(!r.ok)return false;return createHash('sha256').update(Buffer.from(await r.arrayBuffer())).digest('hex')===expected;}catch{return false;}};
 if(await probe())return {launchURL:launchFromLog(settings),owned:false};
 // Never take over an unrelated process on the configured port.
 try{await fetch(settings.url,{signal:AbortSignal.timeout(1000)});throw Error('LOCAL_PORT_OCCUPIED');}catch(e){if(e.message==='LOCAL_PORT_OCCUPIED')throw e;}
 const entry=path.join(settings.root,'node_modules/@deepseek-ai/dsh/lib/bin.js');if(!fs.existsSync(entry))throw Error('BACKEND_RUNTIME_MISSING');
 fs.mkdirSync(settings.logDir,{recursive:true});
 const out=fs.openSync(path.join(settings.logDir,'server.out.log'),'w'),err=fs.openSync(path.join(settings.logDir,'server.err.log'),'w');
 const target=new URL(settings.url),env={...process.env,PATH:settings.root+path.delimiter+(process.env.PATH??''),DSH_HOME:settings.home,DSH_TELEMETRY_MODE:'DISABLED'};delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(settings.node,[entry,'web','--host','127.0.0.1','--port',target.port,'--no-open'],{cwd:settings.root,env,windowsHide:true,stdio:['ignore',out,err]});fs.closeSync(out);fs.closeSync(err);
 let error;child.on('error',e=>error=e);
 const deadline=Date.now()+90000;
 while(Date.now()<deadline){if(error||child.exitCode!==null)throw Error('BACKEND_START_FAILED');if(await probe())return {launchURL:launchFromLog(settings),owned:true,child};await delay(350);}
 child.kill();throw Error('BACKEND_START_TIMEOUT');
}
module.exports={localSettings,ensureBackend,launchFromLog};
