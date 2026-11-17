import fs from 'node:fs';
import assert from 'node:assert/strict';
const text=fs.readFileSync('docs/prd/NAUMI_DIGITAL_EMPLOYEE_PRD.md','utf8');
const ids=[...text.matchAll(/^### ([A-Z]+-\d{3}) /gm)].map(m=>m[1]);assert(ids.length>=30);assert.equal(new Set(ids).size,ids.length);
for(const group of ['EMP','PRO','MEM','HBT','COL','WRK','DEL','CAP','ORG','BUD','LOC','UX'])assert(ids.some(id=>id.startsWith(group+'-')),group);
for(let i=1;i<=14;i++)assert(text.includes('AC-'+String(i).padStart(2,'0')));
for(let i=1;i<=5;i++)assert(text.includes('### M'+i+' '));
for(const word of ['性格','人物设定','SQLite','离线授权','验收','心跳','租约','local_only'])assert(text.includes(word));
console.log(`PRD requirements=${ids.length} unique=PASS acceptance_cases=14 phases=5 local_server_boundary=PASS`);
