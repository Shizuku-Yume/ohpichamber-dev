import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
import { isString } from '../shared/object-guards.js';
import type { SqliteConnection } from './sqlite.js';

export interface ArchiveSnapshot {
  entries: Record<string, { archivedAt: number | null }>;
  errors: Record<string, string>;
  conversion?: { code?: string };
}

export interface StagedMessageRow {
  id: string;
  messageId?: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'reasoning';
  createdAt: number;
  text: string;
}

export interface CommitSessionSyncInput {
  id: string;
  directory: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  includeReasoning: boolean;
  archivedAt?: number | null;
  lifecycleKnown?: boolean;
}

export interface StoreSearchInput {
  match: string;
  sessionId?: string | null | undefined;
  directories?: string[] | undefined;
  role?: 'user' | 'assistant' | 'reasoning' | null | undefined;
  includeReasoning?: boolean | undefined;
  lifecycle?: 'active' | 'archived' | 'all' | undefined;
  before?: { createdAt: number; id: string } | null | undefined;
  limit: number;
  order?: 'asc' | 'desc' | undefined;
}

export interface StoreSearchSessionsInput {
  match: string;
  directories?: string[] | undefined;
  role?: 'user' | 'assistant' | 'reasoning' | null | undefined;
  includeReasoning?: boolean | undefined;
  lifecycle?: 'active' | 'archived' | 'all' | undefined;
  before?: { createdAt: number; sessionId: string } | null | undefined;
  limit: number;
  exclude?: string[] | undefined;
  withTotals?: boolean | undefined;
}

export interface SessionSearchTotals {
  sessions: number;
  byDirectory: Record<string, number>;
}

export type SqliteRow = Record<string, SQLOutputValue>;

export interface StoreSessionSearchHit extends SqliteRow {
  sessionId: SQLOutputValue;
  matchCount: number;
}

export interface StoreSearchSessionsResult {
  hits: StoreSessionSearchHit[];
  totals: SessionSearchTotals | null;
}

export interface StoreCounts {
  sessions: number;
  messages: number;
}

export interface MessageSearchStore {
  readSession: (sessionId: string) => SqliteRow | null;
  applyArchiveSnapshot: (snapshot: ArchiveSnapshot) => void;
  renameSession: (sessionId: string, title: string) => void;
  moveSession: (sessionId: string, directory: string) => void;
  deleteSession: (sessionId: string) => void;
  beginSessionSync: () => void;
  stageMessages: (rows: StagedMessageRow[]) => void;
  commitSessionSync: (input: CommitSessionSyncInput) => void;
  readMeta: (key: string) => string | null;
  writeMeta: (key: string, value: string) => void;
  deleteRole: (role: string) => void;
  rereadAssistantRecords: () => void;
  sessionIds: () => string[];
  counts: () => StoreCounts;
  search: (input: StoreSearchInput) => SqliteRow[];
  searchSessions: (input: StoreSearchSessionsInput) => StoreSearchSessionsResult;
  close: () => void;
}

const GROUPED_TOTALS_ROW_CAP = 20000;

function isBigInt(value: SQLOutputValue): value is bigint {
  return typeof value === 'bigint';
}

function sessionIdAtOrAfter(value: SQLOutputValue, cursor: string): boolean {
  if (isString(value) || value instanceof Uint8Array) {
    return String(value) >= cursor;
  }
  if (isBigInt(value)) {
    try {
      return value >= BigInt(cursor);
    } catch {
      return false;
    }
  }
  return Number(value) >= Number(cursor);
}

const MESSAGE_SEARCH_SCHEMA_VERSION = '5';
const MATCH_START = '';
const MATCH_END = '';
const MIN_TERM_LENGTH = 3;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    directory TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    synced_updated_at INTEGER,
    archived_at INTEGER,
    lifecycle_known INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    message_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    text TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_by_session ON messages (session_id, created_at);
  CREATE INDEX IF NOT EXISTS messages_by_created ON messages (created_at DESC, session_id DESC, id DESC);
  CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
    text, content='messages', content_rowid='seq', tokenize='trigram'
  );
  CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
    INSERT INTO messages_fts (rowid, text) VALUES (new.seq, new.text);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, text) VALUES ('delete', old.seq, old.text);
  END;
  CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE OF text ON messages BEGIN
    INSERT INTO messages_fts (messages_fts, rowid, text) VALUES ('delete', old.seq, old.text);
    INSERT INTO messages_fts (rowid, text) VALUES (new.seq, new.text);
  END;
