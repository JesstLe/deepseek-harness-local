'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
test('uninstall waits for directory and environment rather than launcher exit',async()=>{
 const {createUninstallObserver}=await import('../scripts/nsis-observer.mjs');let tick=0,launches=0;const checkpoints=[];
 const observer=createUninstallObserver({launch:()=>launches++,isDirectoryAbsent:()=>tick>=2,isEnvironmentRestored:()=>tick>=4,checkpoint:x=>checkpoints.push(x),now:()=>tick,sleep:async()=>{tick++;}});
 await observer.run(10);await observer.run(10);assert.equal(launches,1);assert.equal(tick,4);assert(observer.completed);assert.deepEqual(checkpoints.at(-1),{uninstallCompleted:true});
});
test('timeout and resumed observation never repeat uninstall',async()=>{
 const {createUninstallObserver}=await import('../scripts/nsis-observer.mjs');let tick=0,launches=0,removed=false;
 const observer=createUninstallObserver({launch:()=>launches++,isDirectoryAbsent:()=>removed,isEnvironmentRestored:()=>true,now:()=>tick,sleep:async()=>{tick++;}});
 await assert.rejects(observer.run(3),/OBSERVATION_TIMEOUT/);assert(observer.started);assert(!observer.completed);removed=true;await observer.run(3);assert.equal(launches,1);assert(observer.completed);
});
test('failed launcher stays started so cleanup cannot issue a duplicate',async()=>{
 const {createUninstallObserver}=await import('../scripts/nsis-observer.mjs');let launches=0;
 const observer=createUninstallObserver({launch:()=>{launches++;throw Error('launcher failed');},isDirectoryAbsent:()=>true,isEnvironmentRestored:()=>true});
 await assert.rejects(observer.run(),/launcher failed/);assert(observer.started);await observer.run();assert.equal(launches,1);
});
test('checkpoint persists complete stage data atomically without a pending file',async()=>{
 const {writeCheckpoint}=await import('../scripts/nsis-observer.mjs'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-nsis-checkpoint-')),file=path.join(dir,'checkpoint.json');
 try{writeCheckpoint(file,{stages:['install'],nativeExits:[0]});writeCheckpoint(file,{stages:['install','upgrade'],nativeExits:[0,0]});assert.deepEqual(JSON.parse(fs.readFileSync(file)),{stages:['install','upgrade'],nativeExits:[0,0]});assert(!fs.existsSync(file+'.pending'));}finally{fs.unlinkSync(file);fs.rmdirSync(dir);}
});
