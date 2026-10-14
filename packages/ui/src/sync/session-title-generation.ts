import { create } from 'zustand';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import { normalizePath } from '@/lib/pathNormalization';
import type { Session, SessionMetadataState } from '@openchamber/agent-contract';
import type { NativeTitleTurn } from './session-title-context';

type TitleTarget = { runtimeKey: string; directory: string; sessionId: string };
type PendingTitle = { target: TitleTarget; controller: AbortController };

export type NativeTitleContext = { session: Session; metadata: SessionMetadataState; turns: NativeTitleTurn[] };

const keyFor = (target: TitleTarget) => JSON.stringify([target.runtimeKey, normalizePath(target.directory), target.sessionId]);
const useTitleGenerations = create<{ pending: ReadonlyMap<string, PendingTitle> }>(() => ({ pending: new Map() }));

/** The metadata check belongs to the operation, independently of its menu. */
export async function generateAndSaveSessionTitle(input: {
  signal: AbortSignal;
  prepare: (signal: AbortSignal) => Promise<NativeTitleContext>;
  generate: (turns: readonly NativeTitleTurn[], signal: AbortSignal) => Promise<string>;
  readSession: () => Promise<{ session: Session; metadata: SessionMetadataState }>;
  saveTitle: (title: string, signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const { signal } = input;
  signal.throwIfAborted();
  const prepared = await input.prepare(signal);
  signal.throwIfAborted();
  if (prepared.metadata.sessionId !== prepared.session.sessionId) throw new Error('Session metadata belongs to another session');
  if (!prepared.turns.length) throw new Error('No completed turns');
  const title = await input.generate(prepared.turns, signal);
  signal.throwIfAborted();
  const current = await input.readSession();
  signal.throwIfAborted();
  if (current.session.sessionId !== prepared.session.sessionId
    || current.metadata.sessionId !== prepared.metadata.sessionId
    || current.session.updatedAt !== prepared.session.updatedAt
    || current.session.epoch !== prepared.session.epoch
    || current.session.headSequence !== prepared.session.headSequence
    || current.session.archivedAt !== prepared.session.archivedAt
    || current.metadata.revision !== prepared.metadata.revision
    || current.metadata.metadata?.title !== prepared.metadata.metadata?.title) return;
  await input.saveTitle(title, signal);
}

export const useSessionTitleGenerationPending = (target: TitleTarget): boolean =>
  useTitleGenerations((state) => state.pending.has(keyFor(target)));

/** Manual saves invalidate generation immediately, before their HTTP write settles. */
export function cancelSessionTitleGeneration(sessionID: string, runtimeKey = getRuntimeKey()): void {
  for (const operation of useTitleGenerations.getState().pending.values()) {
    if (operation.target.sessionId === sessionID && operation.target.runtimeKey === runtimeKey) {
      operation.controller.abort();
    }
  }
}

export async function runSessionTitleGeneration(
  target: TitleTarget,
  work: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  const key = keyFor(target);
  if (useTitleGenerations.getState().pending.has(key)) return;
  const controller = new AbortController();
  useTitleGenerations.setState((state) => ({ pending: new Map(state.pending).set(key, { target, controller }) }));
  const unsubscribe = subscribeRuntimeEndpointWillChange(() => controller.abort());
  try {
    if (getRuntimeKey() !== target.runtimeKey) return;
    await work(controller.signal);
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    unsubscribe();
    useTitleGenerations.setState((state) => {
      const pending = new Map(state.pending);
      pending.delete(key);
      return { pending };
    });
  }
}
