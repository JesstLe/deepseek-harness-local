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
export function createGroupMentions(React,{roomFor,bots,Avatar=createBotAvatar(React)}){
 const scopes=new Map(),icons=new Map();
 const current=sessionId=>{const bound=scopes.get(sessionId);return bound?{bound,room:roomFor(bound.roomId)}:null;};
 const source={name:AGENT_SOURCE,trigger:'@',order:-100,showGroupTitle:false,
  async candidates(session,req){if(req.signal.aborted)return [];const state=current(session.sessionId);if(!state||req.quoted)return [];
   return groupMentionBots(state.room,bots(),req.query).map(bot=>{let Icon=icons.get(bot.id);if(!Icon){Icon=()=>{const live=bots().find(b=>b.id===bot.id)??bot;return React.createElement(Avatar,{bot:live,staticPreview:true,className:'nbc-agent-avatar'});};icons.set(bot.id,Icon);}return {name:bot.name,value:bot.id,icon:Icon};});
  },
  onPick({session,candidate,span}){const state=current(session.sessionId);if(!state)return;const bot=groupMentionBots(state.room,bots()).find(b=>b.id===candidate.value);if(!bot)return;
   const hit=state.bound.hit;if(!hit||hit.start!==span.start||hit.end!==span.end||hit.draftRev!==span.draftRev)return;
   return {text:(hit.prefixSpace?' ':'')+'@'+bot.name+(hit.suffixSpace?' ':'')};
  },
 };
 return {source,
  bind(service,sessionId,roomId){if(scopes.has(sessionId))throw Error('GROUP_MENTIONS_IN_USE');if(!service?.registerSessionTrigger)throw Error('GROUP_MENTIONS_EXTENSION_MISSING');
   const state={roomId,hit:null};scopes.set(sessionId,state);let stop;
   try{stop=service.registerSessionTrigger(sessionId,{trigger:'@',source:AGENT_SOURCE,detect:(draft,caret,guard,rev)=>{const hit=detectAgentMention(draft,caret,guard);state.hit=hit?{...hit.span,draftRev:rev,prefixSpace:/[a-z0-9_./\\]$/i.test(draft.slice(0,hit.span.start)),suffixSpace:draft.charAt(caret)!==' '}:null;return hit;}});}catch(e){scopes.delete(sessionId);throw e;}
   return ()=>{if(scopes.get(sessionId)===state){scopes.delete(sessionId);stop();}};
  },
 };
}
