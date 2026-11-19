const $=id=>document.getElementById(id),api=window.browserManager;
async function request(input){const response=await api.request(input);if(!response.ok)throw Error(response.error);return response.data;}
async function refresh(){
 const state=await request({action:'status'});$('tabs').replaceChildren();$('accounts').replaceChildren();
 for(const tab of state.tabs){const row=document.createElement('div'),text=document.createElement('span'),small=document.createElement('small');text.textContent=tab.title||'已连接的标签页';small.textContent=tab.connected?tab.url:'连接已中断';text.append(small);row.append(text);$('tabs').append(row);}
 for(const account of state.accounts){const row=document.createElement('div'),text=document.createElement('span'),small=document.createElement('small'),remove=document.createElement('button');text.textContent=account.username;small.textContent=account.origin+(account.allowAgent?' · 已允许填入':'');text.append(small);remove.textContent='删除';remove.className='quiet';remove.onclick=()=>run(async()=>{await request({action:'remove',id:account.id});await refresh();});row.append(text,remove);$('accounts').append(row);}
 $('account').hidden=!state.vaultAvailable;if(!state.vaultAvailable)$('status').textContent='系统加密存储暂不可用，浏览器连接仍可使用。';
}
async function run(work){try{await work();}catch(error){$('status').textContent=error.message;}}
$('refresh').onclick=()=>run(refresh);
$('extension').onclick=()=>run(async()=>{await request({action:'extension'});$('status').textContent='已打开扩展文件夹。';});
$('pair').onclick=()=>run(async()=>{await request({action:'pair'});$('status').textContent='连接码已复制，五分钟内在浏览器扩展中粘贴。';});
$('disconnect').onclick=()=>run(async()=>{await request({action:'disconnect'});await refresh();$('status').textContent='已断开，原浏览器标签页和登录态保留。';});
$('account').onsubmit=event=>{event.preventDefault();void run(async()=>{const form=event.currentTarget,values=new FormData(form),password=form.elements.password.value;await request({action:'save',origin:values.get('origin'),username:values.get('username'),password,allowAgent:form.elements.allowAgent.checked});form.reset();await refresh();$('status').textContent='已加密保存。';});};
void run(refresh);
