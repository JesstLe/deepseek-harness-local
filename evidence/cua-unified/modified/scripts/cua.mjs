import {CuaRuntime} from '../plugins/naumi-enterprise/cua-runtime.js';
const action=process.argv[2]??'status';if(!['status','list_windows'].includes(action))throw Error('CUA_MAINTENANCE_READ_ONLY');
const runtime=new CuaRuntime();try{console.log(JSON.stringify(await runtime.perform('maintenance',{action}),null,2));}finally{await runtime.close();}
