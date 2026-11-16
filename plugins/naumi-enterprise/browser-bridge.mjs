/** Executed inside ego-lite's embedded Node runtime; no external browser or CDP port. */
export async function operate(input,cache=new Map()){
  try{
    let entry=cache.get(input.name);
    if(!entry){entry={task:await globalThis.taskSpace(input.name),sizes:new Map()};cache.set(input.name,entry);}
    const task=entry.task;
    const page=task.page(input.label??'p1');
    if(input.action==='finish'){await task.finish({keep:[]});cache.delete(input.name);return {ok:true,data:{closed:true}};}
    const sizeKey=`${input.width}x${input.height}`;
    const resize=async()=>{await page.cdp('Emulation.setDeviceMetricsOverride',{width:input.width,height:input.height,screenWidth:input.width,screenHeight:input.height,deviceScaleFactor:1,mobile:false});entry.sizes.set(page.label,sizeKey);};
    if(input.width&&input.height&&entry.sizes.get(page.label)!==sizeKey)await resize();
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
    let info=await page.info();
    if(input.width&&input.height&&(info.w!==input.width||info.h!==input.height)){await resize();info=await page.info();}
    const history=await page.cdp('Page.getNavigationHistory').catch(()=>({entries:[],currentIndex:0}));
    const data={spaceId:task.spaceId,label:page.label,url:info.url,title:info.title,width:info.w,height:info.h,canGoBack:history.currentIndex>0,canGoForward:history.currentIndex<history.entries.length-1};
    if(input.action==='snapshot')data.snapshot=await page.snapshot();
    if(input.action==='tabs')data.tabs=(await task.tabs()).map(t=>({label:t.label??null,title:t.title,url:t.url,active:t.active,openedBy:t.openedBy}));
    if(input.frame){const scale=Math.min(1,1440/info.w,1000/info.h);const frame=await page.cdp('Page.captureScreenshot',{format:'jpeg',quality:68,fromSurface:true,captureBeyondViewport:false,clip:{x:info.sx??0,y:info.sy??0,width:info.w,height:info.h,scale}});data.image=frame.data;}
    return {ok:true,data};
  }catch(error){return {ok:false,error:typeof error?.code==='string'?error.code:'EGO_OPERATION_FAILED'};}
}

export async function run(input){console.log('NAUMI_BROWSER_RESULT='+JSON.stringify(await operate(input)));}

/** Persistent embedded SDK/CDP connection. Private loopback transport, never exposed to web content. */
export async function serve({readyPath,token,ownerPid}){
  const {createServer}=await import('node:http'),{writeFile}=await import('node:fs/promises'),{timingSafeEqual}=await import('node:crypto');
  const cache=new Map(),queues=new Map();let closeWorker,closing=false;
  const closed=new Promise(resolve=>{closeWorker=resolve;});
  const server=createServer(async(req,res)=>{
    const auth=Buffer.from(req.headers.authorization??''),expected=Buffer.from('Bearer '+token);
    if(req.headers.origin||auth.length!==expected.length||!timingSafeEqual(auth,expected)){res.writeHead(403).end();return;}
    if(req.method!=='POST'){res.writeHead(405).end();return;}
    if(req.url==='/shutdown'){res.writeHead(200).end('{}');closing=true;setTimeout(async()=>{await Promise.allSettled(queues.values());server.closeAllConnections();server.close(closeWorker);},25);return;}
    if(closing){res.writeHead(503).end();return;}
    if(req.url!=='/op'){res.writeHead(404).end();return;}
    let input;try{let body='',size=0;for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return;}body+=chunk;}input=JSON.parse(body);}catch{res.writeHead(400).end();return;}
    if(!/^Naumi-[a-f0-9]{20}$/.test(input.name??'')){res.writeHead(400).end();return;}
    const prior=queues.get(input.name)??Promise.resolve(),job=prior.catch(()=>{}).then(()=>operate(input,cache));queues.set(input.name,job);
    try{const result=await job;if(!res.destroyed){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}}
    finally{if(queues.get(input.name)===job)queues.delete(input.name);}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  await writeFile(readyPath,JSON.stringify({port:server.address().port}));
  const lease=setInterval(()=>{try{process.kill(ownerPid,0);}catch(error){if(error.code==='ESRCH'){closing=true;server.closeAllConnections();server.close(closeWorker);}}},2000);
  try{await closed;}finally{clearInterval(lease);}
}
