import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import pg from 'pg';
import * as contracts from 'naumi-admin-contracts';
import {importDesktopModels,rollbackDesktopModels} from './lib/desktop-model-import-store.mjs';
import {runImportFixture} from './lib/desktop-model-import-fixture.mjs';

async function main(){
const mode=process.argv[2];
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:4,connectionTimeoutMillis:5000,query_timeout:20000});
let code=0;
try{
 assert(['apply','verify','rollback','inspect','fixture'].includes(mode),'MODE_INVALID');
 if(mode==='fixture')console.log(JSON.stringify(await runImportFixture({pool,contracts,connectionString:process.env.DATABASE_URL})));
 else if(mode==='inspect'){
  const r=await pool.query("SELECT current_database() AS name,to_regclass('app_supplier_model_metadata') IS NOT NULL AS metadata,to_regclass('app_model_credentials') IS NOT NULL AS credentials");
  console.log(JSON.stringify({status:'PASS',mode,tables:r.rows[0].metadata&&r.rows[0].credentials}));
 }else if(mode==='rollback')console.log(JSON.stringify(await rollbackDesktopModels({pool,operationId:process.argv[3]})));
 else{
  const chunks=[];let bytes=0;for await(const c of process.stdin){bytes+=c.length;assert(bytes<=2*1024*1024,'INPUT_LIMIT');chunks.push(c);}
  const request=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  // Reuse existing schema/credential ownership, only on this explicit operator path.
  if(mode==='apply')await contracts.ensureModelSchema(pool);
  const result=await importDesktopModels({pool,contracts,request,mode});
  console.log(JSON.stringify(result));
 }
}catch(e){
 const message=typeof e.message==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(e.message)?e.message:'IMPORT_FAILED';
 console.log(JSON.stringify({status:'FAIL',mode,error:message,code:/^[A-Z0-9]{5}$/.test(e.code??'')?e.code:undefined}));code=1;
}finally{await pool.end();}
process.exitCode=code;
}
main().catch(()=>{console.log(JSON.stringify({status:'FAIL',error:'CLI_FAILED'}));process.exitCode=1;});
