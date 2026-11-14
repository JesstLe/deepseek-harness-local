/** Finite business projection; permissions and workflow mutations remain with Design OS. */
export const STATUS = Object.freeze({draft:'草稿',unassigned:'待分配',assigned:'待领取',in_progress:'制作中',quality_review:'专业审核',changes_requested:'待修改',business_acceptance:'业务验收',accepted:'已验收',paused:'已暂停',cancelled:'已取消'});
/** Copy only the fields owned by this read-only collaboration surface. */
export function projectWorkspace(data) {
  if(!data?.actor?.id || !Array.isArray(data.tasks)) throw Error('INVALID_WORKSPACE_RESPONSE');
  const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]]));
  return {
    actor:pick(data.actor,['id','name','tenantId','tenantName','roles','teamId']),
    today:data.today,revision:data.revision,
    members:(data.members??[]).map(x=>pick(x,['id','name','roles','teamId','active'])),
    projects:(data.projects??[]).map(x=>pick(x,['id','name','status','description','ownerId'])),
    products:(data.products??[]).map(x=>pick(x,['id','name','sku','brand','category','status'])),
    requests:(data.requests??[]).map(x=>pick(x,['id','title','brief','productId','priority','deadline','status','projectId'])),
    tasks:data.tasks.map(x=>pick(x,['id','requestId','title','assigneeId','reviewerId','status','dueDate','skill','estimatedHours'])),
    deliverables:(data.deliverables??[]).map(x=>pick(x,['id','taskId','name','status','latestSubmissionId'])),
    submissions:(data.submissions??[]).map(x=>pick(x,['id','taskId','deliverableId','version','createdAt','description'])),
  };
}
/** An endpoint is installation config, never supplied by a page query. */
export function validateOrigin(value) {
  const url=new URL(value);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error('Expected an HTTP(S) origin');
  return url.origin;
}
/** Forward the business session only; never the Harness cookie or an API key. */
export function businessCookie(header='') {
  const entries=header.split(';').map(s=>s.trim()).filter(s=>s.startsWith('design_ops_session='));
  if(entries.length!==1||!/^design_ops_session=[A-Za-z0-9_-]{20,200}$/.test(entries[0]))return '';
  return entries[0];
}
