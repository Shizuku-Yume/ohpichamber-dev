import type { AssistMessage, AssistTurn } from './contracts.js';

const TURN_LIMIT = 3;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;
const USER_CHAR_LIMIT = 8_000;
const ANSWER_CHAR_LIMIT = 16_000;


export function excerpt(text, limit) {
  if (text.length <= limit) return text;
  const marker = '\n[Content omitted]\n';
  if (limit <= marker.length) return text.slice(0, Math.max(0, limit));
  const head = Math.ceil((limit - marker.length) / 2);
  const tail = limit - marker.length - head;
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}


function isTransparent(message) {
  return message.role === 'system';
}

/** The newest conversation record in a chronological HistoryPage. */
export function newestContentId(records) {
  const list = Array.isArray(records) ? records : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const record = list[index];
    if (!record || isTransparent(record)) continue;
    const id = record.messageId;
    if (id) return id;
  }
  return null;
}


/** Read canonical Message text and derive completion from its Turn. */
function readMessage(message, completedTurnIds: Set<string>): AssistMessage {
  const role = message.role;
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('\n\n')
    .trim();
  const complete = role === 'assistant' && completedTurnIds.has(message.turnId);
  return {
    id: message.messageId,
    role,
    created: message.createdAt,
    transparent: isTransparent(message),
    providerId: message.providerId,
    modelId: message.modelId,
    complete,
    text: excerpt(text, role === 'user' ? USER_CHAR_LIMIT : ANSWER_CHAR_LIMIT),
    authored: role === 'user' ? excerpt(text, USER_CHAR_LIMIT) : '',
  };
}

/** A turn is a user message followed by its assistant reply. */
function collectTurns(messages, limit = TURN_LIMIT): AssistTurn[] {
  const turns: AssistTurn[] = [];
  let active = null;
  for (const message of messages) {
    if (message.transparent) continue;
    if (message.role === 'user') {
      if (!message.text) continue;
      active = { user: message, assistant: null, complete: false };
      turns.push(active);
      continue;
    }
    if (!active || message.role !== 'assistant') continue;
    if (message.text) active.assistant = message;
    active.complete = message.complete && Boolean(message.text);
  }
  return turns.slice(-limit);
}

const settledTurns = (messages) => collectTurns(messages, Infinity)
  .filter((turn) => turn.complete)
  .slice(-TURN_LIMIT);

/**
 * The settled turns before a message that was just sent, oldest first: what a
 * classifier reads next to the new request. The newest records may already
 * hold that message (and nothing after it); a turn without a completed answer
 * is not settled and is left out. Failure is thrown; an empty list means the
 * session has no settled turn yet.
 */
export async function loadSettledTurns({ readPage, signal }) {
  let messages: AssistMessage[] = [];
  let cursor;
  const cursors = new Set();
  const ids = new Set();
  const completedTurnIds = new Set();
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal?.throwIfAborted();
    const page = await readPage({ limit: PAGE_SIZE, cursor });
    signal?.throwIfAborted();
    if (!Array.isArray(page?.messages) || !Array.isArray(page?.turns)) throw new Error('Session history page is unavailable');
    for (const turn of page.turns) {
      if (turn.status === 'completed') completedTurnIds.add(turn.turnId);
    }
    const current: AssistMessage[] = [];
    for (const record of page.messages) {
      const id = record.messageId;
      if (!id || ids.has(id)) continue;
      ids.add(id);
      current.push(readMessage(record, completedTurnIds));
    }
    messages = current.concat(messages);
    const settled = settledTurns(messages);
    const next = typeof page.nextCursor === 'string' ? page.nextCursor : null;
    if (settled.length === TURN_LIMIT || !next) return settled;
    if (cursors.has(next)) throw new Error('Session history pagination made no progress');
    cursors.add(next);
    cursor = next;
  }
  return settledTurns(messages);
}

/** Failure is thrown; null means no eligible final answer within bounded history. */
export async function loadAssistContext({ readPage, signal }) {
  let messages: AssistMessage[] = [];
  let cursor;
  const cursors = new Set();
  const ids = new Set();
  const completedTurnIds = new Set();
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal.throwIfAborted();
    const page = await readPage({ limit: PAGE_SIZE, cursor });
    if (!Array.isArray(page?.messages) || !Array.isArray(page?.turns)) throw new Error('Session history page is unavailable');
    for (const turn of page.turns) {
      if (turn.status === 'completed') completedTurnIds.add(turn.turnId);
    }
    const current: AssistMessage[] = [];
    for (const record of page.messages) {
      const id = record.messageId;
      if (!id || ids.has(id)) continue;
      ids.add(id);
      current.push(readMessage(record, completedTurnIds));
    }
    messages = current.concat(messages);
    const next = typeof page.nextCursor === 'string' ? page.nextCursor : null;
    const last = messages.findLast((message) => !message.transparent);
    if (!last) {
      if (!next || pageNumber === MAX_PAGES - 1) return null;
    } else {
      if (!last.complete || !last.text) {
        if (!next || pageNumber === MAX_PAGES - 1) return null;
      } else {
        const turns = collectTurns(messages);
        if (turns.length === TURN_LIMIT || !next || pageNumber === MAX_PAGES - 1) {
          if (!turns.at(-1)?.complete || turns.at(-1).assistant.id !== last.id) return null;
          return { turns, last };
        }
      }
    }
    if (cursors.has(next)) throw new Error('Session history pagination made no progress');
    cursors.add(next);
    cursor = next;
  }
  return null;
}
