const TURN_LIMIT = 3;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;
const USER_CHAR_LIMIT = 8_000;
const ANSWER_CHAR_LIMIT = 16_000;

// Mirrors the persisted context contract owned by UI lib/messages/contextParts.ts.
// Read only the fields needed for model context; malformed attached text fails
// this generation instead of silently dropping the user's comment.
const QUOTE_FIELDS = new Map([
  ['code-comment', 'code'], ['file-quote', 'quote'], ['chat-quote', 'quote'],
  ['browser-annotation', 'prompt'], ['pr-comment', 'body'], ['pr-check', 'output'],
  ['terminal', 'output'],
]);
const LINK_KINDS = new Set(['github-issue', 'github-pr', 'linear-issue']);

export function excerpt(text, limit) {
  if (text.length <= limit) return text;
  const marker = '\n[Content omitted]\n';
  if (limit <= marker.length) return text.slice(0, Math.max(0, limit));
  const head = Math.ceil((limit - marker.length) / 2);
  const tail = limit - marker.length - head;
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}

function attachedText(message) {
  const context = message.metadata?.openchamberContext;
  if (QUOTE_FIELDS.has(context?.kind)) {
    const source = (context[QUOTE_FIELDS.get(context.kind)] ?? '').trim();
    const authored = (context.text ?? '').trim();
    const label = excerpt((context.fileLabel ?? context.label ?? context.pageUrl ?? context.terminalLabel ?? '').trim(), 300);
    const location = Number.isInteger(context.startLine) ? `, lines ${context.startLine}-${context.endLine ?? context.startLine}` : '';
    const quote = excerpt(source, 4_000).split('\n').map((line) => `> ${line}`).join('\n');
    return { text: `Attached ${context.kind}${label ? ` (${label}${location})` : ''}:\n${quote}\n\nUser comment:\n${excerpt(authored, USER_CHAR_LIMIT)}`, authored };
  }
  if (LINK_KINDS.has(context?.kind)) return { text: excerpt(message.text ?? '', USER_CHAR_LIMIT), authored: '' };
  const comment = message.metadata?.opencodeComment;
  if (comment) {
    const authored = comment.comment.trim();
    const source = (comment.preview ?? '').trim();
    const label = excerpt((comment.path ?? '').trim(), 300);
    return { text: `Attached file context (${label}):\n${excerpt(source, 4_000)}\n\nUser comment:\n${excerpt(authored, USER_CHAR_LIMIT)}`, authored };
  }
  return null;
}

// Canonical HistoryPage records are chronological Message objects. Legacy
// service markers are still ignored when a provider exposes them, but they do
// not determine canonical turn completion.
const TRANSPARENT_TYPES = new Set(['agent-switched', 'model-switched', 'location-switched']);

function isTransparent(record) {
  if (record?.role === 'system') return true;
  if (record?.type === 'idle') return record.outcome === 'succeeded';
  return TRANSPARENT_TYPES.has(record?.type);
}

/** The newest conversation record in a chronological HistoryPage. */
export function newestContentId(records) {
  const list = Array.isArray(records) ? records : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const record = list[index];
    if (!record || isTransparent(record)) continue;
    const id = record.messageId || record.id;
    if (id) return id;
  }
  return null;
}


/** Read canonical Message text and derive completion from its Turn. */
function readMessage(message, completedTurnIds = new Set()) {
  const role = message.role || message.type;
  const blocks = [];
  const authored = [];
  const textParts = Array.isArray(message.parts)
    ? message.parts.filter((part) => part?.type === 'text' && typeof part.content === 'string')
    : Array.isArray(message.content)
      ? message.content.filter((part) => part?.type === 'text' && typeof (part.text ?? part.content) === 'string')
      : [];
  if (role === 'user' || role === 'synthetic') {
    const attached = attachedText(message);
    if (attached) { blocks.push(attached.text); authored.push(attached.authored); }
    else if (typeof message.text === 'string') { blocks.push(message.text); authored.push(message.text); }
    else if (textParts.length) { blocks.push(textParts.map((part) => part.content ?? part.text).join('\n\n')); authored.push(blocks[0]); }
  } else if (role === 'assistant') blocks.push(...textParts.map((part) => part.content ?? part.text));
  const completed = completedTurnIds.has(message.turnId)
    || (Number.isFinite(message.completedAt) && !message.error)
    || (message.finish === 'stop' && !message.error);
  return {
    id: message.messageId || message.id,
    role,
    created: Number.isFinite(message.createdAt) ? message.createdAt : message.time?.created ?? null,
    completed: Number.isFinite(message.completedAt) ? message.completedAt : null,
    transparent: role === 'system' || isTransparent(message),
    providerId: message.providerId || message.model?.providerID,
    modelId: message.modelId || message.model?.id,
    complete: role === 'assistant' && completed,
    text: excerpt(blocks.join('\n\n').trim(), role === 'user' ? USER_CHAR_LIMIT : ANSWER_CHAR_LIMIT),
    authored: excerpt(authored.filter(Boolean).join('\n\n').trim(), USER_CHAR_LIMIT),
  };
}

/**
 * A turn is one user message and the assistant reply that closes it. v2 dropped
 * `parentID`, so the boundary is positional: everything between two user
 * messages belongs to the turn the earlier one opened.
 *
 * Synthetic messages are the context the user attached to the message they are
 * about to send — v1 carried them as parts of that user message — so they are
 * folded into the next user message instead of opening a turn of their own.
 */
function collectTurns(messages, limit = TURN_LIMIT) {
  const turns = [];
  let active = null;
  let attached = [];
  for (const message of messages) {
    if (message.transparent) continue;
    if (message.role === 'synthetic') {
      if (message.text) attached.push(message);
      continue;
    }
    if (message.role === 'user') {
      const text = [...attached.map((entry) => entry.text), message.text].filter(Boolean).join('\n\n');
      const authored = [...attached.map((entry) => entry.authored), message.authored].filter(Boolean).join('\n\n');
      attached = [];
      if (!text) continue;
      active = { user: { ...message, text, authored }, assistant: null, complete: false };
      turns.push(active);
      continue;
    }
    attached = [];
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
  let messages = [];
  let cursor;
  const cursors = new Set();
  const ids = new Set();
  const completedTurnIds = new Set();
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal?.throwIfAborted();
    const page = await readPage({ limit: PAGE_SIZE, cursor });
    signal?.throwIfAborted();
    if (!Array.isArray(page?.messages)) throw new Error('Session history page is unavailable');
    for (const turn of Array.isArray(page.turns) ? page.turns : []) {
      if (turn.status === 'completed') completedTurnIds.add(turn.turnId);
    }
    const current = [];
    for (const record of page.messages) {
      const id = record?.messageId || record?.id;
      if (!id || ids.has(id)) continue;
      ids.add(id);
      current.push(readMessage(record, completedTurnIds));
    }
    messages = messages.concat(current);
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
  let messages = [];
  let cursor;
  const cursors = new Set();
  const ids = new Set();
  const completedTurnIds = new Set();
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal.throwIfAborted();
    const page = await readPage({ limit: PAGE_SIZE, cursor });
    signal.throwIfAborted();
    if (!Array.isArray(page?.messages)) throw new Error('Session message page is unavailable');
    for (const turn of Array.isArray(page.turns) ? page.turns : []) {
      if (turn.status === 'completed') completedTurnIds.add(turn.turnId);
    }
    const current = [];
    for (const record of page.messages) {
      const id = record?.messageId || record?.id;
      if (!id || ids.has(id)) continue;
      ids.add(id);
      current.push(readMessage(record, completedTurnIds));
    }
    messages = messages.concat(current);
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
