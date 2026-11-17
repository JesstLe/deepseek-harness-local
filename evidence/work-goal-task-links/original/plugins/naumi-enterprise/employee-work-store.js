import {randomUUID,createHash} from 'node:crypto';
import {z} from 'zod';
import {assertPublicText} from './employee-store.js';

const id=z.string().min(1).max(200),op=id,rev=z.number().int().positive(),title=z.string().trim().min(1).max(120),stamp=z.string().datetime();
const criteria=z.array(z.string().trim().min(1).max(500)).min(1).max(20);
const states=['planned','in_progress','paused','completed','cancelled'];
const goalInput=z.object({title,description:z.string().trim().max(4000).default(''),kind:z.enum(['objective','milestone']).default('objective'),parentId:id.nullable().default(null),priority:z.number().int().min(0).max(3).default(1),dueAt:stamp.nullable().default(null),criteria,dependencies:z.array(id).max(20).default([])}).strict();
const goalPatch=z.object({title:title.optional(),description:z.string().trim().max(4000).optional(),parentId:id.nullable().optional(),priority:z.number().int().min(0).max(3).optional(),dueAt:stamp.nullable().optional(),criteria:criteria.optional(),dependencies:z.array(id).max(20).optional(),status:z.enum(states).optional()}).strict();
const fileName=z.string().trim().min(1).max(120).refine(s=>!/[\/\\\u0000-\u001f\u007f]/u.test(s)&&!['.','..'].includes(s),'Invalid artifact name');
const content=z.string().min(1).max(32000),note=z.string().trim().max(2000);
const fail=code=>{throw Error(code);};
const digest=text=>createHash('sha256').update(text,'utf8').digest('hex');
const guardText=value=>{if(typeof value==='string')assertPublicText(value);else if(Array.isArray(value))value.forEach(guardText);else if(value&&typeof value==='object')Object.values(value).forEach(guardText);};

