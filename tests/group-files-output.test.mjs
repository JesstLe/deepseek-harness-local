import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {extendNativeSidebar,extendNativeDeliverables,installNativeDelivery,SIDEBAR_SHA,DELIVERABLES_SHA} from '../scripts/native-delivery-extension.mjs';
import {configureModelSpec,modelSpecView,refreshModelSpecs} from '../plugins/naumi-enterprise/model-specs.js';
import {transientDragNotice} from '../plugins/naumi-enterprise/assets/bot-sidebar-model.js';
const hash=s=>createHash('sha256').update(s).digest('hex');
for(const [name,expected,extend,kind]of [['sidebar-right',SIDEBAR_SHA,extendNativeSidebar,'sidebar'],['deliverables',DELIVERABLES_SHA,extendNativeDeliverables,'deliverables']]){
 test('pinned native '+name+' reuses upstream, installs atomically and rejects drift',()=>{
  const file='node_modules/@deepseek-ai/dsh-client-ui-'+name+'/lib/client.js',raw=fs.readFileSync(file,'utf8'),original=hash(raw)===expected?raw:fs.readFileSync(file+'.naumi-original','utf8');assert.equal(hash(original),expected);
  const changed=extend(original);parse(changed,{ecmaVersion:'latest',sourceType:'module'});assert.throws(()=>extend(original+' '),/UPSTREAM_CHANGED/);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'naumi-native-delivery-')),copy=path.join(dir,'client.js');try{
   fs.writeFileSync(copy,original);assert(installNativeDelivery(copy,kind).changed);assert.equal(fs.readFileSync(copy,'utf8'),changed);assert.equal(hash(fs.readFileSync(copy+'.naumi-original')),expected);assert(!installNativeDelivery(copy,kind).changed);
   fs.appendFileSync(copy,' ');assert.throws(()=>installNativeDelivery(copy,kind),/EXTENSION_CHANGED/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  if(kind==='deliverables'){assert.equal(changed.split('function PresentedFileCard(').length,2);assert.equal(changed.split('function Deliverables({').length,2);assert.match(changed,/props.renderFactorySlot\('naumi.native.deliverables',\{matched,openFile:props.openFile\}\)/);assert.match(changed,/\.\.\.nativeDeliverablesSpec,name:'naumi.native.deliverables'/);assert.match(changed,/previewPresented\(file\);else openFile\(file.path\)/);}
  else {assert.match(changed,/controller.registerPanelSession=registerPanelSession/);assert.match(changed,/unsubscribePanel\(\);unsubscribeLeases\(\)/);assert.match(changed,/views.select\(panelId === null \? current.getSnapshot\(\).key : panelSessions/);}
 });
}
test('unknown official output is not an old 16K budget hard cap',()=>{
 const old={id:'k3',contextWindow:1000000,maxTokens:16384};const n=configureModelSpec({id:'k3',contextWindow:1000000,maxTokens:128000},old);assert.equal(n.maxTokens,128000);assert.equal(modelSpecView(old).outputLimit,null);assert.throws(()=>configureModelSpec({id:'k3',contextWindow:1000000,maxTokens:1000000},old),/MODEL_OUTPUT_RANGE/);
});
test('explicit official output 384K and 128K survive; no save silently truncates',()=>{
 for(const [id,contextWindow,maxTokens]of [['deepseek-flash',1000000,384000],['gpt-6.1-sol',1050000,128000],['glm-5.3',1000000,128000]]){
  assert.equal(configureModelSpec({id,contextWindow,maxTokens},{id,contextWindow,maxTokens:16384}).maxTokens,maxTokens);
  assert.throws(()=>configureModelSpec({id,contextWindow,maxTokens:maxTokens+1}),/MODEL_OUTPUT_RANGE/);
 }
});
test('unverified alias can explicitly set output within existing context without guessing official spec',()=>{
 const old={id:'private-alias',contextWindow:400000,maxTokens:16384};assert.equal(configureModelSpec({id:old.id,contextWindow:400000,maxTokens:128000},old).maxTokens,128000);assert.throws(()=>configureModelSpec({id:old.id,maxTokens:400000},old),/MODEL_TOKEN_BUDGET/);assert.throws(()=>configureModelSpec({id:old.id,contextWindow:500000},old),/MODEL_SPEC_UNVERIFIED/);
});
test('global calibration keeps the users output reservation',()=>{
 const p={x:{defaultMaxTokens:16384,models:[{id:'glm-5.3'},{id:'deepseek-flash'}]}};assert.deepEqual(refreshModelSpecs(p).providers.x.models.map(m=>m.maxTokens),[16384,16384]);
});
test('success expires at 3s, repeated successes restart, guidance and unmount cancel timers',()=>{
 let now=0,next=0,value='',timers=new Map();const advance=ms=>{now+=ms;for(const[id,t]of [...timers])if(t.at<=now){timers.delete(id);t.fn();}};
 const n=transientDragNotice(v=>value=v,{schedule:(fn,ms)=>{timers.set(++next,{fn,at:now+ms});return next;},cancel:id=>timers.delete(id)});
 n.set('成员已加入群聊');advance(2999);assert.equal(value,'成员已加入群聊');n.set('成员已加入群聊');advance(1);assert.equal(value,'成员已加入群聊');advance(2999);assert.equal(value,'');
 n.set('群聊已创建');n.set('拖动 2 位 Bot');advance(4000);assert.equal(value,'拖动 2 位 Bot');n.set('顺序已保存');n.dispose();assert.equal(timers.size,0);
});
