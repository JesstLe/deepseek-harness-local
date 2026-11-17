import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const upstream=fs.readFileSync('node_modules/@deepseek-ai/dsh-client-ui-sidebar-browser/lib/client.js','utf8');
const built=fs.readFileSync('plugins/naumi-sidebar-browser/client.js','utf8');
const oldOwner='@deepseek-ai/dsh-client-ui-sidebar-browser',owner='@naumi/dsh-sidebar-browser';
const injection=source=>source.slice(source.indexOf('const css ='),source.indexOf('var Browser_module_css_default'));
function styleDocument(){
 const tags=[];
 const document={head:{appendChild:el=>tags.push(el)},createElement:()=>({dataset:{},textContent:'',remove(){tags.splice(tags.indexOf(this),1);}}),querySelector:selector=>tags.find(t=>t.dataset.pluginCss===JSON.parse(selector.slice('style[data-plugin-css='.length,-1)))??null};
 return {tags,document,load:source=>vm.runInNewContext(injection(source),{document}),dispose:id=>{for(const tag of [...tags])if(tag.dataset.plugin===id)tag.remove();}};
}
test('browser factory claims its own CSS owner and style identity',()=>{
 const d=styleDocument();d.load(built);assert.equal(d.tags.length,1);assert.equal(d.tags[0].dataset.plugin,owner);assert.equal(d.tags[0].dataset.pluginCss,owner+'/Browser.module.css');
});
test('unloading the upstream browser preserves Naumi styles, including preloaded upstream CSS',()=>{
 const d=styleDocument();d.load(upstream);d.load(built);assert.equal(d.tags.length,2);d.dispose(oldOwner);assert.equal(d.tags.length,1);assert.equal(d.tags[0].dataset.plugin,owner);
});
test('own style teardown and repeated materialization do not leak or disappear',()=>{
 const d=styleDocument();for(let i=0;i<5;i++){d.load(built);d.load(built);assert.equal(d.tags.length,1);d.dispose(owner);assert.equal(d.tags.length,0);}d.load(built);assert.equal(d.tags.length,1);
});
test('CSS content and browser logic remain upstream-identical apart from four product bindings',()=>{
 const restored=built.replace('id: "'+owner+'"','id: "'+oldOwner+'"').replace('const carrier = globalThis.naumiDesktop;','const carrier = globalThis.dshDesktop;').replace('const tagId = "'+owner+'/Browser.module.css";','const tagId = "'+oldOwner+'/Browser.module.css";').replace('tag.dataset.plugin = "'+owner+'";','tag.dataset.plugin = "'+oldOwner+'";');assert.equal(restored,upstream);
 const a=styleDocument(),b=styleDocument();a.load(upstream);b.load(built);assert.equal(a.tags[0].textContent,b.tags[0].textContent);
});
