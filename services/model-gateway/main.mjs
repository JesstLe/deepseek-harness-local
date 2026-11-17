import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {startModelGateway} from './server.mjs';
const configPath=process.env.NAUMI_MODEL_GATEWAY_CONFIG;if(!configPath)throw Error('MODEL_GATEWAY_CONFIG_REQUIRED');const config=JSON.parse(fs.readFileSync(configPath,'utf8'));
const dir=path.dirname(path.resolve(config.file));fs.mkdirSync(dir,{recursive:true});const lock=path.join(dir,'gateway.lock');
if(fs.existsSync(lock)){const old=JSON.parse(fs.readFileSync(lock));let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(alive)throw Error('MODEL_GATEWAY_ALREADY_RUNNING');fs.unlinkSync(lock);}
fs.writeFileSync(lock,JSON.stringify({pid:process.pid,entry:fileURLToPath(import.meta.url)}),{flag:'wx',mode:0o600});
let app;try{app=await startModelGateway(config);}catch(e){fs.unlinkSync(lock);throw e;}
let closing=false;const close=async()=>{if(closing)return;closing=true;await app.close();try{if(JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}catch{}};
process.on('SIGTERM',()=>void close());process.on('SIGINT',()=>void close());console.log('NAUMI_MODEL_GATEWAY listening='+app.address.port+' routes='+config.routes.length+' ledger=ready');
