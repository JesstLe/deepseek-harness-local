import fs from 'node:fs';import path from 'node:path';
export const codexRecords=()=>[
 {type:'session_meta',payload:{id:'codex-fixture-session',cwd:'SOURCE_WORKSPACE',base_instructions:'DO_NOT_IMPORT_PRIVILEGED'}},
 {type:'response_item',timestamp:'2026-11-18T00:00:00Z',payload:{type:'message',id:'u1',role:'user',content:[{type:'input_text',text:'整理活动方案，先保留来源'}]}},
 {type:'event_msg',payload:{type:'user_message',message:'整理活动方案，先保留来源'}},
 {type:'response_item',payload:{type:'message',id:'sys',role:'developer',content:[{type:'input_text',text:'DO_NOT_IMPORT_PRIVILEGED'}]}},
 {type:'response_item',payload:{type:'reasoning',encrypted_content:'DO_NOT_IMPORT_ENCRYPTED',summary:[]}},
 {type:'response_item',payload:{type:'function_call',call_id:'call1',name:'write_file',arguments:'{"path":"never-replay.txt"}'}},
 {type:'response_item',payload:{type:'function_call_output',call_id:'call1',output:'original tool output'}},
 {type:'response_item',payload:{type:'message',id:'a1',role:'assistant',content:[{type:'output_text',text:'原会话方案已整理，待补充核验。'}]}},
 {type:'turn_context',payload:{approval_policy:'never',model:'old-paid-model',sandbox_policy:{type:'danger-full-access'}}},
];
export const claudeRecords=()=>[
 {type:'user',uuid:'root',parentUuid:null,sessionId:'claude-fixture-session',cwd:'OLD_CWD',message:{role:'user',content:'保留 Claude 活动草案'}},
 {type:'assistant',uuid:'old',parentUuid:'root',sessionId:'claude-fixture-session',message:{role:'assistant',content:[{type:'text',text:'废弃分支'}]}},
 {type:'assistant',uuid:'a',parentUuid:'root',sessionId:'claude-fixture-session',message:{role:'assistant',content:[{type:'thinking',thinking:'PRIVATE_THOUGHT'},{type:'text',text:'Claude 主分支方案'},{type:'tool_use',id:'c1',name:'read_file',input:{path:'original.txt'}}]}},
 {type:'user',uuid:'tool',parentUuid:'a',sessionId:'claude-fixture-session',message:{role:'user',content:[{type:'tool_result',tool_use_id:'c1',content:'历史文件正文',is_error:true}]}},
 {type:'assistant',uuid:'side',parentUuid:'tool',isSidechain:true,sessionId:'claude-fixture-session',message:{role:'assistant',content:'其他代理私有内容'}},
 {type:'system',uuid:'bridge',parentUuid:'tool',sessionId:'claude-fixture-session',subtype:'notice',content:'DO_NOT_IMPORT_PRIVILEGED'},
 {type:'user',uuid:'img',parentUuid:'bridge',sessionId:'claude-fixture-session',message:{role:'user',content:[{type:'text',text:'请继续完善'},{type:'image',source:{type:'url',url:'https://not-to-be-fetched.invalid/image.png'}}]}},
 {type:'api-request-blob',sessionId:'claude-fixture-session',message:{role:'system',content:'DO_NOT_IMPORT_REQUEST_BLOB'}},
];
export function writeImportSources(root){const codex=path.join(root,'codex/sessions/2026/11/18'),claude=path.join(root,'claude/projects/project');fs.mkdirSync(codex,{recursive:true});fs.mkdirSync(claude,{recursive:true});const a=path.join(codex,'rollout.jsonl'),b=path.join(claude,'session.jsonl');fs.writeFileSync(a,codexRecords().map(JSON.stringify).join('\n')+'\n');fs.writeFileSync(b,claudeRecords().map(JSON.stringify).join('\n')+'\n');return{a,b,roots:[{provider:'codex',path:path.join(root,'codex/sessions')},{provider:'claude',path:path.join(root,'claude/projects')}]};}
