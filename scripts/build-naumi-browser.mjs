import fs from 'node:fs';
import {createHash} from 'node:crypto';
const source=fs.readFileSync('node_modules/@deepseek-ai/dsh-client-ui-sidebar-browser/lib/client.js','utf8');
const changes=[['id: "@deepseek-ai/dsh-client-ui-sidebar-browser"','id: "@naumi/dsh-sidebar-browser"'],['const carrier = globalThis.dshDesktop;','const carrier = globalThis.naumiDesktop;']];
let built=source;
for(const [from,to]of changes){if(built.split(from).length!==2)throw Error('Upstream browser drift: '+from);built=built.replace(from,to);}
const hash=x=>createHash('sha256').update(x).digest('hex');
fs.writeFileSync('plugins/naumi-sidebar-browser/client.js',built);
fs.writeFileSync('plugins/naumi-sidebar-browser/UPSTREAM.json',JSON.stringify({package:'@deepseek-ai/dsh-client-ui-sidebar-browser',version:'0.2.2-rc.1',originalSHA256:hash(source),modifiedSHA256:hash(built),changes:['module registration id','product-scoped preload carrier'],navigationAndPresentationUnchanged:true},null,2)+'\n');
console.log('NAUMI_BROWSER substitutions=2 upstream_unchanged=1');
