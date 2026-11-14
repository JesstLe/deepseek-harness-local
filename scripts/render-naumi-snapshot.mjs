import fs from 'node:fs';
const snapshot=JSON.parse(fs.readFileSync('.dsh/naumi-ui-backup/dom-snapshot.json','utf8'));
if(snapshot.fixture)throw Error('Do not export fixture data as live UI');
let css='';let blocks=0;
for(const pkg of ['dsh-client-ui-layout','dsh-client-ui-sidebar','dsh-client-ui-workspace','dsh-client-ui-theme']){
  const source=fs.readFileSync('node_modules/@deepseek-ai/'+pkg+'/lib/client.js','utf8');
  for(const match of source.matchAll(/const css(?:\$\d+)?\s*=\s*("(?:[^"\\]|\\.)*");/g)){
    css+=JSON.parse(match[1])+'\n';blocks++;
  }
}
css+=fs.readFileSync('plugins/naumi-enterprise/assets/style.css','utf8');
// Exported snapshots have a fixed canvas; live viewport units must not resize the conversation frame.
css=css.replace(/(\d+(?:\.\d+)?)(?:dvh|svh|lvh|vh)\b/g,(_,n)=>`${Number(n)*9}px`);
const asset=which=>'data:image/svg+xml;base64,'+fs.readFileSync('plugins/naumi-enterprise/assets/'+which+'.svg').toString('base64');
const clean=html=>html.replaceAll('/naumi/assets/symbol.svg',asset('symbol')).replaceAll('/naumi/assets/wordmark.svg',asset('wordmark'));
const html=`<!doctype html><html lang="zh-CN" data-platform="win32"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}
html,body,body[data-naumi]{margin:0;padding:0;background:transparent!important;height:auto!important;font-family:"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}.naumi-snapshot{height:900px;display:grid;grid-template-columns:260px minmax(0,1fr);overflow:hidden;background:#f7f9fc;border-radius:12px}.naumi-snapshot>[data-slot="sidebar"]{background:#f8fafc;border-right:1px solid #e7ecf3;height:900px}.naumi-snapshot>[data-slot="sidebar"]>div{height:900px;width:260px!important}.naumi-page{height:900px}.naumi-snapshot [data-slot="sidebar"] button{font-family:inherit}.naumi-snapshot [data-slot="sidebar"] [class*="_logoRow"]{height:70px}@media(max-width:700px){.naumi-snapshot{grid-template-columns:0 minmax(0,1fr)}.naumi-snapshot>[data-slot="sidebar"]{visibility:hidden;width:0}.naumi-page{padding:22px 15px}}</style></head><body data-naumi="enterprise"><div><section class="naumi-snapshot">${clean(snapshot.sidebar)}${clean(snapshot.main)}</section></div></body></html>`;
fs.writeFileSync('evidence/naumi-ui/current-ui.html',html);
console.log('DOM_RENDER actual_page=1 fixture=0 css_blocks='+blocks);
