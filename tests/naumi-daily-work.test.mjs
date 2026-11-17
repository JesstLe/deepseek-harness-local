import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createEmployeeCenter} from '../plugins/naumi-enterprise/assets/employee-center.js';
import {EXPERIENCE_ACTIONS} from '../plugins/naumi-enterprise/assets/employee-experience-model.js';

function hookHost(){
 const slots=[],effects=[];let cursor=0;
 const React={createElement:(type,props,...children)=>({type,props:props??{},children}),Fragment:'Fragment',useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(initial){const i=cursor++;return slots[i]??(slots[i]={current:initial});},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((v,n)=>v!==old[n]))effects.push(fn);slots[i]=deps;}};
 return {React,render(Component){cursor=0;return Component();},async flush(){for(const fn of effects.splice(0))fn();await new Promise(r=>setImmediate(r));}};
}
function nodes(root){return root&&typeof root==='object'?[root,...(root.children??[]).flat(Infinity).flatMap(nodes)]:[];}

test('daily work reuses the existing Center and queries only local work for the chosen Bot',async()=>{
 const host=hookHost(),calls=[],bot={id:'bot-daily',name:'日常员工',status:'active',purpose:'岗位',kind:'agent'};
 const client={catalog:async()=>({bots:[bot,{...bot,id:'bot-other',name:'其他员工'}]}),work:async id=>{calls.push(id);return {goals:[],deliveries:[]};},employee(){assert.fail('daily work must not query profiles, heartbeat or history');}};
 const Component=createEmployeeCenter(host.React,{client,workOnly:true,initialBotId:bot.id,onClose(){}});
 host.render(Component);await host.flush();const tree=host.render(Component),all=nodes(tree);
 assert.equal(tree.props['data-daily-work'],true);assert.equal(tree.props['data-employee-center'],undefined);assert.deepEqual(calls,[bot.id]);
 assert(!all.some(n=>n.type==='aside'||n.type==='nav'));assert(!all.some(n=>typeof n.type==='function'&&/Enterprise|Sync|Runtime|Model/.test(n.type.name)));
 assert(all.some(n=>n.type==='button'&&n.children.includes('创建目标')));assert(!JSON.stringify(tree).includes('其他员工'));
});

test('daily Bot selection never falls back to another account or arbitrary catalog employee',async()=>{
 const host=hookHost(),client={catalog:async()=>({bots:[{id:'bot-other',name:'其他账号员工',status:'active'}]}),work:async()=>({goals:[],deliveries:[]})};
 const Component=createEmployeeCenter(host.React,{client,workOnly:true,initialBotId:'bot-missing'});host.render(Component);await host.flush();const tree=host.render(Component);
 assert(!JSON.stringify(tree).includes('其他账号员工'));assert(!nodes(tree).some(n=>n.type==='button'&&n.children.includes('创建目标')));
});

test('daily work entry is explicit and legacy enterprise management remains guarded',()=>{
 assert(EXPERIENCE_ACTIONS.some(([id,label])=>id==='work'&&label==='工作与交付'));
 const source=fs.readFileSync('plugins/naumi-enterprise/assets/employee-experience.js','utf8');assert(source.includes('workOnly:true'));assert(source.includes("if(mode==='advanced'){if(!await advancedEmployeeAccess())"));assert(source.includes("event.target.closest('.emp-modal-backdrop')"));
});
