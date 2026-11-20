import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createBusinessTools} from '../plugins/naumi-enterprise/business.js';
const client=fs.readFileSync('plugins/naumi-enterprise/client.js','utf8'),host=fs.readFileSync('plugins/naumi-enterprise/host.js','utf8');
test('native business tools have no frontend entry, asset registration or global stylesheet',()=>{
 for(const token of ['business-context-client.js','NativeSystems','installBusinessContextUI'])assert(!client.includes(token),token);
 for(const token of ['business-context-client.js','business-context.css'])assert(!host.includes(token),token);
 for(const file of ['business-context-client.js','business-context.css'])assert(!fs.existsSync('plugins/naumi-enterprise/assets/'+file),file);
 assert(host.includes('installBusiness(ctx,'));assert(!client.includes('/naumi/systems'));
});
test('original login, system pages, draft handoff and native input entry remain intact',()=>{
 for(const token of ['工作空间连接','企业协作','设计中心','连接设置','h(IdentityAccount)','放入会话草稿','openAI(prompt)','createBotGroupsPage'])assert(client.includes(token),token);
 assert(client.includes("['naumi-connections','系统连接','link']"));assert(client.includes("['naumi-projects','项目与需求','layers']"));
});
test('all six tools remain directly discoverable without a UI registration or selected panel',()=>{
 const names=createBusinessTools({},agent=>agent).map(t=>t.name);assert.deepEqual(names,['naumi_systems','naumi_business_read','naumi_business_context','naumi_business_command','naumi_business_operation','naumi_business_upload']);
 const prompt=fs.readFileSync('plugins/naumi-enterprise/business.js','utf8');assert(prompt.includes('first call naumi_systems'));assert(prompt.includes('no visual entry or manually selected UI context is required'));assert(prompt.includes('ask the user to disambiguate in chat'));
});
