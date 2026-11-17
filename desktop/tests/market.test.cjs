'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {MarketSession,validate}=require('../app/market.cjs');
test('market native adapter only exposes market routes on the signed-in authority',()=>{
 for(const endpoint of ['https://evil.test/api/plugin-market/v1/me','/api/auth/session','/api/plugin-market/v1/../../auth/session','/api/plugin-market/v1/me#fragment','//evil.test/api/plugin-market/v1/me'])assert.throws(()=>validate({endpoint}),/FORBIDDEN/);
 assert.throws(()=>validate({endpoint:'/api/plugin-market/v1/publish',method:'GET'}),/FORBIDDEN/);
 assert.throws(()=>validate({endpoint:'/api/plugin-market/v1/me',cookie:'forged'}),/FORBIDDEN/);
 assert.equal(validate({endpoint:'/api/plugin-market/v1/packages?q=test'}).method,'GET');
});
test('native market uses existing Chromium session and returns no raw credential fields',async()=>{
 const identity={active:{origin:'https://accounts.test',profileId:'alice'},client:{session:{async fetch(url,options){assert.equal(url,'https://accounts.test/api/plugin-market/v1/me');assert.equal(options.credentials,'include');assert.equal(options.redirect,'error');assert.equal(options.headers.cookie,undefined);return Response.json({user:{id:'opaque',name:'Alice'}});}}}};
 const market=new MarketSession({identity:()=>identity});assert.equal(market.descriptor().origin,identity.active.origin);const result=await market.perform({endpoint:'/api/plugin-market/v1/me'});assert.equal(result.status,200);assert.equal(JSON.parse(result.body).user.name,'Alice');assert.equal(market.running,0);
});
test('same-origin account switch discards stale response and always releases in-flight count',async()=>{
 let release;const identity={active:{origin:'https://accounts.test',profileId:'alice'},client:{session:{fetch:()=>new Promise(r=>release=r)}}};const market=new MarketSession({identity:()=>identity});const result=market.perform({endpoint:'/api/plugin-market/v1/me'});assert.equal(market.running,1);identity.active={origin:'https://accounts.test',profileId:'bob'};release(Response.json({user:{name:'Alice'}}));await assert.rejects(result,/MARKET_ACCOUNT_CHANGED/);assert.equal(market.running,0);
});
test('market login, oversized response and network failures remain bounded and do not replay',async()=>{
 const empty=new MarketSession({identity:()=>null});assert.equal(empty.descriptor(),null);await assert.rejects(empty.perform({endpoint:'/api/plugin-market/v1/me'}),/LOGIN_REQUIRED/);
 let calls=0;const identity={active:{origin:'https://accounts.test'},client:{session:{async fetch(){calls++;throw Error('sensitive upstream details');}}}},market=new MarketSession({identity:()=>identity});await assert.rejects(market.perform({endpoint:'/api/plugin-market/v1/me'}),/^Error: MARKET_UNAVAILABLE_NO_REPLAY$/);assert.equal(calls,1);assert.equal(market.running,0);
 identity.client.session.fetch=async()=>new Response('x'.repeat(3*1024*1024+65537),{headers:{'content-type':'application/json'}});await assert.rejects(market.perform({endpoint:'/api/plugin-market/v1/me'}),/TOO_LARGE/);assert.equal(market.running,0);
});
