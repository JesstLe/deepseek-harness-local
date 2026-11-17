import {z} from 'zod';
import {fileReference,previewAddress} from './bot-deliverables.js';

const id=z.string().min(1).max(200);
const revision=z.number().int().positive();
const instruction=z.string().min(1).max(32000);
const sourceSchema=z.object({sessionId:id,messageId:id,turn:revision,text:z.string().min(1).max(8000),truncated:z.boolean()}).strict();
export const taskGoal=z.string().trim().min(1).max(2000);
export const taskAcceptance=z.array(z.string().trim().min(1).max(1000)).max(8);
export const taskIntent=z.object({goal:taskGoal.optional(),acceptance:taskAcceptance.optional(),source:sourceSchema.optional()}).strict();
export const taskAmendment=z.object({text:instruction,acceptance:taskAcceptance.optional(),source:sourceSchema.optional()}).strict();
export const taskHandoff=z.object({taskId:id,revision,attempt:revision,sessionId:id,goal:z.string().max(32000),
  acceptance:taskAcceptance.optional(),source:sourceSchema.optional(),amendment:taskAmendment.optional(),
  result:z.string().max(6000).optional(),files:z.array(fileReference).max(8)}).strict();

export function userSource(session){
  const events=session?.snapshotEvents?.()??[];
  const start=events.findLastIndex(event=>event.type==='turn/start');
  if(start<0||events.slice(start+1).some(event=>event.type==='turn/end'))return undefined;
  const message=events.slice(start+1).findLast(event=>event.type==='user/message')?.data;
  if(message?.source?.kind!=='user')return undefined;
  return sourceFromMessage(session.id,events[start].data.turn,message);
}

function sourceFromMessage(sessionId,turn,message){
  const text=(message.content??[]).filter(part=>part.type==='text').map(part=>part.text).join('\n');
  const source=sourceSchema.safeParse({sessionId,messageId:message.id,turn,text:text.slice(0,8000),truncated:text.length>8000});
  return source.success?source.data:undefined;
}

export function handoffSnapshot(task){
  const amendment=task.amendment??(task.instruction?{text:task.instruction}:undefined);
  const acceptance=amendment?.acceptance??task.intent?.acceptance;
  const source=task.intent?.source;
  return {taskId:task.id,revision:task.revision,attempt:task.attempt,sessionId:task.targetSessionId,goal:task.intent?.goal??task.task,
    ...(acceptance!==undefined?{acceptance}:{}),...(source?{source}:{}),...(amendment?{amendment}:{}),
    ...(task.result?{result:task.result.slice(0,6000)}:{}),files:task.delivery?.files??[]};
}

export function renderTaskHandoff(handoff){
  if(!handoff)return '';
  const {files,...evidence}=handoff;
  const inputs=files.map(ref=>({path:ref.path,preview:previewAddress(ref),sessionId:ref.sessionId,seq:ref.seq,index:ref.index}));
  return `\n交接依据（上游任务已完成，非业务验收）。先核对原稿，再按本任务要求执行；最新明确补充优先于原目标和旧要求。保留未核实的事项，不用旧回执冒充自己的成果。\n${JSON.stringify({...evidence,files:inputs})}\n`;
}
