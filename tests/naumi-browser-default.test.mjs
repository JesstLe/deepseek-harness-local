import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('plugins/naumi-sidebar-browser/client.js','utf8');
const expression=source.match(/const initialUrl = \(0, react.useRef\)\(([^\n]+)\);/)[1];
const currentTarget=source.match(/function currentBrowserTarget\(state\) \{[\s\S]*?\n\s*\}/)[0];
const initialUrl=(url,state)=>vm.runInNewContext(currentTarget+';'+expression,{tab:{navigation:{params:url===undefined?undefined:{url}}},initial:{current:state}});
test('new browser tabs open Baidu, including empty persisted navigation',()=>{
 assert.equal(initialUrl(undefined,undefined),'https://baidu.com');
 assert.equal(initialUrl(undefined,{index:-1,entries:[]}),'https://baidu.com');
});
test('explicit browser URLs and blank requests take precedence over the homepage',()=>{
 for(const url of ['https://example.com/task','about:blank',''])assert.equal(initialUrl(url,undefined),url);
});
test('saved pages retain explicit restore and are not redirected to Baidu',()=>{
 const saved={index:0,entries:[{url:'https://example.com/saved'}]};
 assert.equal(initialUrl(undefined,saved),undefined);
 assert.equal(initialUrl('https://example.com/task',saved),'https://example.com/task');
});