`;

const DROP = `
  DROP TRIGGER IF EXISTS messages_ai;
  DROP TRIGGER IF EXISTS messages_ad;
  DROP TRIGGER IF EXISTS messages_au;
  DROP TABLE IF EXISTS messages_fts;
  DROP TABLE IF EXISTS messages;
  DROP TABLE IF EXISTS sessions;
  DROP TABLE IF EXISTS meta;
`;

const characterLength = (value: string): number => Array.from(value).length;

export const toSearchTerms = (query: string | null | undefined): string[] => String(query ?? '')
  .trim()
  .split(/\s+/)
  .filter((term) => characterLength(term) >= MIN_TERM_LENGTH);

export const toMatchExpression = (query: string | null | undefined): string | null => {
  const terms = toSearchTerms(query);
  if (terms.length === 0) return null;
  return terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' AND ');
};

const SNIPPET_RADIUS = 90;

export const buildSnippet = (text: string, terms: string[], radius = SNIPPET_RADIUS): string => {
  const lower = text.toLowerCase();
  if (lower.length !== text.length) return text.slice(0, radius * 2);
  const ranges: Array<[number, number]> = [];
  for (const term of terms) {
    const needle = term.toLowerCase();
    for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + needle.length)) {
      ranges.push([at, at + needle.length]);
    }
  }
  if (ranges.length === 0) return text.slice(0, radius * 2);
  ranges.sort((left, right) => left[0] - right[0]);
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1]) previous[1] = Math.max(previous[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  const firstRange = merged[0];
  if (!firstRange) return text.slice(0, radius * 2);
  const longest = terms.reduce((best, term) => (term.length > best.length ? term : best), '').toLowerCase();
  const anchorAt = lower.indexOf(longest);
  const anchor = merged.find(([from, to]) => from <= anchorAt && anchorAt < to) ?? firstRange;
  let start = Math.max(0, anchor[0] - radius);
  let end = Math.min(text.length, anchor[1] + radius);
  if (start > 0) {
    const space = text.lastIndexOf(' ', anchor[0]);
    if (space > start) start = space + 1;
  }
  if (end < text.length) {
    const space = text.indexOf(' ', end);
    if (space >= 0 && space - end < 20) end = space;
  }
  let out = start > 0 ? '…' : '';
  let cursor = start;
  for (const [from, to] of merged) {
    if (to <= start || from >= end) continue;
    out += text.slice(cursor, Math.max(cursor, from)) + MATCH_START + text.slice(Math.max(from, cursor), Math.min(to, end)) + MATCH_END;
    cursor = Math.min(to, end);
  }
  out += text.slice(cursor, end) + (end < text.length ? '…' : '');
  return out.replace(/\s+/g, ' ');
};

export const openMessageSearchStore = (connection: SqliteConnection): MessageSearchStore => {
  const version = (() => {
    try {
      return connection.get('SELECT value FROM meta WHERE key = ?', ['schema'])?.value ?? null;
    } catch {
      return null;
    }
  })();
  connection.exec('PRAGMA journal_mode = WAL');
  connection.transaction(() => {
    if (version !== MESSAGE_SEARCH_SCHEMA_VERSION) connection.exec(DROP);
    connection.exec(SCHEMA);
    connection.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', ['schema', MESSAGE_SEARCH_SCHEMA_VERSION]);
  });

  const readSession = (sessionId: string): SqliteRow | null => connection.get(
    'SELECT id, directory, title, synced_updated_at, archived_at, lifecycle_known FROM sessions WHERE id = ?',
    [sessionId],
  );

  return {
    readSession,
    applyArchiveSnapshot: ({ entries, errors, conversion = {} }: ArchiveSnapshot) => connection.transaction(() => {
      connection.run('UPDATE sessions SET lifecycle_known = ?', [conversion.code ? 0 : 1]);
      for (const id of Object.keys(errors)) connection.run('UPDATE sessions SET lifecycle_known = 0 WHERE id = ?', [id]);
      connection.run('UPDATE sessions SET archived_at = NULL WHERE lifecycle_known = 1');
      for (const [id, state] of Object.entries(entries)) {
        connection.run('UPDATE sessions SET archived_at = ?, lifecycle_known = 1 WHERE id = ?', [state.archivedAt, id]);
      }
    }),

    renameSession: (sessionId: string, title: string) => {
      connection.run('UPDATE sessions SET title = ? WHERE id = ?', [title, sessionId]);
    },

    moveSession: (sessionId: string, directory: string) => {
      connection.run('UPDATE sessions SET directory = ? WHERE id = ?', [directory, sessionId]);
    },

    deleteSession: (sessionId: string) => {
      connection.transaction(() => {
        connection.run('DELETE FROM messages WHERE session_id = ?', [sessionId]);
        connection.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
      });
    },

    beginSessionSync: () => {
      connection.exec(`CREATE TEMP TABLE IF NOT EXISTS staged_messages (
        id TEXT PRIMARY KEY, message_id TEXT NOT NULL, session_id TEXT NOT NULL,
        role TEXT NOT NULL, created_at INTEGER NOT NULL, text TEXT NOT NULL
      ); DELETE FROM staged_messages;`);
    },
    stageMessages: (rows: StagedMessageRow[]) => connection.transaction(() => {
      for (const row of rows) connection.run(
        'INSERT OR REPLACE INTO staged_messages VALUES (?, ?, ?, ?, ?, ?)',
        [row.id, row.messageId ?? row.id, row.sessionId, row.role, row.createdAt, row.text],
      );
    }),
    commitSessionSync: ({ id, directory, title, createdAt, updatedAt, includeReasoning, archivedAt = null, lifecycleKnown = false }: CommitSessionSyncInput) => connection.transaction(() => {
      if (!includeReasoning) connection.exec("DELETE FROM staged_messages WHERE role = 'reasoning'");
      connection.run(`INSERT INTO sessions (id, directory, title, created_at, synced_updated_at, archived_at, lifecycle_known)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET directory=excluded.directory,
        title=excluded.title, synced_updated_at=excluded.synced_updated_at,
        archived_at=excluded.archived_at, lifecycle_known=excluded.lifecycle_known`,
        [id, directory, title, createdAt, updatedAt, archivedAt, lifecycleKnown ? 1 : 0]);
      connection.run('DELETE FROM messages WHERE session_id = ? AND id NOT IN (SELECT id FROM staged_messages)', [id]);
      connection.run(`INSERT INTO messages (id, message_id, session_id, role, created_at, text)
        SELECT id, message_id, session_id, role, created_at, text FROM staged_messages WHERE true
        ON CONFLICT (id) DO UPDATE SET text=excluded.text WHERE text <> excluded.text`);
      connection.exec('DELETE FROM staged_messages');
    }),

    readMeta: (key: string): string | null => {
      const value = connection.get('SELECT value FROM meta WHERE key = ?', [key])?.value;
      return isString(value) ? value : null;
    },

    writeMeta: (key: string, value: string) => {
      connection.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
    },

    deleteRole: (role: string) => {
      connection.run('DELETE FROM messages WHERE role = ?', [role]);
    },

    rereadAssistantRecords: () => {
      connection.run('UPDATE sessions SET synced_updated_at = NULL');
    },

    sessionIds: (): string[] => connection.all('SELECT id FROM sessions').map((row) => String(row.id ?? '')),

    counts: (): StoreCounts => ({
      sessions: Number(connection.get('SELECT count(*) AS n FROM sessions')?.n ?? 0),
      messages: Number(connection.get('SELECT count(*) AS n FROM messages')?.n ?? 0),
    }),

    search: ({ match, sessionId = null, directories = [], role = null, includeReasoning = true, lifecycle = 'all', before = null, limit, order = 'desc' }: StoreSearchInput): SqliteRow[] => {
      const where = ['messages_fts MATCH ?'];
      const params: SQLInputValue[] = [match];
      if (sessionId) {
        where.push('m.session_id = ?');
        params.push(sessionId);
      }
      if (directories.length > 0) {
        where.push(`s.directory IN (${directories.map(() => '?').join(', ')})`);
        params.push(...directories);
      }
      if (role) {
        where.push('m.role = ?');
        params.push(role);
      }
      if (!includeReasoning) where.push("m.role <> 'reasoning'");
      if (lifecycle === 'active') where.push('s.lifecycle_known = 1 AND s.archived_at IS NULL');
      if (lifecycle === 'archived') where.push('s.lifecycle_known = 1 AND s.archived_at IS NOT NULL');
      if (before) {
        where.push(order === 'desc' ? '(m.created_at < ? OR (m.created_at = ? AND m.id < ?))' : '(m.created_at > ? OR (m.created_at = ? AND m.id > ?))');
        params.push(before.createdAt, before.createdAt, before.id);
      }
      const direction = order === 'desc' ? 'DESC' : 'ASC';
      params.push(limit);
      return connection.all(`SELECT m.id AS rowId, m.message_id AS id, m.session_id AS sessionId, m.role AS role, m.created_at AS createdAt,
                s.title AS sessionTitle, s.directory AS directory, s.archived_at AS archivedAt, m.text AS text
         FROM messages_fts
         JOIN messages m ON m.seq = messages_fts.rowid
         JOIN sessions s ON s.id = m.session_id
         WHERE ${where.join(' AND ')}
         ORDER BY m.created_at ${direction}, m.id ${direction}
         LIMIT ?`, params);
    },

    searchSessions: ({ match, directories = [], role = null, includeReasoning = true, lifecycle = 'all', before = null, limit, exclude = [], withTotals = false }: StoreSearchSessionsInput): StoreSearchSessionsResult => {
      const filters: string[] = [];
      const filterParams: SQLInputValue[] = [];
      if (directories.length > 0) {
        filters.push(`s.directory IN (${directories.map(() => '?').join(', ')})`);
        filterParams.push(...directories);
      }
      if (role) {
        filters.push('m.role = ?');
        filterParams.push(role);
      }
      if (!includeReasoning) filters.push("m.role <> 'reasoning'");
      if (lifecycle === 'active') filters.push('s.lifecycle_known = 1 AND s.archived_at IS NULL');
      if (lifecycle === 'archived') filters.push('s.lifecycle_known = 1 AND s.archived_at IS NOT NULL');
      const filterSql = filters.length > 0 ? ` AND ${filters.join(' AND ')}` : '';
      const orderedMatches = `SELECT m.id AS rowId, m.message_id AS messageId, m.session_id AS sessionId, m.role, m.created_at AS createdAt, m.text, s.title AS sessionTitle, s.directory, s.archived_at AS archivedAt
       FROM messages AS m INDEXED BY messages_by_created
       JOIN sessions s ON s.id = m.session_id
       WHERE m.seq IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)${filterSql}
       ORDER BY m.created_at DESC, m.session_id DESC, m.id DESC`;
      const pageHits: Array<{ row: SqliteRow; sessionId: SQLOutputValue }> = [];
      const representedSessions = new Set<SQLOutputValue>();
      for (const row of connection.iterate(orderedMatches, [match, ...filterParams])) {
        if (row.sessionId === undefined) throw new TypeError('Missing sessionId column in search index');
        if (representedSessions.has(row.sessionId)) continue;
        representedSessions.add(row.sessionId);
        const createdAt = row.createdAt ?? 0;
        const isAfterCursor = before && ((isBigInt(createdAt) ? createdAt > before.createdAt : Number(createdAt) > before.createdAt) || createdAt === before.createdAt && sessionIdAtOrAfter(row.sessionId, before.sessionId));
        if (isAfterCursor) continue;
        pageHits.push({ row, sessionId: row.sessionId });
        if (pageHits.length === limit) break;
      }
      const pageIds = pageHits.map((hit) => hit.sessionId);
      const counts = new Map<SQLOutputValue, number>();
      if (pageIds.length > 0) {
        const messageFilters: string[] = [];
        const messageFilterParams: SQLInputValue[] = [];
        if (role) {
          messageFilters.push('m.role = ?');
          messageFilterParams.push(role);
        }
        if (!includeReasoning) messageFilters.push("m.role <> 'reasoning'");
        const messageFilterSql = messageFilters.length > 0 ? ` AND ${messageFilters.join(' AND ')}` : '';
        const rows = connection.all(`SELECT m.session_id AS sessionId, count(DISTINCT m.message_id) AS matchCount
          FROM messages AS m INDEXED BY messages_by_session
          WHERE m.session_id IN (${pageIds.map(() => '?').join(', ')})
            AND m.seq IN (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ?)${messageFilterSql}
          GROUP BY m.session_id`, [...pageIds, match, ...messageFilterParams]);
        for (const row of rows) {
          if (row.sessionId !== undefined) counts.set(row.sessionId, Number(row.matchCount ?? 0));
        }
      }
      const hits: StoreSessionSearchHit[] = pageHits.map(({ row, sessionId }) => ({
        ...row,
        sessionId,
        matchCount: counts.get(sessionId) ?? 0,
      }));
      let totals: SessionSearchTotals | null = null;
      if (withTotals) {
        const totalsFilters = ['messages_fts MATCH ?'];
        const totalsParams: SQLInputValue[] = [match];
        if (role) {
          totalsFilters.push('m.role = ?');
          totalsParams.push(role);
        }
        if (!includeReasoning) totalsFilters.push("m.role <> 'reasoning'");
        const needsSessionFilter = directories.length > 0 || lifecycle !== 'all';
        if (directories.length > 0) {
          totalsFilters.push(`s.directory IN (${directories.map(() => '?').join(', ')})`);
          totalsParams.push(...directories);
        }
        if (lifecycle === 'active') totalsFilters.push('s.lifecycle_known = 1 AND s.archived_at IS NULL');
        if (lifecycle === 'archived') totalsFilters.push('s.lifecycle_known = 1 AND s.archived_at IS NOT NULL');
        const sessionJoin = needsSessionFilter ? ' JOIN sessions s ON s.id = m.session_id' : '';
        const matchedSessionIds = new Set<SQLOutputValue>();
        let rowCount = 0;
        for (const row of connection.iterate(`SELECT m.session_id AS sessionId FROM messages_fts JOIN messages m ON m.seq = messages_fts.rowid${sessionJoin}
          WHERE ${totalsFilters.join(' AND ')} LIMIT ?`, [...totalsParams, GROUPED_TOTALS_ROW_CAP])) {
          if (row.sessionId === undefined) throw new TypeError('Missing sessionId column in search index');
          rowCount += 1;
          matchedSessionIds.add(row.sessionId);
        }
        if (rowCount < GROUPED_TOTALS_ROW_CAP) {
          for (const sessionId of exclude) matchedSessionIds.delete(sessionId);
          const byDirectory: Record<string, number> = {};
          const matchedIds = [...matchedSessionIds];
          for (let offset = 0; offset < matchedIds.length; offset += 500) {
            const chunk = matchedIds.slice(offset, offset + 500);
            const sessionRows = connection.all(`SELECT directory FROM sessions WHERE id IN (${chunk.map(() => '?').join(', ')})`, chunk);
            for (const row of sessionRows) {
              const directory = String(row.directory);
              byDirectory[directory] = (byDirectory[directory] ?? 0) + 1;
            }
          }
          totals = { sessions: matchedSessionIds.size, byDirectory };
        }
      }
      return { hits, totals };
    },

    close: () => connection.close(),
  };
};
