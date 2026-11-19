import assert from 'node:assert/strict';
/** Exercise the shipped native picker, never substitute its DOM or model RPC. */
export async function verifyTrialPicker(page,{workspace,capture,expectedNames}){
 const primary=await page.evaluate(async cwd=>{
  const rpc=async(method,args)=>{const r=await fetch('/api/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'trial-picker',method,payload:{args}})});const v=(await r.json()).result;if(!v?.ok)throw Error('PICKER_RPC_'+method);return v.value;};
  const catalog=await(await fetch('/naumi/bots')).json();let bot=catalog.bots.find(b=>b.id===catalog.primaryBotId);
  if(!bot){const w=await rpc('workspace/create',{request:{path:cwd}}),r=await fetch('/naumi/bots',{method:'POST',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify({action:'create-primary',requestId:crypto.randomUUID(),expectedRevision:catalog.revision,name:'内测验收',workspaceId:w.workspace.workspaceId})});bot=await r.json();if(!r.ok)throw Error('PICKER_CREATE_PRIMARY');}
  return{name:bot.name,sessionId:bot.homeSessionId};
 },workspace);
 await page.evaluate(()=>localStorage.setItem('naumi.navigationMode.v1','bot'));await page.reload();await page.getByRole('button',{name:new RegExp('^'+primary.name+'，')}).click();
 const picker=page.getByRole('button',{name:/选择模型，当前/}).first();await picker.waitFor();
 const open=async()=>{await picker.click();const option=page.getByRole('menuitemradio',{name:'claude fable5.2',exact:true});if(!await option.isVisible())await page.getByRole('menuitem',{name:/^模型/}).first().click();await option.waitFor();return page.getByRole('menu',{name:'模型',exact:true});};
 let menu=await open();assert.equal(await menu.getByText('openai',{exact:true}).count(),1);assert.equal(await menu.getByText('claude',{exact:true}).count(),1);const text=await menu.innerText();assert(!/CC\s*[·.]|Messages|Responses/.test(text));const names=await menu.getByRole('menuitemradio').allTextContents();assert.deepEqual(names.map(n=>n.trim()).sort(),[...expectedNames].sort());assert.equal(new Set(names).size,names.length);if(capture)await menu.screenshot({path:capture});
 const firstGPT=expectedNames.find(n=>n!=='claude fable5.2');await menu.getByRole('menuitemradio',{name:firstGPT,exact:true}).click();await page.waitForFunction(name=>[...document.querySelectorAll('button')].some(b=>b.getAttribute('aria-label')?.includes('选择模型，当前 '+name)),firstGPT);
 menu=await open();assert.equal(await menu.getByRole('menuitemradio',{name:firstGPT,exact:true}).getAttribute('aria-checked'),'true');await menu.getByRole('menuitemradio',{name:'claude fable5.2',exact:true}).click();await page.reload();await page.getByRole('button',{name:new RegExp('^'+primary.name+'，')}).click();await picker.waitFor();assert((await picker.getAttribute('aria-label')).includes('claude fable5.2'));menu=await open();assert.equal(await menu.getByRole('menuitemradio',{name:'claude fable5.2',exact:true}).getAttribute('aria-checked'),'true');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
 return{groups:['openai','claude'],names,sessionId:primary.sessionId,switchAndReload:true};
}
