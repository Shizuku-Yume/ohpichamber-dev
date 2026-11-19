
import { create } from 'zustand';
import type { WebSearchConfigState, WebSearchMutationResult, WebSearchUpdateRequest } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { reportSettingsSaveState } from '@/lib/persistence';
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import type { LoadPhase } from './loadPhase';

export type WebSearchSnapshot = WebSearchConfigState & { scope: string };
type WebSearchState =
  | { kind: 'idle' }
  | { kind: 'loading'; scope: string }
  | { kind: 'ready'; snapshot: WebSearchSnapshot }
  | { kind: 'failed'; scope: string };
type SearchChanges = Omit<WebSearchUpdateRequest, 'expectedRevision'>;
type SearchClient = Pick<typeof canonicalClient, 'resolveWorkspace' | 'getWebSearch' | 'updateWebSearch' | 'writeWebSearchCredential' | 'deleteWebSearchCredential'>;
type SearchDependencies = {
  client: SearchClient;
  directory: () => string | null;
  scope: () => string;
  report: typeof reportSettingsSaveState;
};
type WebSearchStore = {
  state: WebSearchState;
  /** `unknown` until the snapshot was read; `error` keeps the last one and says so. */
  phase: LoadPhase;
  busy: boolean;
  error: 'read' | 'write' | null;
  outcome: WebSearchMutationResult | null;
  load: () => Promise<void>;
  update: (changes: SearchChanges) => Promise<boolean>;
  saveKey: (providerId: string, key: string) => Promise<boolean>;
  removeKey: (providerId: string) => Promise<boolean>;
  invalidate: () => void;
};

const currentDirectory = (): string | null => hostFilesystem.getDirectory()?.trim() || null;
export const getWebSearchScopeKey = (): string => JSON.stringify([getRuntimeKey(), currentDirectory()]);

/** Host state is authoritative; failed reads retain the previous snapshot and writes never optimistically apply. */
export const createWebSearchStore = (dependencies: SearchDependencies) => {
  let generation = 0;
  let readGeneration = 0;
  let mutationRevision = 0;
  return create<WebSearchStore>()((set, get) => {
    const mutate = async (operation: (snapshot: WebSearchSnapshot) => Promise<WebSearchMutationResult>): Promise<boolean> => {
      const current = get();
      if (current.busy || current.state.kind !== 'ready' || current.state.snapshot.scope !== dependencies.scope()) return false;
      const snapshot = current.state.snapshot;
      const owner = generation;
      mutationRevision += 1;
      set({ busy: true, error: null, outcome: null });
      dependencies.report('saving');
      try {
        const result = await operation(snapshot);
        if (owner !== generation || dependencies.scope() !== snapshot.scope) return false;
        // A failed persistence may still have changed workers. Show the complete
        // authoritative outcome rather than claiming that a partial write applied.
        set({ state: { kind: 'ready', snapshot: { ...result.state, scope: snapshot.scope } }, phase: 'ready', outcome: result });
        const applied = result.status === 'applied' && result.persistence === 'persisted' && result.workers.every(worker => worker.status === 'applied');
        dependencies.report(applied ? 'saved' : 'error');
        return applied;
      } catch {
        if (owner === generation && dependencies.scope() === snapshot.scope) {
          set({ error: 'write' });
          dependencies.report('error');
        }
        return false;
      } finally {
        if (owner === generation) set({ busy: false });
      }
    };
    return {
      state: { kind: 'idle' }, phase: 'unknown', busy: false, error: null, outcome: null,
      invalidate: () => {
        generation += 1;
        mutationRevision += 1;
        set({ state: { kind: 'idle' }, phase: 'unknown', busy: false, error: null, outcome: null });
      },
      load: async () => {
        const scope = dependencies.scope();
        const directory = dependencies.directory();
        const prior = get().state;
        if (prior.kind === 'ready' && prior.snapshot.scope !== scope) {
          generation += 1;
          set({ busy: false, outcome: null });
        }
        const owner = generation;
        const read = ++readGeneration;
        const revision = mutationRevision;
        const previous = get().state;
        if (previous.kind !== 'ready') set({ state: { kind: 'loading', scope } });
        set({ error: null });
        try {
          if (!directory) throw new Error('Workspace directory is required');
          const workspace = await dependencies.client.resolveWorkspace(directory);
          if (owner !== generation || read !== readGeneration || scope !== dependencies.scope()) return;
          const snapshot = await dependencies.client.getWebSearch(workspace.workspaceId);
          if (owner !== generation || read !== readGeneration || scope !== dependencies.scope() || revision !== mutationRevision || get().busy) return;
          set({ state: { kind: 'ready', snapshot: { ...snapshot, scope } }, phase: 'ready' });
        } catch {
          if (owner !== generation || read !== readGeneration || scope !== dependencies.scope() || revision !== mutationRevision) return;
          set({ error: 'read', phase: previous.kind === 'ready' ? 'ready' : 'error', ...(previous.kind === 'ready' ? {} : { state: { kind: 'failed' as const, scope } }) });
        }
      },
      update: changes => mutate(snapshot => dependencies.client.updateWebSearch(snapshot.workspaceId, { ...changes, expectedRevision: snapshot.revision })),
      saveKey: (providerId, key) => mutate(snapshot => dependencies.client.writeWebSearchCredential(snapshot.workspaceId, { providerId, apiKey: key, expectedRevision: snapshot.revision })),
      removeKey: providerId => mutate(snapshot => dependencies.client.deleteWebSearchCredential(snapshot.workspaceId, { providerId, expectedRevision: snapshot.revision })),
    };
  });
};
export const useWebSearchStore = createWebSearchStore({ client: canonicalClient, directory: currentDirectory, scope: getWebSearchScopeKey, report: reportSettingsSaveState });
subscribeRuntimeEndpointWillChange(() => useWebSearchStore.getState().invalidate());
