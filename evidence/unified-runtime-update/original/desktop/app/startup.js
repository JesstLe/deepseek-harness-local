const error=new URLSearchParams(location.search).get('error');
if(error){document.querySelector('#spinner').hidden=true;document.querySelector('#error').textContent=error;document.querySelector('#retry').hidden=false;}
if(error)window.naumiDesktop.connectionState().then(state=>{document.querySelector('#settings').hidden=!state.available;}).catch(()=>{});
document.querySelector('#settings').addEventListener('click',()=>window.naumiDesktop.connectionSettings());
document.querySelector('#retry').addEventListener('click',()=>{document.querySelector('#retry').hidden=true;document.querySelector('#error').textContent='';document.querySelector('#spinner').hidden=false;window.naumiDesktop.retry();});
