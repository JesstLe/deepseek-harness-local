import fs from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=fs.readFileSync(path.join(root,'node_modules/@deepseek-ai/dsh-client-ui-sidebar-browser/lib/client.js'),'utf8');
const changes=[
  ["const initialUrl = (0, react.useRef)(tab.navigation.params?.url);","const initialUrl = (0, react.useRef)(tab.navigation.params?.url ?? (currentBrowserTarget(initial.current) === void 0 ? \"https://baidu.com\" : void 0));"],
  ['id: "@deepseek-ai/dsh-client-ui-sidebar-browser"','id: "@naumi/dsh-sidebar-browser"'],
  ['const carrier = globalThis.dshDesktop;','const carrier = globalThis.naumiDesktop;'],
  ['const tagId = "@deepseek-ai/dsh-client-ui-sidebar-browser/Browser.module.css";','const tagId = "@naumi/dsh-sidebar-browser/Browser.module.css";'],
  ['tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-sidebar-browser";','tag.dataset.plugin = "@naumi/dsh-sidebar-browser";'],
];
let built=source;
for(const [from,to]of changes){if(built.split(from).length!==2)throw Error('Upstream browser drift: '+from);built=built.replace(from,to);}
const hash=x=>createHash('sha256').update(x).digest('hex');
fs.writeFileSync(path.join(root,'plugins/naumi-sidebar-browser/client.js'),built);
fs.writeFileSync(path.join(root,'plugins/naumi-sidebar-browser/UPSTREAM.json'),JSON.stringify({package:'@deepseek-ai/dsh-client-ui-sidebar-browser',version:'0.2.2-rc.1',originalSHA256:hash(source),modifiedSHA256:hash(built),changes:['module registration id','product-scoped preload carrier','product-scoped CSS identity','product-scoped CSS owner','Baidu default for fresh tabs without an explicit URL'],navigationAndPresentationUnchanged:false,defaultPage:"https://baidu.com",existingCheckpointRestoreUnchanged:true},null,2)+'\n');
console.log('NAUMI_BROWSER substitutions=5 upstream_unchanged=1');
