'use strict';
const {identityOrigin,readIdentityConfig,bindAccount,sessionPartition,IdentitySession}=require('./identity.cjs');
class IdentityRuntime{
 constructor({userData,sessionFor,managedOrigin=''}){this.userData=userData;this.sessionFor=sessionFor;this.managedOrigin=managedOrigin?identityOrigin(managedOrigin):'';this.active=null;this.client=null;this.error=null;}
 origin(){return this.managedOrigin||readIdentityConfig(this.userData)?.origin||'';}
 status(){return {available:true,origin:this.origin(),managed:!!this.managedOrigin,user:this.active?.user??null,error:this.error};}
 use(origin){origin=identityOrigin(origin);if(!this.client||this.client.origin!==origin)this.client=new IdentitySession({origin,session:this.sessionFor(sessionPartition(origin))});return this.client;}
 async restore(){
  // An already opened local account continues in this process during an outage.
  // Cold start always verifies the server; no unsigned offline grant is invented.
  if(this.active)return this.active;const origin=this.origin();if(!origin)return null;
  try{const user=await this.use(origin).inspect();this.error=user||!readIdentityConfig(this.userData)?null:'IDENTITY_LOGIN_REQUIRED';return user?(this.active=bindAccount(this.userData,origin,user)):null;}catch(error){this.error=/^IDENTITY_[A-Z_]+$/.test(error.message)?error.message:'IDENTITY_UNAVAILABLE';return null;}
 }
 async login(input){
  if(this.active)throw Error('IDENTITY_ALREADY_SIGNED_IN');
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['origin','account','password'].includes(k)))throw Error('IDENTITY_INPUT_INVALID');
  const origin=identityOrigin(input.origin||this.origin());if(this.managedOrigin&&origin!==this.managedOrigin)throw Error('IDENTITY_MANAGED_ORIGIN');
  const user=await this.use(origin).login({account:input.account,password:input.password});
  this.active=bindAccount(this.userData,origin,user);this.error=null;return this.active;
 }
 async logout(){const result=this.client?await this.client.logout():{remoteConfirmed:false};this.active=null;this.error=null;return result;}
}
module.exports={IdentityRuntime};
