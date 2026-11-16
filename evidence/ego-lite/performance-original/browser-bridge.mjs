/** Executed inside ego-lite's embedded Node runtime; no external browser or CDP port. */
export async function run(input){
  try{
    const task=await globalThis.taskSpace(input.name);
    const page=task.page(input.label??'p1');
    if(input.action==='finish'){await task.finish({keep:[]});console.log('NAUMI_BROWSER_RESULT='+JSON.stringify({ok:true,data:{closed:true}}));return;}
    // CLI rounds use distinct CDP sessions; emulation resets on detach, so reapply it each round.
    if(input.width&&input.height)await page.cdp('Emulation.setDeviceMetricsOverride',{width:input.width,height:input.height,screenWidth:input.width,screenHeight:input.height,deviceScaleFactor:1,mobile:false});
    switch(input.action){
      case 'navigate': await page.goto(input.url,{timeout:25000});break;
      case 'reload': await page.reload({timeout:25000});break;
      case 'back': case 'forward': {
        const h=await page.cdp('Page.getNavigationHistory');const entry=h.entries[h.currentIndex+(input.action==='back'?-1:1)];
        if(entry)await page.cdp('Page.navigateToHistoryEntry',{entryId:entry.id});break;
      }
      case 'resize': break;
      case 'click': if(input.selector)await page.click(input.selector);else await page.mouse.click(input.x,input.y,{label:'Naumi browser user click'});break;
      case 'fill': await page.fill(input.selector,input.text);break;
      case 'press': await page.keyboard.press(input.key);break;
      case 'text': await page.keyboard.insertText(input.text??'');break;
      case 'wheel': await page.cdp('Input.dispatchMouseEvent',{type:'mouseWheel',x:Math.max(0,input.x??20),y:Math.max(0,input.y??20),deltaX:Math.max(-3000,Math.min(3000,input.deltaX??0)),deltaY:Math.max(-3000,Math.min(3000,input.deltaY??0))});break;
      case 'dialog': if(input.text==='accept')await page.acceptDialog();else await page.dismissDialog();break;
    }
    const info=await page.info();
    const history=await page.cdp('Page.getNavigationHistory').catch(()=>({entries:[],currentIndex:0}));
    const data={spaceId:task.spaceId,label:page.label,url:info.url,title:info.title,width:info.w,height:info.h,canGoBack:history.currentIndex>0,canGoForward:history.currentIndex<history.entries.length-1};
    if(input.action==='snapshot')data.snapshot=await page.snapshot();
    if(input.action==='tabs')data.tabs=(await task.tabs()).map(t=>({label:t.label??null,title:t.title,url:t.url,active:t.active,openedBy:t.openedBy}));
    if(input.frame){const frame=await page.cdp('Page.captureScreenshot',{format:'jpeg',quality:78,fromSurface:true,captureBeyondViewport:false,clip:{x:0,y:0,width:info.w,height:info.h,scale:1}});data.image=frame.data;}
    console.log('NAUMI_BROWSER_RESULT='+JSON.stringify({ok:true,data}));
  }catch(error){console.log('NAUMI_BROWSER_RESULT='+JSON.stringify({ok:false,error:typeof error?.code==='string'?error.code:'EGO_OPERATION_FAILED',message:String(error?.message??error).slice(0,200)}));}
}
