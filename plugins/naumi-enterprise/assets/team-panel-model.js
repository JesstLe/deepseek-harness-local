/** Pure display projections. Unknown readings remain unknown and source objects are never mutated. */
export function naumiMonitorReadings(stats,usage,pressure){
  const number=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0?x:null;
  const input=usage&&[usage.uncachedInputTokens,usage.cacheReadTokens,usage.cacheWriteTokens].every(x=>number(x)!==null)?usage.uncachedInputTokens+usage.cacheReadTokens+usage.cacheWriteTokens:null;
  const total=input!==null&&number(usage?.outputTokens)!==null?input+usage.outputTokens:null;
  const speed=number(stats?.decodeMs)>0&&number(stats?.decodeTokens)!==null?stats.decodeTokens/(stats.decodeMs/1000):null;
  const occupied=number(pressure?.projectedTokens??pressure?.pressureTokens),capacity=number(pressure?.contextWindow);
  return {speed,total,cache:input>0?Math.min(100,usage.cacheReadTokens/input*100):null,context:occupied!==null&&capacity>0?Math.min(100,Math.round(occupied/capacity*100)):null};
}
export function naumiPortalOptions(entry,name){
  if(entry.children)throw Error('Only leaf UI slots can be relocated');
  return {...entry.options,name,priority:-1000,inject:entry.inject,locale:entry.locale,...(entry.store?{store:entry.store}:{})};
}
export function teamTaskGroups(team){
  const tasks=Array.isArray(team?.tasks)?team.tasks:[];
  return {active:tasks.filter(t=>t.status==='in_progress'||t.status==='pending').sort((a,b)=>(a.status==='in_progress'?0:1)-(b.status==='in_progress'?0:1)),completed:tasks.filter(t=>t.status==='completed')};
}
export function teamSchedules(records,leadId){
  return (records??[]).filter(r=>r.status!=='ended'&&(r.involvedSessionIds?.includes(leadId)||r.target?.sessionId===leadId)).sort((a,b)=>{
    const active=Number(b.status==='active')-Number(a.status==='active');
    return active||scheduleTime(a)-scheduleTime(b)||a.id.localeCompare(b.id);
  });
}
export function scheduleTime(row){
  const scheduled=Date.parse(row.scheduledAt),floor=Date.parse(row.deliveryFloorEndsAt);
  return Math.max(Number.isFinite(scheduled)?scheduled:0,Number.isFinite(floor)?floor:0);
}
export function scheduleToggleRequest(row){
  if(!row||row.executionActive||!['active','paused'].includes(row.status))throw Error('SCHEDULE_NOT_EDITABLE');
  return {id:row.id,action:'update',patch:{active:row.status!=='active'},expectedUpdatedAt:row.updatedAt??null};
}
export function memberState(member,status,summary){
  if(member.phase!=='active')return member.phase;
  if(status?.pendingInteraction)return 'waiting';
  const running=status?.running??summary?.running;
  return running===true?'running':running===false?'inactive':'unknown';
}
export function teamInitials(name){
  if(!name)return 'N';
  const graphemes=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(name)].map(v=>v.segment):Array.from(name);
  return graphemes.slice(0,2).join('').toLocaleUpperCase();
}
/** GET-only readiness inspection; it neither starts a browser nor changes desktop/input authority. */
export async function readEnvironment(fetcher,signal){
  const read=async path=>{
    try{const response=await fetcher(path,{method:'GET',credentials:'same-origin',cache:'no-store',signal});if(!response.ok)return {state:'error'};return {state:'ready',value:await response.json()};}
    catch(error){if(signal?.aborted)throw error;return {state:'error'};}
  };
  const [desktop,browser]=await Promise.all([read('/naumi/desktop'),read('/naumi/browser')]);
  return {desktop,browser};
}
