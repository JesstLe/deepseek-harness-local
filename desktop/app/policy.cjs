'use strict';
const {createHash}=require('node:crypto');
function partitionFor(account,workspace){
  if(typeof account!=='string'||!account||typeof workspace!=='string'||!workspace||workspace.length>4096)throw Error('INVALID_BROWSER_ACCOUNT');
  return 'persist:naumi-browser-'+createHash('sha256').update(JSON.stringify([account,workspace])).digest('hex').slice(0,32);
}
function isAppHost(url,hostURL){const host=new URL(hostURL);return url.port===host.port&&(url.hostname===host.hostname||['localhost','127.0.0.1','[::1]'].includes(url.hostname));}
function browserURL(value,hostURL){
  if(typeof value!=='string'||value.length>8192)throw Error('INVALID_BROWSER_URL');
  let url;try{url=new URL(value);}catch{throw Error('INVALID_BROWSER_URL');}
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||isAppHost(url,hostURL))throw Error('INVALID_BROWSER_URL');
  return url.href;
}
function binding(value){
  if(!value||!['lease','sessionId','tabId'].every(k=>typeof value[k]==='string'&&value[k].length>0&&value[k].length<=200)||typeof value.visible!=='boolean')throw Error('INVALID_BROWSER_BINDING');
  return {lease:value.lease,sessionId:value.sessionId,tabId:value.tabId,visible:value.visible};
}
module.exports={partitionFor,isAppHost,browserURL,binding};
