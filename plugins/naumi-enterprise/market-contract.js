import {createHash} from 'node:crypto';
export const MARKET_PROTOCOL=1,MAX_PACKAGE_BYTES=2*1024*1024;
export const fail=(code,status=400)=>{throw Object.assign(Error(code),{status});};
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export const text=(value,max=200,{empty=false}={})=>{if(typeof value!=='string'||value.length>max||(!empty&&!value.trim())||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(value))fail('MARKET_INVALID_TEXT');return value.trim();};
export function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))fail('MARKET_INVALID_REQUEST');return value;}
export function slug(value){if(typeof value!=='string'||!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)||value.length>64)fail('MARKET_INVALID_SLUG');return value;}
export function version(value){if(typeof value!=='string'||!/^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})$/.test(value))fail('MARKET_INVALID_VERSION');return value;}
export function uuid(value){if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))fail('MARKET_OPERATION_ID_REQUIRED');return value;}
export function filePath(value){if(typeof value!=='string'||value.length>240||!value||value.includes('\\')||value.startsWith('/')||value.split('/').some(p=>!p||p==='.'||p==='..'||/[<>:"|?*\x00-\x1f]/.test(p)||/[ .]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))fail('MARKET_INVALID_PATH');
 if(/(?:^|\/)(?:\.env(?:\.|$)|\.git|\.dsh|node_modules|\.credentials|credentials(?:\.|$)|cookies|id_rsa|id_ed25519)|\.(?:pem|pfx|key)$/i.test(value)||['package.json','cordis.patch.yml','market-host.js','.naumi-market.json'].includes(value))fail('MARKET_PRIVATE_OR_RESERVED_FILE');return value;}
export function fileBytes(file){return file.encoding==='base64'?Buffer.from(file.content,'base64'):Buffer.from(file.content,'utf8');}
export function validatePackage(input){
 exact(input,['schemaVersion','slug','title','summary','kind','version','description','changelog','capabilities','tags','entry','template','files']);if(input.schemaVersion!==1)fail('MARKET_PACKAGE_VERSION');
 const value={schemaVersion:1,slug:slug(input.slug),title:text(input.title,80),summary:text(input.summary,180),kind:input.kind,version:version(input.version),description:text(input.description??'',20000,{empty:true}),changelog:text(input.changelog??'',4000,{empty:true})};
 if(!['plugin','skill','workflow','bot-template'].includes(value.kind))fail('MARKET_INVALID_KIND');
 if(!Array.isArray(input.capabilities)||input.capabilities.length>8||input.capabilities.some(c=>!['files-read','files-write','network','browser','commands'].includes(c)))fail('MARKET_CAPABILITIES_REQUIRED');value.capabilities=[...new Set(input.capabilities)].sort();
 if(!Array.isArray(input.tags??[])||(input.tags??[]).length>5)fail('MARKET_INVALID_TAGS');value.tags=[...new Set((input.tags??[]).map(t=>text(t,20)))];
 if(!Array.isArray(input.files)||input.files.length>100)fail('MARKET_INVALID_FILES');const names=new Set();value.files=input.files.map(f=>{exact(f,['path','content','encoding']);const p=filePath(f.path);if(names.has(p.toLowerCase()))fail('MARKET_DUPLICATE_FILE');names.add(p.toLowerCase());if(typeof f.content!=='string'||f.content.length>MAX_PACKAGE_BYTES||!['utf8','base64'].includes(f.encoding??'utf8'))fail('MARKET_INVALID_FILE');
  const next={path:p,encoding:f.encoding??'utf8',content:f.content};if(next.encoding==='base64'&&(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(next.content)))fail('MARKET_INVALID_ENCODING');
  if((/-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----|\b(?:sk-[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16})\b/.test(fileBytes(next).toString('utf8'))))fail('MARKET_SECRET_IN_PACKAGE');return next;}).sort((a,b)=>a.path.localeCompare(b.path,'en'));
 for(const name of names){const parts=name.split('/');while(parts.length>1){parts.pop();if(names.has(parts.join('/')))fail('MARKET_FILE_DIRECTORY_COLLISION');}}
 if(value.kind==='plugin'){value.entry=filePath(input.entry??'plugin.js');if(!/\.(?:mjs|js)$/.test(value.entry)||!value.files.some(f=>f.path===value.entry&&f.encoding==='utf8'))fail('MARKET_ENTRY_MISSING');}
 if(['skill','workflow'].includes(value.kind)){const skill=value.files.find(f=>f.path==='SKILL.md'&&f.encoding==='utf8');if(!skill||!/^---\r?\n[\s\S]*?\bname:\s*\S+[\s\S]*?\bdescription:\s*\S+[\s\S]*?\r?\n---/m.test(skill.content))fail('MARKET_SKILL_MANIFEST_REQUIRED');}
 if(value.kind==='bot-template'){exact(input.template,['name','kind','purpose']);if(!['agent','team'].includes(input.template.kind))fail('MARKET_INVALID_TEMPLATE');value.template={name:text(input.template.name,80),kind:input.template.kind,purpose:text(input.template.purpose,2000)};}
 if(Buffer.byteLength(JSON.stringify(value))>MAX_PACKAGE_BYTES)fail('MARKET_PACKAGE_TOO_LARGE',413);return value;
}
export function packageMetadata(bundle){const {files,...metadata}=bundle;return metadata;}
export function compilePackage(bundle,sha){
 const name='@naumi-market/'+bundle.slug,generated={'package.json':JSON.stringify({name,version:bundle.version,type:'module',description:bundle.summary,main:bundle.kind==='plugin'?bundle.entry:'market-host.js',exports:{'.':bundle.kind==='plugin'?'./'+bundle.entry:'./market-host.js'},dsh:{bundle:{patch:'./cordis.patch.yml'},meta:{name:bundle.title,description:bundle.summary}},naumiMarket:{digest:sha,slug:bundle.slug,kind:bundle.kind},peerDependencies:{'@deepseek-ai/cordis':'~4.1.0',...(bundle.kind==='plugin'?{'@deepseek-ai/dsh-tools':'0.2.2-rc.1'}:{}),...(['skill','workflow'].includes(bundle.kind)?{'@deepseek-ai/dsh-skill-filesystem':'0.2.2-rc.1'}:{})}},null,2)+'\n',
  'cordis.patch.yml':JSON.stringify([{insert:[{id:'naumi-market-'+bundle.slug,name}]}],null,2)+'\n'};
 if(bundle.kind==='bot-template')generated['market-host.js']='export function apply(){}\n';
 if(['skill','workflow'].includes(bundle.kind))generated['market-host.js']="import {apply as installSkills} from '@deepseek-ai/dsh-skill-filesystem';import {fileURLToPath} from 'node:url';export const inject=['skills'];export function apply(ctx){installSkills(ctx,{providerName:"+JSON.stringify('naumi-market-'+bundle.slug)+",includeDefaultRoots:false,bundledSkillDir:fileURLToPath(new URL('./skills/',import.meta.url)),watch:false});}\n";
 return{...Object.fromEntries(bundle.files.map(f=>[(['skill','workflow'].includes(bundle.kind)?'skills/'+bundle.slug+'/':'')+f.path,fileBytes(f)])),...Object.fromEntries(Object.entries(generated).map(([p,c])=>[p,Buffer.from(c)]))};
}
