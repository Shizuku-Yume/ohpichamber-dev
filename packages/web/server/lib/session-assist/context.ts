const TURN_LIMIT = 3;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;
const USER_CHAR_LIMIT = 8_000;
const ANSWER_CHAR_LIMIT = 16_000;

<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
// Mirrors the persisted context contract owned by UI lib/messages/contextParts.ts.
// Read only the fields needed for model context; malformed attached text fails
// this generation instead of silently dropping the user's comment.
const QUOTE_FIELDS = new Map([
  ['code-comment', 'code'], ['file-quote', 'quote'], ['chat-quote', 'quote'],
  ['browser-annotation', 'prompt'], ['pr-comment', 'body'], ['pr-check', 'output'],
  ['terminal', 'output'],
]);
// Linked items whose message text is the whole context: the current kinds
// (`repository-issue`, `repository-discussion`, `change-request`,
// `tracker-item`) and the legacy names older messages carry.
const LINK_KINDS = new Set([
  'repository-issue', 'repository-discussion', 'change-request', 'tracker-item', 'github-issue', 'github-pr', 'linear-issue',
]);
=======
const QUOTE_FIELDS = new Map([
  ['code-comment', 'code'], ['file-quote', 'quote'], ['chat-quote', 'quote'],
  ['browser-annotation', 'prompt'], ['pr-comment', 'body'], ['pr-check', 'output'],
  ['terminal', 'output'],
]);
const LINK_KINDS = new Set([
  'repository-issue', 'repository-discussion', 'change-request', 'tracker-item', 'github-issue', 'github-pr', 'linear-issue',
]);
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts

export function excerpt(text: string, limit: number) {
  if (text.length <= limit) return text;
  const marker = '\n[Content omitted]\n';
  if (limit <= marker.length) return text.slice(0, Math.max(0, limit));
  const head = Math.ceil((limit - marker.length) / 2);
  const tail = limit - marker.length - head;
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}

<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js

