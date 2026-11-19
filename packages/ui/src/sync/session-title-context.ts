import type { Message, Turn } from "@openchamber/agent-contract"
import type { SessionMessageLoader, SessionMessageTarget } from './session-message-loader';

<<<<<<< HEAD
/** A completed user/assistant pair used by native title generation. */
export type NativeTitleTurn = { user: Message; assistant: Message };

export function collectNativeTitleTurns(messages: readonly Message[], turns: readonly Turn[], revertMessageId?: string): NativeTitleTurn[] {
  const boundary = revertMessageId ? messages.findIndex((message) => message.messageId === revertMessageId) : messages.length;
  if (revertMessageId && boundary < 0) return [];
  const byId = new Map(messages.slice(0, boundary).map((message) => [message.messageId, message]));
  const completed: NativeTitleTurn[] = [];
  for (const turn of turns) {
    if (turn.status !== 'completed') continue;
    const user = byId.get(turn.userMessageId);
    const finalId = turn.assistantMessageIds.at(-1);
    const assistant = finalId ? byId.get(finalId) : undefined;
    if (!user || !assistant || user.role !== 'user' || assistant.role !== 'assistant'
      || user.turnId !== turn.turnId || assistant.turnId !== turn.turnId
      || user.sessionId !== turn.sessionId || assistant.sessionId !== turn.sessionId
      || !user.parts.some((part) => part.type === 'attachment' || (part.type === 'text' && part.content.trim()))
      || !assistant.parts.some((part) => part.type === 'text' && part.content.trim())) continue;
    completed.push({ user, assistant });
  }
  return completed.slice(-3);
}

/** Share the normal loader's requests, stopping as soon as three pairs are covered. */
||||||| bc50ba56aa
/** Share the normal loader's requests, stopping as soon as three pairs are covered. */
=======
>>>>>>> upstream/main
export async function loadSessionTitleTurns(input: {
  loader: Pick<SessionMessageLoader, 'getSnapshot' | 'ensure' | 'loadOlder'>;
  target: SessionMessageTarget;
  getMessages: () => Message[];
  getTurns: () => Turn[];
  revertMessageId?: string;
  signal: AbortSignal;
}): Promise<NativeTitleTurn[]> {
  const { loader, target, signal } = input;
  signal.throwIfAborted();
  const initial = loader.getSnapshot(target);
  await loader.ensure(target, { force: !initial.resolved || initial.status === 'error' });
  signal.throwIfAborted();
  const generation = loader.getSnapshot(target).generation;
  const visited = new Set<string>();
  while (true) {
    signal.throwIfAborted();
    const state = loader.getSnapshot(target);
    if (state.status !== 'ready' || state.generation !== generation) {
      throw state.error ?? new Error('Session history is unavailable');
    }
    const turns = collectNativeTitleTurns(input.getMessages(), input.getTurns(), input.revertMessageId);
    if (turns.length === 3 || state.complete) return turns;
    if (!state.cursor || visited.has(state.cursor)) throw new Error('Session history pagination made no progress');
    visited.add(state.cursor);
    await loader.loadOlder(target);
  }
}
