import { canonicalClient } from '@/api/canonicalClient';
import type { Message, ModelSelection, PromptAttachment, Turn, TurnStatus } from '@openchamber/agent-contract';
import { getGitStatus } from '@/lib/gitApi';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { omitKeys } from '@/lib/omitKeys';

export type LanePrompt = {
  messageId: string;
  turnId: string;
  text: string;
  files: PromptAttachment[];
};

export type LaneDiffStat = {
  files: number;
  insertions: number;
  deletions: number;
};

const messageText = (message: Message): string => message.parts
  .filter((part) => part.type === 'text').map((part) => part.content).join('\n');

/** Native pages are chronological; continue until the first user prompt is found. */
export async function loadLaneFirstPrompt(sessionId: string): Promise<LanePrompt | null> {
  const runtimeKey = getRuntimeKey();
  let cursor: string | undefined;
  let branch: string | undefined;
  do {
    const page = await canonicalClient.getHistory(sessionId, { limit: 100, cursor });
    const identity = JSON.stringify(page.branch);
    if (branch !== undefined && branch !== identity) throw new Error('History branch changed');
    branch = identity;
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
    const first = page.messages.find((message) => message.role === 'user');
    if (first) return {
      messageId: first.messageId,
      turnId: first.turnId,
      text: messageText(first),
      files: first.parts.filter((part) => part.type === 'attachment').map((part) => omitKeys(part, ['type', 'partId'])),
    };
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return null;
}

/** The comparison source is the original answer's model, never a later tail. */
export async function loadLaneTurnModel(sessionId: string, turnId: string): Promise<ModelSelection | null> {
  const runtimeKey = getRuntimeKey();
  let cursor: string | undefined;
  let branch: string | undefined;
  do {
    const page = await canonicalClient.getHistory(sessionId, { limit: 100, cursor });
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
    const identity = JSON.stringify(page.branch);
    if (branch !== undefined && branch !== identity) throw new Error('History branch changed');
    branch = identity;
    const message = page.messages.find((entry) => entry.turnId === turnId && entry.role === 'assistant' && entry.providerId && entry.modelId);
    if (message?.providerId && message.modelId) return { providerId: message.providerId, modelId: message.modelId };
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return null;
}

export type LaneLastTurn = {
  text: string;
  error: string | null;
  status: TurnStatus | null;
  cost: number | null;
  finishedAt: number | null;
};

/** Read every native page so the last nonempty reply is never a first-page reply. */
export async function loadLaneLastTurn(sessionId: string): Promise<LaneLastTurn> {
  const runtimeKey = getRuntimeKey();
  let cursor: string | undefined;
  let branch: string | undefined;
  let text = '';
  let latestAssistantTurnId: string | undefined;
  let latestTurn: Turn | undefined;
  let cost: number | null = null;
  do {
    const page = await canonicalClient.getHistory(sessionId, { limit: 100, cursor });
    const identity = JSON.stringify(page.branch);
    if (branch !== undefined && branch !== identity) throw new Error('History branch changed');
    branch = identity;
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
    for (const message of page.messages) {
      if (message.role !== 'assistant') continue;
      latestAssistantTurnId = message.turnId;
      if (message.usage) cost = (cost ?? 0) + message.usage.cost.total;
      const reply = messageText(message).trim();
      if (reply) text = reply;
    }
    latestTurn = page.turns.find((turn) => turn.turnId === latestAssistantTurnId) ?? latestTurn;
    // A failed/cancelled turn can terminate before it creates an assistant message.
    const newest = page.turns.at(-1);
    if (newest) latestTurn = newest;
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return { text, error: latestTurn?.error?.trim() || null, status: latestTurn?.status ?? null, cost, finishedAt: latestTurn?.finishedAt ?? null };
}

/** Text of the lane's latest assistant reply; an empty string when it has not answered yet. */
export async function loadLaneLastReply(sessionId: string): Promise<string> {
  return (await loadLaneLastTurn(sessionId)).text;
}

export async function loadLaneDiffStat(directory: string): Promise<LaneDiffStat> {
  const status = await getGitStatus(directory);
  let insertions = 0;
  let deletions = 0;
  for (const scope of [status.diffStats?.staged, status.diffStats?.working]) {
    for (const stat of Object.values(scope ?? {})) {
      insertions += stat.insertions;
      deletions += stat.deletions;
    }
  }
  return { files: status.files.length, insertions, deletions };
}

type CachedValue<T> = { token: string; value: T };

export function createLaneCache<T>(limit = 200) {
  const entries = new Map<string, CachedValue<T>>();
  return {
    tokenFor(sessionId: string, revision: number | string | undefined): string {
      return `${getRuntimeKey()}\u0000${sessionId}\u0000${revision ?? ''}`;
    },
    get(sessionId: string, token: string): T | undefined {
      const cached = entries.get(sessionId);
      return cached && cached.token === token ? cached.value : undefined;
    },
    set(sessionId: string, token: string, value: T): void {
      entries.delete(sessionId);
      entries.set(sessionId, { token, value });
      while (entries.size > limit) {
        const oldest = entries.keys().next().value;
        if (oldest === undefined) break;
        entries.delete(oldest);
      }
    },
  };
}
