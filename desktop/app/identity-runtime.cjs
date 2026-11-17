'use strict';
const fs=require('node:fs'),path=require('node:path');
const {atomic}=require('./profile.cjs');
const {identityOrigin,readIdentityConfig,bindAccount,sessionPartition,IdentitySession,publicUser}=require('./identity.cjs');
class IdentityRuntime{
 constructor({userData,sessionFor,managedOrigin='',legacyHome}){this.userData=userData;this.sessionFor=sessionFor;this.managedOrigin=managedOrigin?identityOrigin(managedOrigin):'';this.legacyHome=legacyHome;this.active=null;this.client=null;this.error=null;}
 origin(){return this.managedOrigin||readIdentityConfig(this.userData)?.origin||'';}
 legacyOwner(){if(!this.legacyHome)return null;const file=path.join(this.legacyHome,'naumi-legacy-owner.json');if(!fs.existsSync(file))return null;if(fs.lstatSync(file).isSymbolicLink())throw Error('IDENTITY_LOCAL_OWNER_INVALID');const owner=JSON.parse(fs.readFileSync(file));if(owner.version!==1||!owner.origin||!owner.subject)throw Error('IDENTITY_LOCAL_OWNER_INVALID');return owner;}
 legacyAccess(origin,user,confirmed=false){if(!this.legacyHome)return;const file=path.join(this.legacyHome,'naumi-legacy-owner.json'),owner={version:1,origin,subject:publicUser(user).subject},prior=this.legacyOwner();if(prior&&JSON.stringify(prior)!==JSON.stringify(owner))throw Error('IDENTITY_LOCAL_ACCOUNT_MISMATCH');if(!prior){if(!confirmed)throw Error('IDENTITY_LOCAL_CLAIM_REQUIRED');fs.mkdirSync(this.legacyHome,{recursive:true});atomic(file,owner);}}
 status(){return {available:true,origin:this.origin(),managed:!!this.managedOrigin,user:this.active?.user??null,error:this.error,legacyClaimRequired:!!this.legacyHome&&!this.legacyOwner()};}
 use(origin){origin=identityOrigin(origin);if(!this.client||this.client.origin!==origin)this.client=new IdentitySession({origin,session:this.sessionFor(sessionPartition(origin))});return this.client;}
 async restore(){
  // An already opened local account continues in this process during an outage.
  // Cold start always verifies the server; no unsigned offline grant is invented.
  if(this.active)return this.active;const origin=this.origin();if(!origin)return null;
  try{const user=await this.use(origin).inspect();this.error=user||!readIdentityConfig(this.userData)?null:'IDENTITY_LOGIN_REQUIRED';if(user)this.legacyAccess(origin,user);return user?(this.active=bindAccount(this.userData,origin,user)):null;}catch(error){this.error=/^IDENTITY_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE';return null;}
 }
 async login(input){
  if(this.active)throw Error('IDENTITY_ALREADY_SIGNED_IN');
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['origin','account','password','claimLocal'].includes(k))||input.claimLocal!==undefined&&typeof input.claimLocal!=='boolean')throw Error('IDENTITY_INPUT_INVALID');
  const origin=identityOrigin(input.origin||this.origin());if(this.managedOrigin&&origin!==this.managedOrigin)throw Error('IDENTITY_MANAGED_ORIGIN');
  const user=await this.use(origin).login({account:input.account,password:input.password});
  this.legacyAccess(origin,user,input.claimLocal===true);
  this.active=bindAccount(this.userData,origin,user);this.error=null;return this.active;
 }
 async logout(){const result=this.client?await this.client.logout():{remoteConfirmed:false};this.active=null;this.error=null;return result;}
}
module.exports={IdentityRuntime};
