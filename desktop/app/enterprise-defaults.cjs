'use strict';
const {readConnection,connect,enterpriseOrigin}=require('./enterprise.cjs');
const fs=require('node:fs'),path=require('node:path');
const DEFAULT_ENTERPRISE_ORIGIN='https://design-ops.47.105.59.142.sslip.io';
const CENTRAL_IDENTITY_ORIGIN='https://47.105.59.142';

// An address is not an authenticated business session or an enrollment grant.
// Preserve explicitly configured deployments and the original account/workbench home.
function enterpriseConnection({home,packaged=false,identityOrigin='',configuredOrigin}){
 if(configuredOrigin)return connect(home,configuredOrigin);
 const prior=readConnection(home);if(prior)return prior;
 if(!packaged||identityOrigin!==CENTRAL_IDENTITY_ORIGIN)return null;
 const receipt=path.join(home,'desktop-backend.json');
 if(fs.existsSync(receipt)){
  const value=JSON.parse(fs.readFileSync(receipt));
  if(!Number.isInteger(value.pid)||value.pid<1)throw Error('ENTERPRISE_BACKEND_STATE_UNKNOWN');
  try{process.kill(value.pid,0);return null;}catch(e){if(e.code!=='ESRCH')throw Error('ENTERPRISE_BACKEND_STATE_UNKNOWN');}
 }
 const state=path.join(home,'naumi/employee-sync.sqlite');
 if(fs.existsSync(state)){
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(state,{readOnly:true});
  try{const registration=db.prepare("SELECT value FROM config WHERE key='registration'").get();
   if(registration&&JSON.parse(registration.value)||db.prepare("SELECT count(*) AS n FROM outbox WHERE status='pending'").get().n)throw Error('ENTERPRISE_EXISTING_DEVICE_REQUIRES_MIGRATION');
  }finally{db.close();}
 }
 return connect(home,DEFAULT_ENTERPRISE_ORIGIN);
}
function allowedEnterpriseNavigation(origin,value){
 try{
  origin=enterpriseOrigin(origin);const url=new URL(value);
  if(url.username||url.password)return false;
  if(url.origin===origin)return true;
  // Only the official deployment uses this authority. Other enterprises never
  // inherit an unrelated issuer, and API/session cookies never cross the bridge.
  const interaction=/^\/api\/identity-interaction\/[-_a-zA-Z0-9]+(?:\/[-_a-zA-Z0-9]+)*\/?$/;
  const signIn=['/','/dashboard'].includes(url.pathname)&&url.searchParams.get('auth')==='sign-in'&&
   url.searchParams.getAll('auth').length===1&&url.searchParams.getAll('redirect').length===1&&
   interaction.test(url.searchParams.get('redirect')??'')&&[...url.searchParams.keys()].every(k=>['auth','redirect'].includes(k));
  return origin===DEFAULT_ENTERPRISE_ORIGIN&&url.origin===CENTRAL_IDENTITY_ORIGIN&&
   (/^\/api\/identity\/(?:auth|session\/end)(?:\/|$)/.test(url.pathname)||interaction.test(url.pathname)||signIn);
 }catch{return false;}
}
module.exports={DEFAULT_ENTERPRISE_ORIGIN,CENTRAL_IDENTITY_ORIGIN,enterpriseConnection,allowedEnterpriseNavigation};
