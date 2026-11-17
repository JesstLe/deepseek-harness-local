import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {CloudStore,MAX_BODY} from './store.mjs';
import {MarketStore} from '../../market/store.mjs';
import {marketServer,canvasAuthentication} from '../../market/server.mjs';

const PREFIX='/api/desktop-cloud/v1';
export function cloudServer({store,authenticate,publicOrigin}){return http.createServer(async(req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
 try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/api/desktop-cloud/health')return send(200,{product:'Naumi Desktop Cloud',protocol:1});if(!u.pathname.startsWith(PREFIX+'/'))return send(404,{error:'NOT_FOUND'});if(!['GET','POST'].includes(req.method))return send(405,{error:'CLOUD_METHOD'});if(req.method==='POST'&&(req.headers['x-naumi-market']!=='1'||req.headers.origin&&req.headers.origin!==(publicOrigin??'http://'+req.headers.host)))return send(403,{error:'CLOUD_SAME_ORIGIN_REQUIRED'});
  const actor=await authenticate(req),endpoint=u.pathname.slice(PREFIX.length);
  if(req.method==='GET'){if(endpoint==='/me')return send(200,{user:{id:actor.id,name:actor.name},usage:store.usage(actor),protocol:1});if(endpoint==='/documents')return send(200,store.list(actor,{kind:u.searchParams.get('kind')??'',offset:Number(u.searchParams.get('offset')??0)}));const doc=endpoint.match(/^\/documents\/([-a-z]+)\/([-a-zA-Z0-9_.]{1,128})$/);if(doc)return send(200,store.get(actor,doc[1],doc[2],u.searchParams.has('revision')?Number(u.searchParams.get('revision')):undefined));const chunk=endpoint.match(/^\/chunks\/([a-f0-9]{64})$/);if(chunk)return send(200,store.chunk(actor,chunk[1]));return send(404,{error:'NOT_FOUND'});}
  const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>MAX_BODY)return send(413,{error:'CLOUD_REQUEST_TOO_LARGE'});chunks.push(c);}let input;try{input=JSON.parse(Buffer.concat(chunks));}catch{return send(400,{error:'CLOUD_INVALID_JSON'});}if(endpoint==='/documents')return send(200,store.put(actor,input));if(endpoint==='/chunks')return send(200,store.putChunk(actor,input));return send(404,{error:'NOT_FOUND'});
 }catch(e){if(!res.headersSent)send(e.status??500,{error:/^(?:CLOUD|MARKET)_[A-Z_]+$/.test(e.message)?e.message:'CLOUD_UNAVAILABLE'});}
 });}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const origin=process.env.NAUMI_MARKET_AUTH_ORIGIN;if(!origin)throw Error('AUTH_ORIGIN_REQUIRED');const publicOrigin=process.env.NAUMI_MARKET_PUBLIC_ORIGIN,authenticate=canvasAuthentication({origin,tenant:process.env.NAUMI_MARKET_TENANT??'naumi',moderators:(process.env.NAUMI_MARKET_MODERATORS??'').split(',').filter(Boolean)}),home=path.resolve(process.env.NAUMI_CLOUD_DATA??'/data'),store=new CloudStore(path.join(home,'cloud.sqlite')),market=new MarketStore(path.join(home,'market.sqlite')),cloud=cloudServer({store,authenticate,publicOrigin}),marketHTTP=marketServer({store:market,authenticate,publicOrigin}),server=http.createServer((req,res)=>(req.url.startsWith('/api/plugin-market/')?marketHTTP:cloud).emit('request',req,res));server.requestTimeout=30000;server.headersTimeout=10000;server.listen(Number(process.env.PORT??3190),process.env.HOST??'127.0.0.1',()=>console.log('NAUMI_CLOUD_READY protocol=1'));const stop=()=>{server.closeAllConnections();server.close(()=>{store.close();market.close();process.exit(0);});};process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
