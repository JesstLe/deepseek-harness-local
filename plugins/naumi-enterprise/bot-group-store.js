import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

const timestamp = () => new Date().toISOString();
const fail = code => { throw new Error(code); };

export class BotGroupStore {
  constructor(file) {
    mkdirSync(dirname(file), {recursive:true});
    this.db = new DatabaseSync(file);
    try {
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000');
      const version = this.db.prepare('PRAGMA user_version').get().user_version;
      if (version > 1) fail('BOT_GROUP_STORAGE_VERSION');
      if (version === 0) this.write(() => this.db.exec(`
        CREATE TABLE IF NOT EXISTS rooms (
          id TEXT PRIMARY KEY, name TEXT NOT NULL, default_bot_id TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS members (
          room_id TEXT NOT NULL REFERENCES rooms(id), bot_id TEXT NOT NULL,
          session_id TEXT NOT NULL UNIQUE, position INTEGER NOT NULL, PRIMARY KEY (room_id, bot_id)
        );
        CREATE TABLE IF NOT EXISTS posts (
          seq INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, room_id TEXT NOT NULL REFERENCES rooms(id),
          text TEXT NOT NULL, explicit_bot_ids TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS posts_room ON posts (room_id, seq);
        CREATE TABLE IF NOT EXISTS replies (
          id TEXT PRIMARY KEY, post_seq INTEGER NOT NULL REFERENCES posts(seq),
          session_id TEXT NOT NULL REFERENCES members(session_id), state TEXT NOT NULL,
          text TEXT, reason TEXT, updated_at TEXT NOT NULL, UNIQUE (post_seq, session_id)
        );
        CREATE INDEX IF NOT EXISTS replies_pending ON replies (state, post_seq);
        CREATE INDEX IF NOT EXISTS replies_session ON replies (session_id, post_seq);
        PRAGMA user_version=1;
      `));
    } catch (error) {
      this.db.close();
      throw error;
    }
  }

  write(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }

  members(roomId) {
    return this.db.prepare(`SELECT bot_id AS botId, session_id AS sessionId FROM members
      WHERE room_id=? ORDER BY position`).all(roomId);
  }

  member(sessionId) {
    return this.db.prepare(`SELECT room_id AS roomId, bot_id AS botId, session_id AS sessionId
      FROM members WHERE session_id=?`).get(sessionId);
  }

  room(id) {
    const row = this.db.prepare('SELECT id, name, default_bot_id AS defaultBotId FROM rooms WHERE id=?').get(id);
    return row && {...row, members:this.members(id)};
  }

  rooms() {
    return this.db.prepare('SELECT id FROM rooms ORDER BY created_at DESC, id').all().map(({id}) => this.room(id));
  }

  create({id, name, botIds, defaultBotId}, validate) {
    return this.write(() => {
      const existing = this.room(id);
      if (existing) {
        if (existing.name !== name || existing.defaultBotId !== defaultBotId ||
          JSON.stringify(existing.members.map(member => member.botId)) !== JSON.stringify(botIds)) fail('BOT_GROUP_CONFLICT');
        return existing;
      }
      validate();
      this.db.prepare('INSERT INTO rooms VALUES (?, ?, ?, ?)').run(id, name, defaultBotId, timestamp());
      const add = this.db.prepare('INSERT INTO members VALUES (?, ?, ?, ?)');
      botIds.forEach((botId, position) => add.run(id, botId, 'session-' + randomUUID(), position));
      return this.room(id);
    });
  }

  post({id, roomId, text, botIds}, route) {
    return this.write(() => {
      const explicit = JSON.stringify(botIds);
      const existing = this.db.prepare(`SELECT id, seq, room_id AS roomId, text, explicit_bot_ids AS explicit
        FROM posts WHERE id=?`).get(id);
      if (existing) {
        if (existing.roomId !== roomId || existing.text !== text || existing.explicit !== explicit) fail('BOT_GROUP_CONFLICT');
        return {id, seq:existing.seq};
      }
      const targets = route();
      const result = this.db.prepare('INSERT INTO posts (id, room_id, text, explicit_bot_ids, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(id, roomId, text, explicit, timestamp());
      const seq = Number(result.lastInsertRowid);
      const add = this.db.prepare('INSERT INTO replies VALUES (?, ?, ?, ?, NULL, NULL, ?)');
      for (const target of targets) add.run(randomUUID(), seq, target.sessionId, 'queued', timestamp());
      return {id, seq};
    });
  }

  posts(roomId, {before = Number.MAX_SAFE_INTEGER, limit = 50} = {}) {
    const posts = this.db.prepare(`SELECT id, seq, text, created_at AS createdAt FROM posts
      WHERE room_id=? AND seq<? ORDER BY seq DESC LIMIT ?`).all(roomId, before, limit).reverse();
    return this.withReplies(posts);
  }

  withReplies(posts) {
    const loadReplies = this.db.prepare(`SELECT r.id, m.bot_id AS botId, r.session_id AS sessionId,
      r.state, r.text, r.reason, r.updated_at AS updatedAt FROM replies r JOIN members m USING (session_id)
      WHERE post_seq=? ORDER BY m.position`);
    return posts.map(post => ({...post, replies:loadReplies.all(post.seq)}));
  }

  history(roomId, {before = Number.MAX_SAFE_INTEGER, recentFrom, terms, references}) {
    if (!terms.length && !references.length) return [];
    const matches = this.db.prepare(`WITH needles AS (SELECT value AS term FROM json_each(?)),
      refs AS (SELECT value AS seq FROM json_each(?)),
      ranked AS (
        SELECT p.id, p.seq, p.text, p.created_at AS createdAt,
          p.seq IN (SELECT seq FROM refs) AS requested,
          CASE WHEN p.seq < ? THEN (SELECT count(*) FROM needles n WHERE
            instr(lower(p.text), n.term) > 0 OR EXISTS (
              SELECT 1 FROM replies r WHERE r.post_seq=p.seq AND r.state='completed' AND instr(lower(r.text),n.term) > 0
            )) ELSE 0 END AS score
        FROM posts p WHERE p.room_id=? AND p.seq<?
      )
      SELECT id, seq, text, createdAt FROM ranked WHERE requested OR score>0 ORDER BY requested DESC, score DESC, seq DESC LIMIT 4`)
      .all(JSON.stringify(terms), JSON.stringify(references), recentFrom, roomId, before);
    return this.withReplies(matches.sort((a,b) => a.seq-b.seq));
  }

  postText(roomId, seq) {
    return this.db.prepare('SELECT text FROM posts WHERE room_id=? AND seq=?').get(roomId, seq)?.text ?? '';
  }

  activeSeq(sessionId) {
    return this.db.prepare(`SELECT post_seq AS seq FROM replies WHERE session_id=?
      AND state IN ('starting', 'sent') ORDER BY post_seq LIMIT 1`).get(sessionId)?.seq;
  }

  pending() {
    return this.db.prepare(`SELECT r.id, r.post_seq AS postSeq, r.session_id AS sessionId,
      r.state, m.bot_id AS botId, p.text FROM replies r JOIN members m USING (session_id)
      JOIN posts p ON p.seq=r.post_seq WHERE r.state IN ('queued', 'starting', 'sent')
      ORDER BY r.post_seq, m.position`).all();
  }

  transition(id, from, to, {text=null, reason=null}={}) {
    return this.db.prepare('UPDATE replies SET state=?, text=?, reason=?, updated_at=? WHERE id=? AND state=?')
      .run(to, text, reason, timestamp(), id, from).changes === 1;
  }

  close() { this.db.close(); }
}
