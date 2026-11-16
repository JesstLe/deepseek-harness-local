import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {EgoBrowserRuntime,resolveBrowserRuntime} from '../plugins/naumi-enterprise/browser-runtime.js';
const oldDir='evidence/ego-lite/performance-original';

const {EgoBrowserRuntime:Original}=await import(pathToFileURL(path.resolve(oldDir,'browser-runtime.js')));
const runtime=resolveBrowserRuntime(),results={};
for(const [name,Type]of [['baseline',Original],['modified',EgoBrowserRuntime]]){
  let starts=0;const engine=new Type({runtime,spawnProcess:(...args)=>{starts++;return spawn(...args);}}),scope='naumi-browser-performance-20261116';
  try{
    await engine.perform(scope,{action:'resize',width:800,height:600});await engine.perform(scope,{action:'navigate',url:'about:blank'});
    const samples=[];let data;
    for(let i=0;i<8;i++){const start=performance.now();data=await engine.perform(scope,{action:'state',frame:true});samples.push(performance.now()-start);}
    results[name]={rounds:8,processStarts:starts,medianFrameMs:Math.round([...samples].sort((a,b)=>a-b)[4]),totalFrameMs:Math.round(samples.reduce((a,b)=>a+b,0)),observedWidth:data.width,observedHeight:data.height};
  }finally{await engine.perform(scope,{action:'finish'});await engine.dispose();}
}
assert.equal(results.modified.processStarts,1);assert.equal(results.modified.observedWidth,800);assert.equal(results.modified.observedHeight,600);assert(results.modified.medianFrameMs<results.baseline.medianFrameMs);
fs.writeFileSync('evidence/ego-lite/PERFORMANCE_CHECK.json',JSON.stringify(results,null,2)+'\n');
console.log('EGO_PERFORMANCE baseline_processes='+results.baseline.processStarts+' modified_processes='+results.modified.processStarts+' baseline_median_ms='+results.baseline.medianFrameMs+' modified_median_ms='+results.modified.medianFrameMs+' viewport=800x600');
