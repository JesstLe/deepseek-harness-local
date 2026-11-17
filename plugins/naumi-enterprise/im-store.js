import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash} from 'node:crypto';

export const digest=value=>createHash('sha256').update(value).digest('hex');
const parse=row=>row?JSON.parse(row.value):null;
const fail=code=>{throw Error(code);};

/** All state changes are synchronous SQLite transactions; never await inside write(). */
export class IMStore{
  constructor(file){
    mkdirSync(dirname(file),{recursive:true});this.db=new DatabaseSync(file);
    try{
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL');
      const version=this.db.prepare('PRAGMA user_version').get().user_version;
      if(version>1)fail('IM_STORAGE_VERSION');
      this.db.exec(`CREATE TABLE IF NOT EXISTS meta(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL);
        INSERT OR IGNORE INTO meta VALUES(1,0);
        CREATE TABLE IF NOT EXISTS connections(id TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS bindings(id TEXT PRIMARY KEY,connection_id TEXT NOT NULL,chat_key TEXT NOT NULL,kind TEXT NOT NULL,value TEXT NOT NULL,UNIQUE(connection_id,chat_key,kind));
        CREATE TABLE IF NOT EXISTS pairs(hash TEXT PRIMARY KEY,connection_id TEXT NOT NULL,expires INTEGER NOT NULL,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY,source_key TEXT UNIQUE NOT NULL,binding_id TEXT NOT NULL,state TEXT NOT NULL,value TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS inbox_state ON inbox(state);
        CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,item_key TEXT UNIQUE NOT NULL,binding_id TEXT NOT NULL,state TEXT NOT NULL,value TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS outbox_state ON outbox(state);
        CREATE TABLE IF NOT EXISTS interactions(id TEXT PRIMARY KEY,binding_id TEXT NOT NULL,state TEXT NOT NULL,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS binding_sessions(session_id TEXT PRIMARY KEY,bot_id TEXT NOT NULL);
        PRAGMA user_version=1;`);
    }catch(error){this.db.close();throw error;}
  }
  write(fn){this.db.exec('BEGIN IMMEDIATE');try{const result=fn();this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  revision(){return this.db.prepare('SELECT revision FROM meta WHERE id=1').get().revision;}
  configure(expected,fn){return this.write(()=>{if(this.revision()!==expected)fail('IM_CONFLICT');const result=fn();this.db.exec('UPDATE meta SET revision=revision+1 WHERE id=1');return result;});}
  connection(id){return parse(this.db.prepare('SELECT value FROM connections WHERE id=?').get(id));}
  connections(){return this.db.prepare('SELECT value FROM connections ORDER BY id').all().map(parse);}
  saveConnection(value){this.db.prepare('INSERT INTO connections VALUES(?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id,JSON.stringify(value));}
  binding(id){return parse(this.db.prepare('SELECT value FROM bindings WHERE id=?').get(id));}
  bindings(){return this.db.prepare('SELECT value FROM bindings ORDER BY id').all().map(parse);}
  findBinding(connectionId,chat){return parse(this.db.prepare('SELECT value FROM bindings WHERE connection_id=? AND chat_key=? AND kind=?').get(connectionId,chat.key,chat.kind));}
  sessionOwner(sessionId){return this.db.prepare('SELECT bot_id FROM binding_sessions WHERE session_id=?').get(sessionId)?.bot_id;}
  saveBinding(value){
    this.db.prepare('INSERT INTO bindings VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(value.id,value.connectionId,value.chat.key,value.chat.kind,JSON.stringify(value));
    if(value.target.kind==='bot')this.db.prepare('INSERT OR IGNORE INTO binding_sessions VALUES(?,?)').run(value.sessionId,value.target.id);
  }
  issuePair(value,code){this.db.prepare('DELETE FROM pairs WHERE expires<? OR connection_id=?').run(Date.now(),value.connectionId);this.db.prepare('INSERT INTO pairs VALUES(?,?,?,?)').run(digest(code),value.connectionId,value.expires,JSON.stringify(value));}
  pair(connectionId,event,code,validate=()=>{}){return this.write(()=>{
    const hash=digest(code),pair=parse(this.db.prepare('SELECT value FROM pairs WHERE hash=? AND connection_id=? AND expires>?').get(hash,connectionId,Date.now()));
    if(!pair||pair.chatKind!==event.chat.kind)fail('IM_PAIR_INVALID');
    validate(pair);
    const old=this.findBinding(connectionId,event.chat);
    // Pairing cannot silently transfer an existing conversation to a different target.
    if(old?.active)fail('IM_ALREADY_BOUND');
    const value={id:old?.id??randomUUID(),connectionId,chat:{key:event.chat.key,kind:event.chat.kind,title:event.chat.title??''},target:pair.target,
      users:[event.sender.id],active:true,revision:(old?.revision??0)+1,sessionId:'session-'+randomUUID(),createdAt:new Date().toISOString()};
    this.saveBinding(value);this.db.prepare('DELETE FROM pairs WHERE hash=?').run(hash);this.db.exec('UPDATE meta SET revision=revision+1 WHERE id=1');return value;
  });}
  valid(origin){const b=this.binding(origin.bindingId),c=b&&this.connection(b.connectionId);return !!(c?.enabled&&b.active&&b.revision===origin.bindingRevision&&b.users.includes(origin.userId));}
  admit(binding,event){return this.write(()=>{
    const sourceKey=JSON.stringify([binding.connectionId,event.chat.kind,event.chat.key,event.messageId]);
    const previous=parse(this.db.prepare('SELECT value FROM inbox WHERE source_key=?').get(sourceKey));if(previous)return previous;
    if(this.db.prepare('SELECT COUNT(*) n FROM inbox').get().n>=50000)fail('IM_INBOX_FULL');
    const id=randomUUID(),value={id,sourceKey,bindingId:binding.id,bindingRevision:binding.revision,connectionId:binding.connectionId,
      userId:event.sender.id,externalMessageId:event.messageId,chat:binding.chat,target:binding.target,sessionId:binding.sessionId,
      text:event.text,images:event.images??[],state:'queued',messageId:randomUUID(),createdAt:new Date().toISOString()};
    this.db.prepare('INSERT INTO inbox VALUES(?,?,?,?,?)').run(id,sourceKey,binding.id,value.state,JSON.stringify(value));return value;
  });}
  inputs(states){const rows=this.db.prepare('SELECT value FROM inbox ORDER BY rowid').all().map(parse);return states?rows.filter(v=>states.includes(v.state)):rows;}
  input(id){return parse(this.db.prepare('SELECT value FROM inbox WHERE id=?').get(id));}
  inputByMessage(messageId){return this.inputs().find(v=>v.messageId===messageId);}
  updateInput(id,patch){const value={...this.input(id),...patch};this.db.prepare('UPDATE inbox SET state=?,value=? WHERE id=?').run(value.state,JSON.stringify(value),id);return value;}
  enqueue(origin,key,payload){
    const old=parse(this.db.prepare('SELECT value FROM outbox WHERE item_key=?').get(key));if(old)return old;
    const value={id:randomUUID(),key,...origin,payload,state:'queued',attempt:0,nextAt:0,createdAt:new Date().toISOString()};
    this.db.prepare('INSERT INTO outbox VALUES(?,?,?,?,?)').run(value.id,key,value.bindingId,value.state,JSON.stringify(value));return value;
  }
  outputs(){return this.db.prepare('SELECT value FROM outbox ORDER BY rowid').all().map(parse);}
  output(id){return parse(this.db.prepare('SELECT value FROM outbox WHERE id=?').get(id));}
  updateOutput(id,patch){const value={...this.output(id),...patch};this.db.prepare('UPDATE outbox SET state=?,value=? WHERE id=?').run(value.state,JSON.stringify(value),id);return value;}
  interaction(id){return parse(this.db.prepare('SELECT value FROM interactions WHERE id=?').get(id));}
  interactions(){return this.db.prepare('SELECT value FROM interactions').all().map(parse);}
  saveInteraction(value){this.db.prepare('INSERT INTO interactions VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,value=excluded.value').run(value.id,value.bindingId,value.state,JSON.stringify(value));}
  recover(){this.write(()=>{for(const v of this.outputs().filter(v=>v.state==='sending'))this.updateOutput(v.id,{state:'unknown',error:'IM_SEND_UNKNOWN'});for(const v of this.interactions().filter(v=>v.state==='open'))this.saveInteraction({...v,state:'expired'});});}
  close(){this.db.close();}
}