function isTransparent(message) {
  return message.role === 'system';
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
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
=======
type AssistRecord = Pick<SessionMessageAssistant, 'id' | 'metadata'> & {
  type: SessionMessagesResponse['data'][number]['type'];
  time?: { created?: number; completed?: number };
  outcome?: string;
  text?: string;
  model?: SessionMessageAssistant['model'];
  content?: ReadonlyArray<{ type: string; text?: string }>;
  snapshot?: SessionMessageAssistant['snapshot'];
  finish?: SessionMessageAssistant['finish'];
  error?: SessionMessageAssistant['error'];
};

export interface PageReader {
  readPage: (options: { limit: number; cursor: string | undefined }) => Promise<{
    data: readonly AssistRecord[];
    cursor?: SessionMessagesResponse['cursor'];
  }>;
  signal: AbortSignal;
}

const isAttachment = (value: JsonValue | undefined): value is { [key: string]: JsonValue; kind: string } =>
  isRecord(value) && isString(value.kind);

const isComment = (value: JsonValue): value is { comment?: JsonValue; preview?: JsonValue; path?: JsonValue } =>
  isRecord(value);

function trimAttachment(value: JsonValue | undefined) {
  if (!isString(value)) throw new TypeError('Attachment text must be a string');
  return value.trim();
}

function attachedText(message: AssistRecord) {
  const rawContext = message.metadata?.openchamberContext;
  const context = isAttachment(rawContext) ? rawContext : null;
  const field = context ? QUOTE_FIELDS.get(context.kind) : undefined;
  if (context && field !== undefined) {
    const source = trimAttachment(context[field] ?? '');
    const authored = trimAttachment(context.text ?? '');
    const label = excerpt(trimAttachment(context.fileLabel ?? context.label ?? context.pageUrl ?? context.terminalLabel ?? ''), 300);
    const location = Number.isInteger(context.startLine) ? `, lines ${context.startLine}-${context.endLine ?? context.startLine}` : '';
    const quote = excerpt(source, 4_000).split('\n').map((line) => `> ${line}`).join('\n');
    return { text: `Attached ${context.kind}${label ? ` (${label}${location})` : ''}:\n${quote}\n\nUser comment:\n${excerpt(authored, USER_CHAR_LIMIT)}`, authored };
  }
  if (context && LINK_KINDS.has(context.kind)) return { text: excerpt(message.text ?? '', USER_CHAR_LIMIT), authored: '' };
  const comment = message.metadata?.opencodeComment;
  if (comment) {
    if (!isComment(comment)) throw new TypeError('Attachment text must be a string');
    const authored = trimAttachment(comment.comment);
    const source = trimAttachment(comment.preview ?? '');
    const label = excerpt(trimAttachment(comment.path ?? ''), 300);
    return { text: `Attached file context (${label}):\n${excerpt(source, 4_000)}\n\nUser comment:\n${excerpt(authored, USER_CHAR_LIMIT)}`, authored };
  }
  return null;
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
}

<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
/** The newest conversation record in a chronological HistoryPage. */
export function newestContentId(records) {
  const list = Array.isArray(records) ? records : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const record = list[index];
    if (!record || isTransparent(record)) continue;
    const id = record.messageId;
    if (id) return id;
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
// Records OpenCode appends around a turn that carry no conversation content:
// the `idle` marker that closes every turn and the agent/model/location
// switches. They are invisible to turn boundaries and to "what is the newest
// message". An `idle` whose outcome is not `succeeded` is not transparent: it
// is the evidence that the turn failed or was interrupted.
const TRANSPARENT_TYPES = new Set(['agent-switched', 'model-switched', 'location-switched']);

function isTransparent(record) {
  if (record?.type === 'idle') return record.outcome === 'succeeded';
  return TRANSPARENT_TYPES.has(record?.type);
}

/**
 * The id of the newest record that is conversation content, given a page in
 * v2's newest-first order; null when the page holds only service records.
 * Both the assist reader and the pre-write re-check use it so they agree on
 * what "the last message" is.
 */
export function newestContentId(records) {
  for (const record of Array.isArray(records) ? records : []) {
    if (!record?.id || isTransparent(record)) continue;
    return record.id;
=======
const TRANSPARENT_TYPES = new Set(['agent-switched', 'model-switched', 'location-switched']);

function isTransparent(record: AssistRecord | undefined) {
  if (record?.type === 'idle') return record.outcome === 'succeeded';
  return record != null && TRANSPARENT_TYPES.has(record.type);
}

export function newestContentId(records: SessionMessagesResponse['data'] | undefined) {
  const page: SessionMessagesResponse['data'] = Array.isArray(records) ? records : [];
  for (const record of page) {
    if (!record?.id || isTransparent(record)) continue;
    return record.id;
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
  }
  return null;
}

<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
/**
 * v2 message records are flat: an assistant message carries `content[]`, a user
 * message a single `text` plus its attachments, and context items that used to
 * ride along as `synthetic` text parts are their own `synthetic` messages now.
 * Tool payloads never enter this view.
 */
function readMessage(message) {
  const role = message.type;
  const blocks = [];
  const authored = [];

  if (role === 'user') {
    const attached = attachedText(message);
    if (attached) {
      blocks.push(attached.text);
      authored.push(attached.authored);
    } else if (typeof message.text === 'string') {
      blocks.push(message.text);
      // Legacy terminal selections are source material, not a language sample.
      authored.push(message.text.replace(/\n*<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*$/, ''));
    }
  } else if (role === 'assistant') {
    for (const part of Array.isArray(message.content) ? message.content : []) {
      if (part?.type === 'text' && typeof part.text === 'string') blocks.push(part.text);
    }
  } else if (role === 'synthetic') {
    // Context the user attached to the message that follows: in v1 it was a
    // `synthetic` text part inside the user message, in v2 it is its own turn.
    const attached = attachedText(message);
    if (attached) {
      blocks.push(attached.text);
      authored.push(attached.authored);
    } else if (typeof message.text === 'string') {
      blocks.push(message.text);
    }
  }
=======
function readMessage(message: AssistRecord): AssistMessage {
  const role = message.type;
  const blocks = [];
  const authored = [];

  if (role === 'user') {
    const attached = attachedText(message);
    if (attached) {
      blocks.push(attached.text);
      authored.push(attached.authored);
    } else if (isString(message.text)) {
      blocks.push(message.text);
      authored.push(message.text.replace(/\n*<terminal_context>\n[\s\S]*?\n<\/terminal_context>\s*$/, ''));
    }
  } else if (role === 'assistant') {
    const content: NonNullable<AssistRecord['content']> = Array.isArray(message.content) ? message.content : [];
    for (const part of content) {
      if (part?.type === 'text' && isString(part.text)) blocks.push(part.text);
    }
  } else if (role === 'synthetic') {
    const attached = attachedText(message);
    if (attached) {
      blocks.push(attached.text);
      authored.push(attached.authored);
    } else if (isString(message.text)) {
      blocks.push(message.text);
    }
  }
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts

/** Read canonical Message text and derive completion from its Turn. */
function readMessage(message, completedTurnIds) {
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
<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
    created: message.createdAt,
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
    created: Number.isFinite(message.time?.created) ? message.time.created : null,
    completed: Number.isFinite(message.time?.completed) ? message.time.completed : null,
=======
    created: Number.isFinite(message.time?.created) ? message.time?.created ?? null : null,
    completed: Number.isFinite(message.time?.completed) ? message.time?.completed ?? null : null,
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
    transparent: isTransparent(message),
<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
    providerId: message.providerId,
    modelId: message.modelId,
    complete,
    text: excerpt(text, role === 'user' ? USER_CHAR_LIMIT : ANSWER_CHAR_LIMIT),
    authored: role === 'user' ? excerpt(text, USER_CHAR_LIMIT) : '',
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
    // v2 has no `parentID` on a message: a turn is the run of messages between
    // one user message and the assistant reply that follows it, which is what
    // `collectTurns` walks.
    providerID: message.model?.providerID,
    modelID: message.model?.id,
    complete: role === 'assistant'
      && message.finish === 'stop'
      && Boolean(message.time?.completed)
      && !message.error,
    text: excerpt(blocks.join('\n\n').trim(), role === 'user' ? USER_CHAR_LIMIT : ANSWER_CHAR_LIMIT),
    authored: excerpt(authored.filter(Boolean).join('\n\n').trim(), USER_CHAR_LIMIT),
=======
    providerID: message.model?.providerID,
    modelID: message.model?.id,
    snapshotFiles: role === 'assistant' && Array.isArray(message.snapshot?.files) ? message.snapshot.files : null,
    complete: role === 'assistant'
      && message.finish === 'stop'
      && Boolean(message.time?.completed)
      && !message.error,
    text: excerpt(blocks.join('\n\n').trim(), role === 'user' ? USER_CHAR_LIMIT : ANSWER_CHAR_LIMIT),
    authored: excerpt(authored.filter(Boolean).join('\n\n').trim(), USER_CHAR_LIMIT),
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
  };
}

<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
/** A turn is a user message followed by its assistant reply. */
function collectTurns(messages, limit = TURN_LIMIT) {
  const turns = [];
  let active = null;
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
/**
 * A turn is one user message and the assistant reply that closes it. v2 dropped
 * `parentID`, so the boundary is positional: everything between two user
 * messages belongs to the turn the earlier one opened.
 *
 * Synthetic messages are the context the user attached to the message they are
 * about to send — v1 carried them as parts of that user message — so they are
 * folded into the next user message instead of opening a turn of their own.
 */
function collectTurns(messages) {
  const turns = [];
  let active = null;
  let attached = [];
=======
function collectTurns(messages: AssistMessage[]) {
  const turns: AssistTurn[] = [];
  let active: AssistTurn | null = null;
  let attached: AssistMessage[] = [];
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
  for (const message of messages) {
    if (message.transparent) continue;
    if (message.role === 'user') {
<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
      if (!message.text) continue;
      active = { user: message, assistant: null, complete: false };
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
      const text = [...attached.map((entry) => entry.text), message.text].filter(Boolean).join('\n\n');
      const authored = [...attached.map((entry) => entry.authored), message.authored].filter(Boolean).join('\n\n');
      attached = [];
      if (!text) continue;
      active = { user: { ...message, text, authored }, assistant: null, complete: false };
=======
      const text = [...attached.map((entry) => entry.text), message.text].filter(Boolean).join('\n\n');
      const authored = [...attached.map((entry) => entry.authored), message.authored].filter(Boolean).join('\n\n');
      attached = [];
      if (!text) continue;
      active = { user: { ...message, text, authored }, assistant: null, complete: false, changedFiles: null };
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
      turns.push(active);
      continue;
    }
    if (!active || message.role !== 'assistant') continue;
    if (message.snapshotFiles) active.changedFiles = new Set([...(active.changedFiles ?? []), ...message.snapshotFiles]);
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
    if (!Array.isArray(page?.messages) || !Array.isArray(page?.turns)) throw new Error('Session history page is unavailable');
    for (const turn of page.turns) {
      if (turn.status === 'completed') completedTurnIds.add(turn.turnId);
    }
    const current = [];
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

<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
/** Failure is thrown; null means no eligible final answer within bounded history. */
export async function loadAssistContext({ readPage, signal }) {
  let messages = [];
  let cursor;
  const cursors = new Set();
  const ids = new Set();
  const completedTurnIds = new Set();
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
/** Failure is thrown; null means no eligible final answer within bounded history. */
export async function loadAssistContext({ readPage, signal }) {
  let messages = [];
  let cursor;
  const cursors = new Set();
  const ids = new Set();
=======
function hasCompletedTail(turns: AssistTurn[], last: AssistMessage): turns is CompletedAssistTurns {
  const finalTurn = turns.at(-1);
  return finalTurn?.complete === true && finalTurn.assistant?.id === last.id;
}

export async function loadAssistContext({ readPage, signal }: PageReader): Promise<AssistContext | null> {
  let messages: AssistMessage[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  const ids = new Set<string>();
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal.throwIfAborted();
    const page = await readPage({ limit: PAGE_SIZE, cursor });
<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
    if (!Array.isArray(page?.messages) || !Array.isArray(page?.turns)) throw new Error('Session history page is unavailable');
    for (const turn of page.turns) {
      if (turn.status === 'completed') completedTurnIds.add(turn.turnId);
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
    signal.throwIfAborted();
    if (!Array.isArray(page?.data)) throw new Error('Session message page is unavailable');
    const older = [];
    for (const record of page.data) {
      if (!record?.id || ids.has(record.id)) continue;
      ids.add(record.id);
      older.push(readMessage(record));
=======
    signal.throwIfAborted();
    if (!Array.isArray(page?.data)) throw new Error('Session message page is unavailable');
    const older: AssistMessage[] = [];
    const records: readonly AssistRecord[] = page.data;
    for (const record of records) {
      if (!record?.id || ids.has(record.id)) continue;
      ids.add(record.id);
      older.push(readMessage(record));
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
    }
<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
    const current = [];
    for (const record of page.messages) {
      const id = record.messageId;
      if (!id || ids.has(id)) continue;
      ids.add(id);
      current.push(readMessage(record, completedTurnIds));
    }
    messages = current.concat(messages);
    const next = typeof page.nextCursor === 'string' ? page.nextCursor : null;
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
    older.reverse();
    messages = older.concat(messages);
    const next = typeof page.cursor?.next === 'string' ? page.cursor.next : null;
    // A successful turn ends with an `idle` marker after the answer; look past
    // it and its siblings to the newest content record.
=======
    older.reverse();
    messages = older.concat(messages);
    const next = isString(page.cursor?.next) ? page.cursor.next : null;
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
    const last = messages.findLast((message) => !message.transparent);
    if (!last) {
      if (!next || pageNumber === MAX_PAGES - 1) return null;
    } else {
<<<<<<< HEAD:packages/web/server/lib/session-assist/context.js
      if (!last.complete || !last.text) {
        if (!next || pageNumber === MAX_PAGES - 1) return null;
      } else {
        const turns = collectTurns(messages);
        if (turns.length === TURN_LIMIT || !next || pageNumber === MAX_PAGES - 1) {
          if (!turns.at(-1)?.complete || turns.at(-1).assistant.id !== last.id) return null;
          return { turns, last };
        }
||||||| bc50ba56aa:packages/web/server/lib/session-assist/context.js
      if (!last.complete || !last.text) return null;
      const turns = collectTurns(messages);
      if (turns.length === TURN_LIMIT || !next || pageNumber === MAX_PAGES - 1) {
        if (!turns.at(-1)?.complete || turns.at(-1).assistant.id !== last.id) return null;
        return { turns, last };
=======
      if (!last.complete || !last.text) return null;
      const turns = collectTurns(messages);
      if (turns.length === TURN_LIMIT || !next || pageNumber === MAX_PAGES - 1) {
        if (!hasCompletedTail(turns, last)) return null;
        return { turns, last };
>>>>>>> upstream/main:packages/web/server/lib/session-assist/context.ts
      }
    }
    if (cursors.has(next)) throw new Error('Session history pagination made no progress');
    cursors.add(next);
    cursor = next;
  }
  return null;
}
import type { JsonValue, SessionMessageAssistant, SessionMessagesResponse } from '@opencode/client';
import { isRecord, isString } from '../shared/guards.js';
import type { AssistContext, AssistMessage, AssistTurn, CompletedAssistTurns } from './contracts.js';
