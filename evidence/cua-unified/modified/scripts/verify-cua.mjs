import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {CuaRuntime,DesktopLease} from '../plugins/naumi-enterprise/cua-runtime.js';
import {resolveDesktopRuntime} from '../plugins/naumi-enterprise/desktop-runtime.js';
const dir=path.resolve('evidence/cua-unified'),phase=process.argv[2]??'full';fs.mkdirSync(dir,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms)),log=path.join(dir,'NATIVE_EVENTS.txt'),fixtureFile=path.join(dir,'NATIVE_FIXTURE.json');
const runtime=new CuaRuntime({lease:new DesktopLease({directory:path.join(dir,'native-lock')})});
const report={runtime:resolveDesktopRuntime().checks,phase};let child;
const save=(r,file)=>{const img=r.content.find(x=>x.type==='image');assert(img,'real native screenshot required');fs.writeFileSync(path.join(dir,file),Buffer.from(img.data,'base64'));};
try{
 let fixture;
 if(phase!=='act'){
  fs.writeFileSync(log,'');child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-STA','-WindowStyle','Hidden','-File',path.resolve('tests/fixtures/cua-window.ps1'),'-Log',log],{windowsHide:true,stdio:'ignore'});
  for(let n=0;n<100&&!fs.readFileSync(log,'utf8').includes('READY=');n++)await wait(100);
  assert(fs.readFileSync(log,'utf8').includes('READY='+child.pid),'fixture did not become ready');
  const windows=await runtime.perform('native-acceptance',{action:'list_windows',pid:child.pid});fs.writeFileSync(path.join(dir,'NATIVE_WINDOWS.json'),JSON.stringify(windows,null,2));
  const raw=windows.structuredContent??JSON.parse(windows.content.find(x=>x.type==='text').text);
  const records=Array.isArray(raw)?raw:raw.windows;const w=records.find(w=>w.title==='Naumi CUA Acceptance (isolated)'&&w.pid===child.pid);assert(w,'exact fixture window not found');
  fixture={pid:w.pid,window_id:w.window_id};fs.writeFileSync(fixtureFile,JSON.stringify(fixture));
 }else fixture=JSON.parse(fs.readFileSync(fixtureFile));
 let observation=await runtime.perform('native-acceptance',{action:'observe',...fixture});save(observation,'native-before.png');report.screenshot={width:observation.structuredContent.width,height:observation.structuredContent.height};
 if(phase==='observe'){child.unref();child=null;console.log('CUA_NATIVE_OBSERVE real_png=1 exact_fixture=1');}
 else{
  const perform=async args=>{const result=await runtime.perform('native-acceptance',{...args,observationId:observation.structuredContent.observationId});if(result.isError)throw Error(JSON.stringify(result));fs.appendFileSync(path.join(dir,'NATIVE_RECEIPTS.jsonl'),JSON.stringify({action:args.action,data:result.structuredContent})+'\n');observation=result;await wait(180);return result;};
  await perform({action:'click',x:105,y:155});
  await perform({action:'click',x:120,y:80});
  await perform({action:'type_text',text:'Naumi CUA native'});
  const hotkey=await runtime.perform('native-acceptance',{action:'hotkey',keys:['ctrl','a'],x:120,y:80,observationId:observation.structuredContent.observationId});
  if(hotkey.isError){assert.equal(hotkey.structuredContent.code,'background_unavailable');report.hotkeyBackground='background_unavailable';observation=await runtime.perform('native-acceptance',{action:'observe',...fixture});await perform({action:'hotkey',keys:['ctrl','a'],x:120,y:80,delivery_mode:'foreground'});}else observation=hotkey;
  save(observation,'native-selected.png');
  await perform({action:'type_text',text:'CUA verified',delivery_mode:'foreground'});
  await perform({action:'press_key',key:'end'});
  const scroll=await runtime.perform('native-acceptance',{action:'scroll',x:175,y:265,direction:'down',amount:4,observationId:observation.structuredContent.observationId});
  if(scroll.isError){assert.equal(scroll.structuredContent.code,'background_unavailable');report.scrollBackground='background_unavailable';observation=await runtime.perform('native-acceptance',{action:'observe',...fixture});await perform({action:'scroll',x:175,y:265,direction:'down',amount:4,delivery_mode:'foreground'});}else observation=scroll;
  await perform({action:'drag',from_x:405,from_y:245,to_x:555,to_y:350,duration_ms:400});
  save(observation,'native-after.png');
  await wait(300);const events=fs.readFileSync(log,'utf8');report.events={click:events.includes('CLICK=confirmed'),type:events.includes('TEXT=CUA verified'),hotkeyReplacement:events.includes('TEXT=CUA verified')&&!events.includes('TEXT=Naumi CUA nativeCUA verified'),scroll:/SCROLL=[1-9]/.test(events),drag:events.includes('DRAG=moved')&&events.includes('DRAG=up')};
  assert(Object.values(report.events).every(Boolean),JSON.stringify(report.events));
  await assert.rejects(runtime.perform('second-session',{action:'observe',...fixture}),/BUSY/);report.secondSession='CUA_DESKTOP_BUSY';
  await runtime.perform('native-acceptance',{action:'release'});report.released=!fs.existsSync(runtime.lease.file);
  await runtime.close();report.disposed=true;fs.writeFileSync(path.join(dir,'NATIVE_REPORT.json'),JSON.stringify(report,null,2));
  console.log('CUA_NATIVE click=1 type=1 hotkey_replace=1 key=1 scroll=1 drag=1 screenshot_before_after=1 second_session_busy=1 release=1 dispose=1');
  // Stop only this exact isolated fixture process, never an employee app.
  process.kill(fixture.pid);child=null;
 }
}finally{await runtime.close();child?.kill();}
