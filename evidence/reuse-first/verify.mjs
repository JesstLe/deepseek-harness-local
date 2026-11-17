import fs from 'node:fs';
const file=process.argv[2],s=fs.readFileSync(file,'utf8');
const checks=['## 复用优先与界面一致性','能复用就复用','原生组件及其草稿','不以复制 HTML/CSS','不另写一套基础输入器','停止当前聊天不误取消独立后台任务'];
const missing=checks.filter(v=>!s.includes(v));
if(missing.length){console.log('REUSE_POLICY_ABSENT missing='+missing.length);process.exit(1);}
if(!fs.existsSync('docs/AGENT_COLLABORATION.md'))throw Error('BROKEN_COLLABORATION_LINK');
console.log('REUSE_POLICY_PASS checks=6 collaboration_link=PASS');
