import { isString } from '../shared/guards.js';
import type { AssistContext, AssistMessage, AssistTurn } from './contracts.js';

const TURN_LIMIT = 3;
const PAGE_SIZE = 50;
const MAX_PAGES = 8;
const USER_CHAR_LIMIT = 8_000;
const ANSWER_CHAR_LIMIT = 16_000;

export interface AssistSourcePart {
  type: string;
  content?: string | undefined;
}

export interface AssistSourceMessage {
  messageId: string;
  turnId: string;
  role: string;
  createdAt: number | null;
  providerId?: string | undefined;
  modelId?: string | undefined;
  parts: AssistSourcePart[];
}

export interface AssistSourceTurn {
  turnId: string;
  status: string;
}

export interface AssistHistoryPage {
  turns: AssistSourceTurn[];
  messages: AssistSourceMessage[];
  nextCursor?: string | null;
}

export interface AssistReadPageParams {
  limit: number;
  cursor?: string;
}

export interface LoadSettledTurnsOptions {
  readPage: (params: AssistReadPageParams) => Promise<AssistHistoryPage>;
  signal?: AbortSignal | undefined;
}

export interface LoadAssistContextOptions {
  readPage: (params: AssistReadPageParams) => Promise<AssistHistoryPage>;
  signal: AbortSignal;
}

export function excerpt(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const marker = '\n[Content omitted]\n';
  if (limit <= marker.length) return text.slice(0, Math.max(0, limit));
  const head = Math.ceil((limit - marker.length) / 2);
  const tail = limit - marker.length - head;
  return text.slice(0, head) + marker + (tail > 0 ? text.slice(-tail) : '');
}

function isTransparent(message: { role: string }): boolean {
  return message.role === 'system';
}

export function newestContentId(records: ReadonlyArray<{ messageId: string; role: string }> | null | undefined): string | null {
  const list = Array.isArray(records) ? records : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const record = list[index];
    if (!record || isTransparent(record)) continue;
    const id = record.messageId;
    if (id) return id;
  }
  return null;
}

const isTextPart = (part: AssistSourcePart): part is { type: 'text'; content: string } =>
  part.type === 'text' && typeof part.content === 'string';

function readMessage(message: AssistSourceMessage, completedTurnIds: Set<string>): AssistMessage {
  const role = message.role;
  const text = message.parts
    .filter(isTextPart)
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

function collectTurns(messages: AssistMessage[], limit = TURN_LIMIT): AssistTurn[] {
  const turns: AssistTurn[] = [];
  let active: AssistTurn | null = null;
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

const settledTurns = (messages: AssistMessage[]): AssistTurn[] => collectTurns(messages, Infinity)
  .filter((turn) => turn.complete)
  .slice(-TURN_LIMIT);

export async function loadSettledTurns({ readPage, signal }: LoadSettledTurnsOptions): Promise<AssistTurn[]> {
  let messages: AssistMessage[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  const ids = new Set<string>();
  const completedTurnIds = new Set<string>();
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal?.throwIfAborted();
    const page = await readPage(cursor !== undefined ? { limit: PAGE_SIZE, cursor } : { limit: PAGE_SIZE });
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
    const next = isString(page.nextCursor) ? page.nextCursor : null;
    if (settled.length === TURN_LIMIT || !next) return settled;
    if (cursors.has(next)) throw new Error('Session history pagination made no progress');
    cursors.add(next);
    cursor = next;
  }
  return settledTurns(messages);
}

export async function loadAssistContext({ readPage, signal }: LoadAssistContextOptions): Promise<AssistContext | null> {
  let messages: AssistMessage[] = [];
  let cursor: string | undefined;
  const cursors = new Set<string>();
  const ids = new Set<string>();
  const completedTurnIds = new Set<string>();
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    signal.throwIfAborted();
    const page = await readPage(cursor !== undefined ? { limit: PAGE_SIZE, cursor } : { limit: PAGE_SIZE });
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
    const next = isString(page.nextCursor) ? page.nextCursor : null;
    const last = messages.findLast((message) => !message.transparent);
    if (!last) {
      if (!next || pageNumber === MAX_PAGES - 1) return null;
    } else if (!last.complete || !last.text) {
      if (!next || pageNumber === MAX_PAGES - 1) return null;
    } else {
      const turns = collectTurns(messages);
      if (turns.length === TURN_LIMIT || !next || pageNumber === MAX_PAGES - 1) {
        const lastTurn = turns.at(-1);
        if (!lastTurn?.complete || lastTurn.assistant?.id !== last.id) return null;
        return { turns, last };
      }
    }
    if (!next) return null;
    if (cursors.has(next)) throw new Error('Session history pagination made no progress');
    cursors.add(next);
    cursor = next;
  }
  return null;
}
