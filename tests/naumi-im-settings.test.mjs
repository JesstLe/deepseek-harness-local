import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIMSettings,installIMSettingsUI} from '../plugins/naumi-enterprise/assets/im-settings.js';

const data=()=>({revision:1,connections:[],bindings:[],outbox:[],bots:[{id:'bot-a',name:'项目主管'}],groups:[{id:'room',name:'产品讨论'}]});
function renderer(initial){
 const state=initial.slice(),refs=[];let index=0,refIndex=0;
 const React={Fragment:'fragment',createElement(type,props,...children){props={...props,children:children.flat(Infinity)};return typeof type==='function'?type(props):{type,props,children:props.children};},useState(value){const i=index++;if(!(i in state))state[i]=value;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];},useEffect(){},useRef(value){const i=refIndex++;return refs[i]??=( {current:value} );}};
 const Component=createIMSettings(React);
 const render=()=>{index=0;refIndex=0;return Component();};
 return {render,state};
}
function all(root,match){const result=[];function walk(node){if(!node||typeof node!=='object')return;if(match(node))result.push(node);for(const c of node.children??[])walk(c);}walk(root);return result;}
const cls=(node,name)=>node.props?.className?.split(' ').includes(name);
const c={id:'connection',name:'飞书 · 项目协作',platform:'feishu',appId:'cli_fixture',domain:'feishu',configured:true,enabled:true,state:'ready'};

test('empty state is two entire actionable platform cards with vector marks and no duplicate header buttons',()=>{
 const root=renderer([data()]).render(),cards=all(root,n=>cls(n,'nim-provider'));
 assert.equal(cards.length,2);assert.deepEqual(cards.map(n=>n.props['aria-label']),['添加钉钉','添加飞书']);
 for(const card of cards){assert.equal(card.type,'button');assert.equal(card.props.type,'button');assert.equal(all(card,n=>n.type==='button').length,1);assert.equal(all(card,n=>n.type==='svg').length,2);assert.equal(card.props.disabled,false);}
 assert.equal(all(all(root,n=>cls(n,'nim-header'))[0],n=>n.type==='button').length,0);
});

test('connection state, native enable action, scoped edit/verify/pair and compact add picker remain real controls',()=>{
 const view=data();view.connections=[c];const r=renderer([view]);let root=r.render();
 assert.equal(all(root,n=>n.props?.role==='switch')[0].props['aria-checked'],true);assert.equal(all(root,n=>cls(n,'nim-status'))[0].props['data-state'],'ready');
 assert.equal(all(root,n=>cls(n,'nim-pair-button'))[0].props.disabled,false);
 all(root,n=>n.type==='button'&&n.children.includes('添加连接'))[0].props.onClick();root=r.render();assert.equal(all(root,n=>cls(n,'nim-providers-compact')).length,1);
 all(root,n=>n.props?.['aria-label']==='添加飞书')[0].props.onClick();root=r.render();assert.equal(all(root,n=>n.type==='form')[0].props['aria-label'],'配置连接');
 assert.equal(all(root,n=>n.type==='input'&&n.props.type==='password').length,1);
});

test('editing keeps saved secret out of DOM values and explicit reveal is local, reversible and reset on cancel',()=>{
 const view=data();view.connections=[c];const r=renderer([view,{...c}]);let root=r.render();
 const password=all(root,n=>n.type==='input'&&n.props.type==='password')[0];assert.equal(password.props.value,'');assert.equal(password.props.required,false);assert.equal(all(root,n=>n.type==='input'&&n.props.value===c.appId)[0].props.disabled,true);
 all(root,n=>n.props?.['aria-label']==='显示应用密钥')[0].props.onClick();root=r.render();assert.equal(all(root,n=>n.props?.['aria-label']==='隐藏应用密钥')[0].props['aria-pressed'],true);
 all(root,n=>n.props?.['aria-label']==='返回连接列表')[0].props.onClick();root=r.render();assert.equal(all(root,n=>cls(n,'nim-form')).length,0);assert.equal(r.state[2],'');
});

test('platform selection and pairing reuse the existing target selectors, code, expiry and close lifecycle',()=>{
 const view=data();view.connections=[c];const r=renderer([view,null,'',false,'',{connectionId:c.id,chatKind:'direct',targetId:'bot-a'},{code:'ABC',expires:Date.now()+60000}]);let root=r.render();
 assert.equal(all(root,n=>cls(n,'nim-steps')).length,1);assert.equal(all(root,n=>n.type==='select').length,2);for(const select of all(root,n=>n.type==='select'))assert.equal(all(root,n=>n.type==='label'&&n.props.htmlFor===select.props.id).length,1);assert.equal(all(root,n=>n.type==='code'&&n.children.includes('/pair ABC')).length,1);
 assert.equal(all(root,n=>n.props?.['aria-label']==='复制配对码').length,1);
 all(root,n=>n.type==='select'&&n.props.value==='direct')[0].props.onChange({target:{value:'group'}});root=r.render();assert.equal(all(root,n=>cls(n,'nim-code')).length,0);assert.equal(r.state[5].targetId,'');
 all(root,n=>n.props?.['aria-label']==='关闭配对')[0].props.onClick();assert.equal(all(r.render(),n=>cls(n,'nim-pair')).length,0);
});

test('member editor has an associated textarea and receipt reconciliation requires an explicit UI action',()=>{
 const view=data();view.connections=[c];view.bindings=[{id:'binding',connectionId:c.id,active:true,users:['u'],chat:{kind:'group',key:'chat',title:'产品群'},target:{kind:'group',id:'room'}}];view.outbox=[{id:'receipt',bindingId:'binding',state:'unknown'}];
 const r=renderer([view]);let root=r.render();const members=all(root,n=>n.type==='button'&&n.children.includes('成员 · 1'))[0];members.props.onClick();root=r.render();const textarea=all(root,n=>n.type==='textarea')[0];assert.equal(all(root,n=>n.type==='label'&&n.props.htmlFor===textarea.props.id).length,1);
 assert.equal(all(root,n=>cls(n,'nim-reconcile')).length,0);all(root,n=>n.type==='button'&&n.children.includes('核对'))[0].props.onClick();assert.equal(all(r.render(),n=>cls(n,'nim-reconcile')).length,1);
});

test('settings registration is unchanged; presentation remains scoped, light, responsive and reduced-motion aware',()=>{
 const calls=[];installIMSettingsUI({slots:{inject:(name,fn)=>{calls.push(name);return fn();},register:(options,component)=>{calls.push(options);assert.equal(typeof component,'function');}}},{createElement(){}});
 assert.equal(calls[0],'settings.section');assert.equal(calls[1].id,'im');assert.equal(calls[1].order,20);
 const css=readFileSync(new URL('../plugins/naumi-enterprise/assets/im-settings.css',import.meta.url),'utf8');assert.match(css,/color-scheme:light/);assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/@media\(max-width:420px\)/);assert.doesNotMatch(css,/(?:^|\n)(?:body|html|button|input)\s*[{,]/);assert.doesNotMatch(css,/border:[^;]*dashed/);
});
