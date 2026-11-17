export const EXPERIENCE_EVENT='naumi:employee-settings';
export const SIMPLE_FIELDS={communicationStyle:'回复方式',workStyle:'做事习惯'};
export const EXPERIENCE_ACTIONS=[['work','工作与交付'],['appearance','更换形象'],['style','调整工作方式'],['memories','查看记住的内容'],['forget','忘记某件事'],['restore','恢复之前的设置']];
export const hasSession=location=>new URLSearchParams(location?.hash?.slice(1)??'').has('session')||new URLSearchParams(location?.search??'').has('session');
export function cleanEmployeeLanding(storage){try{if(storage?.getItem('naumi.activePanel')==='naumi-employees'){storage.setItem('naumi.activePanel','naumi-workbench');return true;}}catch{}return false;}
export async function advancedEmployeeAccess(fetcher=globalThis.fetch,signal){
 try{const response=await fetcher('/naumi/workspace',{credentials:'same-origin',cache:'no-store',signal:signal??AbortSignal.timeout(5000)});if(!response.ok)return false;const value=await response.json();return !!value.actor?.id&&Array.isArray(value.actor.roles)&&value.actor.roles.some(r=>['owner','admin'].includes(r));}catch{return false;}
}
export function restoreWorkStyle(profile,version){
 if(!profile||!version)throw Error('EMP_VERSION_NOT_FOUND');
 return Object.fromEntries(Object.keys(SIMPLE_FIELDS).filter(k=>typeof version[k]==='string'&&version[k]!==profile[k]).map(k=>[k,version[k]]));
}
export function publicMemory(memory){return memory.proposedProfile?{title:'建议调整工作方式',changes:Object.entries(memory.proposedProfile).map(([field,value])=>({field,label:({communicationStyle:'回复方式',workStyle:'做事习惯',personality:'性格',persona:'角色设定'})[field]??field,value}))}:{title:memory.text,changes:[]};}
