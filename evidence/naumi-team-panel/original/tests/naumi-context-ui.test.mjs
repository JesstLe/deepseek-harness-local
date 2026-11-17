import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('plugins/naumi-enterprise/client.js','utf8');
const original=fs.readFileSync('evidence/naumi-context-ui/original/client.js','utf8');
const css=fs.readFileSync('plugins/naumi-enterprise/assets/style.css','utf8');
const box={window:{__ModuleLoader__:{load(){}}}};
vm.runInNewContext(source+'\nglobalThis.helpers={naumiMonitorReadings,naumiPortalOptions};',box);
const {naumiMonitorReadings:read,naumiPortalOptions:options}=box.helpers;
const plain=x=>JSON.parse(JSON.stringify(x));
test('monitor keeps unknown values unknown, rather than sample data',()=>{
 assert.deepEqual(plain(read()),{speed:null,total:null,cache:null,context:null});
 assert.deepEqual(plain(read({}, {},{})),{speed:null,total:null,cache:null,context:null});
});
test('monitor uses the original disjoint token buckets, not context size',()=>{
 const result=read({decodeTokens:1980,decodeMs:10000},{uncachedInputTokens:30,cacheReadTokens:960,cacheWriteTokens:10,outputTokens:300},{projectedTokens:6000,contextWindow:100000});
 assert.deepEqual(plain(result),{speed:198,total:1300,cache:96,context:6});
});
test('zero activity is not divided by zero; a genuine zero token total is preserved',()=>{
 const result=read({decodeTokens:0,decodeMs:0},{uncachedInputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,outputTokens:0},{pressureTokens:0,contextWindow:100});
 assert.deepEqual(plain(result),{speed:null,total:0,cache:null,context:0});
});
test('invalid, negative and nonfinite numbers do not become confident readings',()=>{
 const result=read({decodeTokens:Infinity,decodeMs:2},{uncachedInputTokens:-1,cacheReadTokens:NaN,cacheWriteTokens:0,outputTokens:4},{projectedTokens:NaN,contextWindow:0});
 assert.deepEqual(plain(result),{speed:null,total:null,cache:null,context:null});
});
test('projected context takes precedence over pressure and caps only its displayed percentage',()=>{
 assert.equal(read(null,null,{projectedTokens:20,pressureTokens:90,contextWindow:100}).context,20);
 assert.equal(read(null,null,{pressureTokens:110,contextWindow:100}).context,100);
});
test('display calculation never mutates source projections',()=>{
 const a=Object.freeze({decodeTokens:2,decodeMs:100}),b=Object.freeze({uncachedInputTokens:1,cacheReadTokens:2,cacheWriteTokens:3,outputTokens:4}),c=Object.freeze({pressureTokens:1,contextWindow:9});
 read(a,b,c);assert.equal(b.outputTokens,4);assert.equal(c.pressureTokens,1);
});
test('native leaf relocation preserves exact injected actions, store, locale and ID',()=>{
 const inject=()=>({open(){}}),store={id:'original-store'};
 const entry={options:{id:'activity',order:0},inject,store,locale:'chat'};
 const r=options(entry,'conversation.composer.dock');
 assert.equal(r.inject,inject);assert.equal(r.store,store);assert.equal(r.locale,'chat');assert.equal(r.id,'activity');assert.equal(r.priority,-1000);
 assert.equal(entry.options.priority,undefined);
});
test('parent/child slot owners cannot accidentally be relocated as leaves',()=>{
 assert.throws(()=>options({options:{},children:{child:{}}},'parent'),/Only leaf/);
});
test('all preexisting enterprise front-end code is byte-equivalent apart from one UI install call',()=>{
 const start=source.indexOf('window.__ModuleLoader__.load');
 const restored=source.slice(start).split('\n').filter(line=>!line.includes("void import('/naumi/assets/browser-client.js')")).join('\n').replace("    installNaumiContextUI(ctx,React,require('react-dom').createPortal,Icon);\n",'');
 assert.equal(restored.replaceAll('\r\n','\n'),original.replaceAll('\r\n','\n'));
});
test('new UI layer has no new network, credential, model, permission or persistence writes',()=>{
 const added=source.slice(0,source.indexOf('window.__ModuleLoader__.load'));
 for(const forbidden of [/\bfetch\s*\(/,/\bXMLHttpRequest\b/,/localStorage\./,/sessionStorage\./,/credentials\//,/settings\/replace/,/setModel\(/,/setPermission\(/,/innerHTML\s*=/,/appendChild\(/])assert(!forbidden.test(added),String(forbidden));
 assert(added.includes('native.openTeammate(sessionId,member.id)'));
 assert(added.includes("openTab('files')"));
});
test('original sidebar and model slots are not replaced or restyled by context layer',()=>{
 const added=source.slice(0,source.indexOf('window.__ModuleLoader__.load'));
 assert(!added.includes("name:'sidebar'"));assert(!added.includes('conversation.input.model'));
 const newCss=css.slice(css.indexOf('/* UI-only context composition'));
 assert(!newCss.includes('[data-slot="sidebar"]'));assert(!newCss.includes('conversation.input.model'));
});
test('session lifecycle cleans observers, presentation markers, and reserved width',()=>{
 for(const fragment of ['resize.disconnect()','observer.disconnect()','delete root.dataset.naumiContextRoot',"removeProperty('--naumi-context-reserve')",'if(!Object.values(record).some(Boolean))docks.delete(id)'])assert(source.includes(fragment));
 assert(css.includes('.naumi-context-panel[hidden]{display:none!important}'));
});
