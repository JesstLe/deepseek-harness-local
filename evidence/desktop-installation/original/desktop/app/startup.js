const error=new URLSearchParams(location.search).get('error');
if(error){document.querySelector('#spinner').hidden=true;document.querySelector('#error').textContent=error;document.querySelector('#retry').hidden=false;}
document.querySelector('#retry').addEventListener('click',()=>{document.querySelector('#retry').hidden=true;document.querySelector('#error').textContent='';document.querySelector('#spinner').hidden=false;window.naumiDesktop.retry();});
