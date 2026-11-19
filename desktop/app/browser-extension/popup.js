const $=id=>document.getElementById(id);
async function status(){const s=await chrome.runtime.sendMessage({action:'status'});$('status').textContent=s.connected?`已连接 ${s.tabs} 个标签页`:'未连接';}
for(const action of ['connect','disconnect'])$(action).onclick=async()=>{
 $('connect').disabled=$('disconnect').disabled=true;
 try{const response=await chrome.runtime.sendMessage({action,pair:$('pair').value.trim()});$('pair').value='';if(!response.ok)throw Error(response.error);await status();}catch(error){$('status').textContent=error.message;}finally{$('connect').disabled=$('disconnect').disabled=false;}
};void status();
