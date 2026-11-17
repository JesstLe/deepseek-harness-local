import {botAppearance,BOT_PALETTES} from './bot-appearance-model.js';
import {createBotAvatar} from './bot-avatar.js';
export const AGENT_SOURCE='naumi-group-agents';
/** Pure detection only. Never mutates text or owns selection, composition or undo. */
export function detectAgentMention(draft,caret,guard){
 if(guard.tier==='frozen')return null;
 if(!Number.isInteger(caret)||caret<0||caret>draft.length)return undefined;
 const start=draft.lastIndexOf('@',caret-1);if(start<0||start>=caret)return undefined;
 const query=draft.slice(start+1,caret);if(query.length>80||/[\s@/\\`"<>]/u.test(query))return undefined;
 return {trigger:'@',query,quoted:false,position:draft.slice(0,start).trim()?'inline':'leading',span:{start,end:caret,draftRev:0}};
}
export function groupMentionBots(room,bots,query=''){
 const members=new Set(room?.members.map(m=>m.botId)??[]),q=query.toLocaleLowerCase();
 return bots.filter(b=>b.status==='active'&&members.has(b.id)&&b.name.toLocaleLowerCase().includes(q));
}
/** Owns only group-provider configuration; native inputTriggers owns the menu. */
export function createGroupMentions(React,{roomFor,bots,subscribe=()=>()=>{},Avatar=createBotAvatar(React)}){
 const scopes=new Map(),icons=new Map();
 const current=sessionId=>{const bound=scopes.get(sessionId);return bound?{bound,room:roomFor(bound.roomId)}:null;};
 function MentionToken({reference,data}){
  const roster=React.useSyncExternalStore(subscribe,bots,bots),bot=roster.find(b=>b.id===data.botId),name=bot?.name??reference.label,look=botAppearance(bot??{id:data.botId}),color=BOT_PALETTES.find(p=>p.id===look.palette).color;
  return React.createElement('span',{className:'nbc-agent-token','data-agent-id':data.botId,'data-mention-text':(data.prefixSpace?' ':'')+'@'+name,'data-invalid':reference.invalid||!bot||bot.status!=='active'||undefined,title:name,style:{'--nbc-agent-color':color}},bot&&React.createElement(Avatar,{bot,staticPreview:true,className:'nbc-token-avatar'}),React.createElement('span',{className:'nbc-agent-token-label'},'@'+name));
 }
 const source={name:AGENT_SOURCE,trigger:'@',order:-100,showGroupTitle:false,
  async candidates(session,req){if(req.signal.aborted)return [];const state=current(session.sessionId);if(!state||req.quoted)return [];
   return groupMentionBots(state.room,bots(),req.query).map(bot=>{let Icon=icons.get(bot.id);if(!Icon){Icon=()=>{const live=bots().find(b=>b.id===bot.id)??bot;return React.createElement(Avatar,{bot:live,staticPreview:true,className:'nbc-agent-avatar'});};icons.set(bot.id,Icon);}return {name:bot.name,value:bot.id,icon:Icon};});
  },
  onPick({session,candidate,span}){const state=current(session.sessionId);if(!state)return;const bot=groupMentionBots(state.room,bots()).find(b=>b.id===candidate.value);if(!bot)return;
   const hit=state.bound.hit;if(!hit||hit.start!==span.start||hit.end!==span.end||hit.draftRev!==span.draftRev)return;
   const data={roomId:state.bound.roomId,botId:bot.id,prefixSpace:hit.prefixSpace};return {insert:{source:AGENT_SOURCE,ref:JSON.stringify(data),label:bot.name,clipboardText:(hit.prefixSpace?' ':'')+'@'+bot.name}};
  },
  renderReference(session,reference){const data=parseAgentReference(reference.ref),state=current(session.sessionId);if(!data||!state||data.roomId!==state.bound.roomId)return;return React.createElement(MentionToken,{reference,data});},
  async serializeReference(session,ref,signal){signal.throwIfAborted();const data=parseAgentReference(ref),state=current(session.sessionId),bot=data&&state&&data.roomId===state.bound.roomId?groupMentionBots(state.room,bots()).find(b=>b.id===data.botId):null;
   if(!bot){const e=Error('所选 Agent 已离开当前群组，请重新选择。');e.code='GROUP_MENTION_MEMBER_UNAVAILABLE';throw e;}return (data.prefixSpace?' ':'')+'@'+bot.name;
  },
  codec:{clipboardText(ref){const data=parseAgentReference(ref),bot=data&&bots().find(b=>b.id===data.botId);return (data?.prefixSpace?' ':'')+'@'+(bot?.name??'');},async serialize(){throw Error('GROUP_MENTION_SESSION_REQUIRED');}},
 };
 return {source,
  bind(service,sessionId,roomId){if(scopes.has(sessionId))throw Error('GROUP_MENTIONS_IN_USE');if(!service?.registerSessionTrigger)throw Error('GROUP_MENTIONS_EXTENSION_MISSING');
   const state={roomId,hit:null};scopes.set(sessionId,state);let stop;
   try{stop=service.registerSessionTrigger(sessionId,{trigger:'@',source:AGENT_SOURCE,detect:(draft,caret,guard,rev)=>{const hit=detectAgentMention(draft,caret,guard);state.hit=hit?{...hit.span,draftRev:rev,prefixSpace:/[a-z0-9_./\\]$/i.test(draft.slice(0,hit.span.start)),suffixSpace:draft.charAt(caret)!==' '}:null;return hit;}});}catch(e){scopes.delete(sessionId);throw e;}
   return ()=>{if(scopes.get(sessionId)===state){scopes.delete(sessionId);stop();}};
  },
 };
}

/** Only identity metadata is stored in a native reference, never prompt text. */
export function parseAgentReference(ref){try{const v=JSON.parse(ref);return v&&typeof v.roomId==='string'&&v.roomId.length>0&&v.roomId.length<=200&&typeof v.botId==='string'&&v.botId.length>0&&v.botId.length<=200&&typeof v.prefixSpace==='boolean'&&Object.keys(v).every(k=>['roomId','botId','prefixSpace'].includes(k))?v:null;}catch{return null;}}