/** Local business state, not a replacement for execution logs or server-authoritative enterprise acceptance. */
export class EmployeeWorkStore{
  constructor(store){this.store=store;}
  goals(botId){return this.store.entitiesOfType(botId,'goal');}
  deliveries(botId){return this.store.entitiesOfType(botId,'delivery');}
  goal(botId,goalId){const value=this.store.entity(botId,goalId);if(!value||!goalId.startsWith('goal-'))fail('WORK_GOAL_NOT_FOUND');return value;}
  delivery(botId,deliveryId){const value=this.store.entity(botId,deliveryId);if(!value||!deliveryId.startsWith('delivery-'))fail('WORK_DELIVERY_NOT_FOUND');return value;}
  save(value,type,action,actor){return this.store.put({...value,updatedAt:this.store.now()},type,action,actor);}
  validateGraph(botId,next){
    const goals=this.goals(botId).filter(g=>g.id!==next.id).concat(next),byId=new Map(goals.map(g=>[g.id,g]));
    if(new Set(next.dependencies).size!==next.dependencies.length)fail('WORK_DUPLICATE_DEPENDENCY');
    if(next.parentId&&!byId.has(next.parentId)||next.dependencies.some(id=>!byId.has(id)))fail('WORK_GOAL_NOT_FOUND');
    if(next.parentId===next.id||next.dependencies.includes(next.id))fail('WORK_GOAL_CYCLE');
    const visit=(id,edge,visiting=new Set(),done=new Set())=>{if(visiting.has(id))fail('WORK_GOAL_CYCLE');if(done.has(id))return;visiting.add(id);for(const target of edge(byId.get(id)))visit(target,edge,visiting,done);visiting.delete(id);done.add(id);};
    for(const g of goals){visit(g.id,g=>g.dependencies);visit(g.id,g=>g.parentId?[g.parentId]:[]);}
    // A dependency on an ancestor/descendant would deadlock completion through the hierarchy.
    const children=id=>goals.filter(g=>g.parentId===id).map(g=>g.id);
    for(const g of goals)visit(g.id,g=>[...g.dependencies,...children(g.id)]);
    if(['in_progress','completed'].includes(next.status)&&next.dependencies.some(id=>byId.get(id).status!=='completed'))fail('WORK_DEPENDENCY_UNFINISHED');
    if(next.status==='completed'){
      if(goals.some(g=>g.parentId===next.id&&!['completed','cancelled'].includes(g.status)))fail('WORK_CHILD_UNFINISHED');
      if(!this.deliveries(botId).some(d=>d.goalId===next.id&&d.businessStatus==='accepted'&&JSON.stringify(d.acceptanceCriteria)===JSON.stringify(next.criteria))&&!goals.some(g=>g.parentId===next.id&&g.status==='completed'))fail('WORK_ACCEPTED_DELIVERY_REQUIRED');
    }
    if(next.status!=='completed'&&goals.some(g=>g.id!==next.id&&g.status==='completed'&&g.dependencies.includes(next.id)))fail('WORK_COMPLETED_DEPENDENT');
    if(next.parentId&&['completed','cancelled'].includes(byId.get(next.parentId).status))fail('WORK_PARENT_CLOSED');
  }
  proposals(botId){return this.store.entitiesOfType(botId,'goalproposal');}
  proposal(botId,proposalId){const value=this.store.entity(botId,proposalId);if(!value||!proposalId.startsWith('goalproposal-'))fail('WORK_PROPOSAL_NOT_FOUND');return value;}
  proposeGoal(botId,{operationId,...input},actor){
    input=goalInput.parse(input);guardText(input);if(actor?.kind!=='proposal'||!actor.sessionId||!actor.messageId||!actor.quote)fail('WORK_USER_SOURCE_REQUIRED');
    const proposalKey=digest(JSON.stringify({input,sessionId:actor.sessionId,messageId:actor.messageId}));
    return this.store.mutate(botId,operationId,'goal_propose',{input,proposalKey},actor,()=>{
      const all=this.proposals(botId),same=all.find(p=>p.proposalKey===proposalKey);if(same)return same;
      if(all.length>=1000||all.filter(p=>p.status==='pending').length>=50)fail('WORK_PROPOSAL_CAPACITY');
      const time=this.store.now();return this.save({id:'goalproposal-'+randomUUID(),botId,revision:1,status:'pending',goal:input,source:actor,proposalKey,goalId:null,createdAt:time,updatedAt:time},'goalproposal','goal_propose',actor);
    });
  }
  reviewProposal(botId,{proposalId,expectedRevision,operationId,decision,goal:edited},actor={kind:'owner'}){
    if(actor.kind!=='owner')fail('WORK_REVIEWER_REQUIRED');id.parse(proposalId);rev.parse(expectedRevision);z.enum(['confirm','dismiss']).parse(decision);
    if(edited!==undefined){edited=goalInput.parse(edited);guardText(edited);if(decision!=='confirm')fail('WORK_INVALID_REQUEST');}
    return this.store.mutate(botId,operationId,'goal_proposal_review',{proposalId,expectedRevision,decision,...edited?{goal:edited}:{}},actor,()=>{
      const current=this.proposal(botId,proposalId);if(current.revision!==expectedRevision)fail('WORK_CONFLICT');if(current.status!=='pending')fail('WORK_PROPOSAL_RESOLVED');
      const goal=decision==='confirm'?this.insertGoal(botId,edited??current.goal,actor,{sourceProposalId:current.id}):null;
      const proposal=this.save({...current,status:decision==='confirm'?'confirmed':'dismissed',goalId:goal?.id??null,revision:current.revision+1,resolvedAt:this.store.now()},'goalproposal','goal_proposal_'+decision,actor);
      return {proposal,goal};
    });
  }
  insertGoal(botId,input,actor,extra={}){
    if(this.goals(botId).length>=1000)fail('WORK_CAPACITY');const time=this.store.now();
    const goal={id:'goal-'+randomUUID(),botId,revision:1,...input,...extra,status:'planned',createdAt:time,updatedAt:time};this.validateGraph(botId,goal);return this.save(goal,'goal','goal_create',actor);
  }
  createGoal(botId,{operationId,...input},actor={kind:'owner'}){
    input=goalInput.parse(input);guardText(input);return this.store.mutate(botId,operationId,'goal_create',input,actor,()=>{
      return this.insertGoal(botId,input,actor);
    });
  }
  updateGoal(botId,{goalId,expectedRevision,operationId,patch},actor={kind:'owner'}){
    id.parse(goalId);rev.parse(expectedRevision);patch=goalPatch.parse(patch);if(!Object.keys(patch).length)fail('WORK_EMPTY_PATCH');guardText(patch);
    return this.store.mutate(botId,operationId,'goal_update',{goalId,expectedRevision,patch},actor,()=>{
      const current=this.goal(botId,goalId);if(current.revision!==expectedRevision)fail('WORK_CONFLICT');
      if(['completed','cancelled'].includes(current.status))fail('WORK_GOAL_CLOSED');
      const next={...current,...patch,revision:current.revision+1};this.validateGraph(botId,next);return this.save(next,'goal','goal_update',actor);
    });
  }
  artifact(botId,artifactId){const value=this.store.entity(botId,artifactId);if(!value||!artifactId.startsWith('artifact-'))fail('WORK_ARTIFACT_NOT_FOUND');if(digest(value.content)!==value.sha256)fail('WORK_ARTIFACT_CORRUPT');return value;}
  addArtifact(botId,deliveryId,version,name,text,actor){
    const artifact={id:'artifact-'+randomUUID(),botId,deliveryId,revision:1,version,fileName:name,content:text,sha256:digest(text),bytes:Buffer.byteLength(text,'utf8'),createdAt:this.store.now()};
    return this.store.put(artifact,'artifact','artifact_create',actor);
  }
  createDelivery(botId,{operationId,...input},actor={kind:'owner'}){
    input=z.object({goalId:id,title,fileName,content,sourceTaskId:id.nullable().default(null)}).strict().parse(input);guardText(input);
    return this.store.mutate(botId,operationId,'delivery_create',input,actor,()=>{
      const goal=this.goal(botId,input.goalId);if(['completed','cancelled'].includes(goal.status))fail('WORK_GOAL_CLOSED');if(this.deliveries(botId).length>=1000)fail('WORK_CAPACITY');
      const time=this.store.now(),deliveryId='delivery-'+randomUUID(),artifact=this.addArtifact(botId,deliveryId,1,input.fileName,input.content,actor);
      return this.save({id:deliveryId,botId,revision:1,goalId:input.goalId,title:input.title,sourceTaskId:input.sourceTaskId,businessStatus:'draft',version:1,
        artifactIds:[artifact.id],currentArtifactId:artifact.id,reviewIds:[],acceptanceCriteria:[...goal.criteria],createdAt:time,updatedAt:time},'delivery','delivery_create',actor);
    });
  }
  reviseDelivery(botId,{deliveryId,expectedRevision,operationId,fileName:name,content:text},actor={kind:'owner'}){
    rev.parse(expectedRevision);fileName.parse(name);content.parse(text);guardText({name,text});
    return this.store.mutate(botId,operationId,'delivery_revise',{deliveryId,expectedRevision,name,text},actor,()=>{
      const d=this.delivery(botId,deliveryId);if(d.revision!==expectedRevision)fail('WORK_CONFLICT');if(!['draft','changes_requested'].includes(d.businessStatus))fail('WORK_DELIVERY_IMMUTABLE');if(d.version>=100)fail('WORK_VERSION_LIMIT');
      const g=this.goal(botId,d.goalId);if(['completed','cancelled'].includes(g.status))fail('WORK_GOAL_CLOSED');
      const artifact=this.addArtifact(botId,d.id,d.version+1,name,text,actor);
      return this.save({...d,revision:d.revision+1,version:d.version+1,currentArtifactId:artifact.id,artifactIds:[...d.artifactIds,artifact.id],businessStatus:'draft',acceptanceCriteria:[...g.criteria]},'delivery','delivery_revise',actor);
    });
  }
  transition(botId,{deliveryId,expectedRevision,operationId,action,reason='',checkedCriteria=[]},actor={kind:'owner'}){
    rev.parse(expectedRevision);z.enum(['submit','start_review','request_changes','accept','cancel']).parse(action);note.parse(reason);z.array(z.number().int().nonnegative()).max(20).parse(checkedCriteria);guardText(reason);
    return this.store.mutate(botId,operationId,'delivery_'+action,{deliveryId,expectedRevision,reason,checkedCriteria},actor,()=>{
      const d=this.delivery(botId,deliveryId);if(d.revision!==expectedRevision)fail('WORK_CONFLICT');
      const permitted={submit:['draft'],start_review:['submitted'],request_changes:['submitted','in_review'],accept:['in_review'],cancel:['draft','submitted','in_review','changes_requested']};
      if(!permitted[action].includes(d.businessStatus))fail('WORK_INVALID_TRANSITION');
      if(action!=='submit'&&actor.kind!=='owner')fail('WORK_REVIEWER_REQUIRED');
      const goal=this.goal(botId,d.goalId);if(['completed','cancelled','paused'].includes(goal.status)&&action==='submit')fail('WORK_GOAL_NOT_ACTIVE');
      this.artifact(botId,d.currentArtifactId);
      if(action==='request_changes'&&!reason.trim())fail('WORK_REASON_REQUIRED');
      if(action==='accept'&&(new Set(checkedCriteria).size!==d.acceptanceCriteria.length||d.acceptanceCriteria.some((_,i)=>!checkedCriteria.includes(i))))fail('WORK_CRITERIA_UNCHECKED');
      const states={submit:'submitted',start_review:'in_review',request_changes:'changes_requested',accept:'accepted',cancel:'cancelled'};
      const review={id:'review-'+randomUUID(),botId,revision:1,deliveryId:d.id,version:d.version,artifactId:d.currentArtifactId,action,reason,checkedCriteria,
        reviewer:actor.kind==='owner'?'local-owner':actor.sessionId,reviewerKind:actor.kind,createdAt:this.store.now()};
      this.store.put(review,'review','review_record',actor);
      const result=this.save({...d,businessStatus:states[action],revision:d.revision+1,reviewIds:[...d.reviewIds,review.id]},'delivery','delivery_'+action,actor);
      if(action==='accept'&&reason.trim()&&this.store.profile(botId).autoLearning&&this.store.allMemories(botId).length<5000){
        const time=this.store.now();this.store.put({id:'memory-'+randomUUID(),botId,revision:1,kind:'procedure',text:'已验收交付反馈：'+reason,status:'candidate',pinned:false,expiresAt:null,
          source:{kind:'owner',note:'review:'+review.id},createdAt:time,updatedAt:time},'memory','acceptance_learning_candidate',actor);
      }
      return result;
    });
  }
  details(botId,deliveryId){const d=this.delivery(botId,deliveryId);return {...d,artifacts:d.artifactIds.map(id=>{const {content,...meta}=this.artifact(botId,id);return meta;}),reviews:d.reviewIds.map(id=>this.store.entity(botId,id)),currentContent:this.artifact(botId,d.currentArtifactId).content};}
}

export const workCommands=z.discriminatedUnion('action',[
  z.object({action:z.literal('goal_proposal_review'),botId:id,operationId:op,proposalId:id,expectedRevision:rev,decision:z.enum(['confirm','dismiss']),goal:goalInput.optional()}).strict(),
  z.object({action:z.literal('goal_create'),botId:id,operationId:op,...goalInput.shape}).strict(),
  z.object({action:z.literal('goal_update'),botId:id,operationId:op,goalId:id,expectedRevision:rev,patch:goalPatch}).strict(),
  z.object({action:z.literal('delivery_create'),botId:id,operationId:op,goalId:id,title,fileName,content,sourceTaskId:id.nullable().optional()}).strict(),
  z.object({action:z.literal('delivery_revise'),botId:id,operationId:op,deliveryId:id,expectedRevision:rev,fileName,content}).strict(),
  z.object({action:z.literal('delivery_transition'),botId:id,operationId:op,deliveryId:id,expectedRevision:rev,transition:z.enum(['submit','start_review','request_changes','accept','cancel']),reason:note.optional(),checkedCriteria:z.array(z.number().int().nonnegative()).max(20).optional()}).strict(),
]);
