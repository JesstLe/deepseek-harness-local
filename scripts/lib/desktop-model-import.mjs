import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const serial=value=>JSON.stringify(value&&typeof value==='object'?Array.isArray(value)?value.map(x=>JSON.parse(serial(x))):Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,JSON.parse(serial(v))])):value);
export const hash=value=>createHash('sha256').update(typeof value==='string'?value:serial(value)).digest('hex');
const forbidden=/^(?:api_?key(?:env)?|authorization|password|secret|credential(?:_?ref)?|access_?token|token|cookie)$/i;
export function assertPublic(value){
 if(value&&typeof value==='object')for(const[k,v]of Object.entries(value)){assert(!forbidden.test(k),'SECRET_FIELD_IN_METADATA');assertPublic(v);}
}
export function prepareDesktopImport({providers,refs,sourceId,operationId}){
 assert(/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,99}$/.test(sourceId),'SOURCE_ID_INVALID');
 assert(/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(operationId),'OPERATION_ID_INVALID');
 assert(providers&&typeof providers==='object'&&!Array.isArray(providers),'PROVIDERS_INVALID');
 const entries=Object.entries(providers);assert(entries.length>0&&entries.length<=100,'PROVIDER_LIMIT');
 const connections=entries.map(([sourceProviderId,p])=>{
  assert(/^[a-z][a-z0-9_-]{0,79}$/.test(sourceProviderId),'PROVIDER_ID_INVALID');
  assert(['openai-completions','openai-responses','anthropic-messages'].includes(p.api),'PROTOCOL_UNSUPPORTED');
  const url=new URL(p.baseURL);assert(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'PROVIDER_URL_INVALID');
  assert(typeof p.displayName==='string'&&p.displayName.trim()&&p.displayName.length<=100,'PROVIDER_NAME_INVALID');
  assert(typeof p.apiKeyEnv==='string'&&typeof refs?.[p.apiKeyEnv]==='string','LOCAL_CREDENTIAL_MISSING');
  const key=refs[p.apiKeyEnv];assert(key.length>0&&key.length<=16384&&!/[\x00-\x1f\x7f]/.test(key),'LOCAL_CREDENTIAL_INVALID');
  const {apiKeyEnv:_,models,...configuration}=structuredClone(p);assertPublic(configuration);
  assert(Array.isArray(models)&&models.length>0&&models.length<=200,'MODEL_LIMIT');
  assert(new Set(models.map(m=>m.id)).size===models.length,'DUPLICATE_MODEL');
  for(const m of models){assertPublic(m);assert(typeof m.id==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(m.id),'MODEL_ID_INVALID');for(const k of ['contextWindow','maxTokens'])if(m[k]!==undefined)assert(Number.isSafeInteger(m[k])&&m[k]>0&&m[k]<=2147483647,'MODEL_LENGTH_INVALID');}
  return {providerId:'desktop-'+hash([sourceId,sourceProviderId]).slice(0,24),sourceProviderId,configuration,models,key};
 });
 assert(connections.reduce((n,p)=>n+p.models.length,0)<=600,'TOTAL_MODEL_LIMIT');
 const publicConfig={schemaVersion:1,sourceId,connections:connections.map(({key:_,...p})=>p)};
 return {schemaVersion:1,operationId,sourceId,configDigest:hash(publicConfig),connections};
}
export function sourceMetadata(connection,model,unknownSupplierMetadata){
 const metadata=unknownSupplierMetadata();metadata.modality='text';metadata.capabilityState='configured';
 metadata.capabilitySource='Naumi Desktop configured source; not supplier acceptance';
 metadata.capabilities.contextTokens=model.contextWindow??connection.configuration.defaultContextWindow??null;
 metadata.parameterMetadata.desktopSource={schemaVersion:1,sourceProviderId:connection.sourceProviderId,configuration:connection.configuration,model,employeeAvailability:'unassigned'};
 assertPublic(metadata);return metadata;
}
