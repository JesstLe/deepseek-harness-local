export const PROFILE_LABELS={communicationStyle:'沟通风格',workStyle:'做事方式',personality:'性格',persona:'人物设定'};
export const MEMORY_LABELS={fact:'事实',preference:'偏好',experience:'经历',procedure:'方法经验',relationship:'协作关系'};
export const MEMORY_STATUS={active:'已生效',candidate:'待确认',rejected:'已拒绝',deleted:'已删除'};
export const GOAL_STATUS={planned:'待开始',in_progress:'进行中',paused:'已暂停',completed:'已完成',cancelled:'已取消'};
export const DELIVERY_STATUS={draft:'草稿',submitted:'待审核',in_review:'审核中',changes_requested:'待修改',accepted:'已验收',cancelled:'已取消'};
export const ERRORS={EMP_CONFLICT:'记录已更新，请刷新后再操作',EMP_IDEMPOTENCY_CONFLICT:'操作标识冲突，请刷新后重试',EMP_FIELD_LOCKED:'字段已锁定，请先解除锁定',EMP_MEMORY_DELETED:'记忆已删除',EMP_SECRET_PATTERN:'内容含凭证格式，请移除后再保存',WORK_CONFLICT:'记录已更新，请刷新后重试',WORK_PROPOSAL_RESOLVED:'该目标提议已处理，请刷新',WORK_PROPOSAL_NOT_FOUND:'目标提议不存在',WORK_PROPOSAL_CAPACITY:'待确认目标已达上限，请先处理已有提议',WORK_GOAL_CYCLE:'目标层级或依赖形成循环',WORK_DEPENDENCY_UNFINISHED:'依赖目标尚未完成',WORK_CHILD_UNFINISHED:'子目标尚未结束',WORK_ACCEPTED_DELIVERY_REQUIRED:'请先完成交付验收',WORK_GOAL_CLOSED:'目标已结束',WORK_GOAL_NOT_ACTIVE:'目标暂停或已结束',WORK_CRITERIA_UNCHECKED:'请逐项核对验收条件',WORK_REASON_REQUIRED:'请填写退回原因',WORK_DELIVERY_IMMUTABLE:'当前版本已提交，请先退回修改',WORK_INVALID_TRANSITION:'交付状态已变化，请刷新',EMP_AUTH_REQUIRED:'请重新连接本地工作空间'};
export const errorLabel=error=>ERRORS[error?.message]??(/^EMP_|^WORK_/.test(error?.message??'')?'操作未完成，请检查当前状态':error?.name==='AbortError'?'请求已取消':'连接暂不可用，已保留当前输入');
export function profileDifference(current,version){
  const labels={...PROFILE_LABELS,autoLearning:'自动学习',lockedFields:'锁定字段'},format=(key,value)=>key==='autoLearning'?(value?'开启':'关闭'):Array.isArray(value)?value.map(v=>PROFILE_LABELS[v]??v).join('、')||'无':value??'';
  return Object.keys(labels).filter(k=>JSON.stringify(current[k])!==JSON.stringify(version[k])).map(k=>({field:k,label:labels[k],before:format(k,current[k]),after:format(k,version[k])}));
}
export function createEmployeeClient({fetcher=globalThis.fetch,uuid=()=>crypto.randomUUID()}={}){
  const pending=new Map();
  const request=async(url,options={})=>{
    const response=await fetcher(url,{credentials:'same-origin',cache:'no-store',...options,signal:options.signal??AbortSignal.timeout(15000)});
    const value=await response.json().catch(()=>({error:'EMP_INVALID_RESPONSE'}));
    if(!response.ok){const auth=response.status===401||response.status===403&&(!value.error||value.error==='EMP_INVALID_RESPONSE');const error=Error(auth?'EMP_AUTH_REQUIRED':value.error??'EMP_REQUEST_FAILED');error.status=response.status;throw error;}return value;
  };
  const get=(url,botId,query={},signal)=>request(url+'?'+new URLSearchParams({botId,...Object.fromEntries(Object.entries(query).filter(([,v])=>v!==null&&v!==undefined))}),{signal});
  return {
    catalog:signal=>request('/naumi/bots',{signal}),
    employee:(botId,view,query={},signal)=>get('/naumi/employees',botId,{view,...query},signal),
    work:(botId,query={},signal)=>get('/naumi/employee-work',botId,query,signal),
    artifactURL:(botId,artifactId)=>'/naumi/employee-work?'+new URLSearchParams({botId,view:'artifact',artifactId}),
    async artifact(botId,artifactId){
      const response=await fetcher('/naumi/employee-work?'+new URLSearchParams({botId,view:'artifact',artifactId}),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!response.ok){const error=Error(response.status===401||response.status===403?'EMP_AUTH_REQUIRED':'WORK_ARTIFACT_NOT_FOUND');error.status=response.status;throw error;}
      return {content:await response.text(),sha256:response.headers.get('x-artifact-sha256')};
    },
    async command(url,body){
      const key=url+'\0'+JSON.stringify(body);let operationId=pending.get(key);if(!operationId){operationId=uuid();pending.set(key,operationId);}
      try{const result=await request(url,{method:'POST',headers:{'Content-Type':'application/json',[url==='/naumi/employees'?'x-naumi-employees':'x-naumi-employee-work']:'1'},body:JSON.stringify({...body,operationId})});pending.delete(key);return result;}
      catch(error){if(error.status)pending.delete(key);throw error;}
    },
  };
}
