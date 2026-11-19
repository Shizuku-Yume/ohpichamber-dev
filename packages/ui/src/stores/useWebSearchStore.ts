<<<<<<< HEAD
||||||| bc50ba56aa
/**
 * Settings → Web search state: the providers OpenCode offers, the `websearch`
 * config choice, how each provider's optional key is supplied, and the plugin
 * providers that are offered once connected.
 *
 * OpenCode owns all three. The store reads them on demand (the page asks, and
 * `catalogRefresh` re-reads after `websearch.updated`, `config.updated` or a
 * credential change once the page has asked at least once). A failed read
 * never replaces a good snapshot of the same scope with an empty one.
 */

=======

>>>>>>> upstream/main
import { create } from 'zustand';
import type { WebSearchConfigState, WebSearchMutationResult, WebSearchUpdateRequest } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { hostFilesystem } from '@/lib/host-filesystem';
import { reportSettingsSaveState } from '@/lib/persistence';
<<<<<<< HEAD
import { getRuntimeKey, subscribeRuntimeEndpointWillChange } from '@/lib/runtime-switch';
import type { LoadPhase } from './loadPhase';
||||||| bc50ba56aa
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey } from '@/lib/runtime-switch';

export type WebSearchSnapshot = {
  scope: string;
  providers: WebSearchProvider[];
  selection: WebSearchSelection;
  /** `null` when the integration list could not be read: key status unknown, not "no key". */
  access: Record<string, WebSearchProviderAccess> | null;
  /**
   * Plugin providers that join `providers` once connected. Empty when the
   * integration list could not be read (`access` is `null` then).
   */
  connectable: WebSearchProvider[];
  /**
   * The project config whose `websearch` overrides what Settings writes, so a
   * choice here would snap back. `null` when none, or when the check failed
   * (unknown is treated as "not overridden" so the page stays usable).
   */
  projectOverride: string | null;
};
=======
import { runtimeFetch } from '@/lib/runtime-fetch';
import { getRuntimeKey } from '@/lib/runtime-switch';

export type WebSearchSnapshot = {
  scope: string;
  providers: WebSearchProvider[];
  selection: WebSearchSelection;
  access: Record<string, WebSearchProviderAccess> | null;
  connectable: WebSearchProvider[];
  projectOverride: string | null;
};
>>>>>>> upstream/main

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
<<<<<<< HEAD
  update: (changes: SearchChanges) => Promise<boolean>;
  saveKey: (providerId: string, key: string) => Promise<boolean>;
||||||| bc50ba56aa
  /** Resolves `false` when the write failed; the previous choice is restored. */
  setSelection: (selection: WebSearchSelection) => Promise<boolean>;
  /** Connects with the provider's own method: `key` is ignored by a form-only method. */
  saveKey: (providerId: string, input: { key: string; answer: WebSearchConnectAnswer }) => Promise<boolean>;
=======
  setSelection: (selection: WebSearchSelection) => Promise<boolean>;
  saveKey: (providerId: string, input: { key: string; answer: WebSearchConnectAnswer }) => Promise<boolean>;
>>>>>>> upstream/main
  removeKey: (providerId: string) => Promise<boolean>;
  invalidate: () => void;
};

const currentDirectory = (): string | null => hostFilesystem.getDirectory()?.trim() || null;
export const getWebSearchScopeKey = (): string => JSON.stringify([getRuntimeKey(), currentDirectory()]);

<<<<<<< HEAD
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
||||||| bc50ba56aa
// Only the newest read may commit, and a choice written while a read was in
// flight wins over the config that read saw.
let readGeneration = 0;
let selectionRevision = 0;
let selectionWritesInFlight = 0;

const errorBodySchema = z.object({ error: z.string() });
const sourceBodySchema = z.object({ projectPath: z.string().min(1).nullable() });

const readProjectOverride = async (directory: string | null): Promise<string | null> => {
  try {
    const response = await runtimeFetch('/api/config/websearch', {
      headers: { Accept: 'application/json' },
      query: directory ? { directory } : undefined,
    });
    if (!response.ok) return null;
    return sourceBodySchema.safeParse(await response.json()).data?.projectPath ?? null;
  } catch (error) {
    console.warn('[web-search] failed to read where the choice is set', error);
    return null;
  }
};

const readSelectionError = async (response: Response): Promise<string> => {
  const body = errorBodySchema.safeParse(await response.json().catch(() => null));
  return body.data?.error ?? `HTTP ${response.status}`;
};

export const useWebSearchStore = create<WebSearchStore>()((set, get) => ({
  state: { kind: 'idle' },

  load: async () => {
    const scope = getWebSearchScopeKey();
    const directory = currentDirectory();
    const generation = ++readGeneration;
    const revisionAtStart = selectionRevision;
    const previous = get().state;
    const hasSnapshot = previous.kind === 'ready' && previous.snapshot.scope === scope;
    if (!hasSnapshot) set({ state: { kind: 'loading', scope } });

    try {
      const overridePromise = readProjectOverride(directory);
      const [providers, config] = await Promise.all([
        listWebSearchProviders(directory),
        opencodeClient.getConfig(directory),
      ]);
      const projectOverride = await overridePromise;
      const accounts = await readWebSearchAccounts(directory, providers.map((provider) => provider.id)).catch(() => null);
      if (generation !== readGeneration || getWebSearchScopeKey() !== scope) return;
      const current = get().state;
      const localChoiceIsNewer = selectionRevision !== revisionAtStart || selectionWritesInFlight > 0;
      const selection = localChoiceIsNewer && current.kind === 'ready' && current.snapshot.scope === scope
        ? current.snapshot.selection
        : readWebSearchSelection(config);
      set({
        state: {
          kind: 'ready',
          snapshot: {
            scope,
            providers,
            selection,
            access: accounts?.access ?? null,
            connectable: accounts?.connectable ?? [],
            projectOverride,
          },
        },
      });
    } catch (error) {
      if (generation !== readGeneration || getWebSearchScopeKey() !== scope) return;
      console.warn('[web-search] failed to read providers', error);
      const current = get().state;
      if (current.kind === 'ready' && current.snapshot.scope === scope) return;
      set({ state: { kind: 'failed', scope } });
    }
  },

  setSelection: async (selection) => {
    const current = get().state;
    if (current.kind !== 'ready' || current.snapshot.projectOverride) return false;
    const previous = current.snapshot.selection;
    selectionRevision += 1;
    const revision = selectionRevision;
    set({ state: { kind: 'ready', snapshot: { ...current.snapshot, selection } } });
    reportSettingsSaveState('saving');

    let failed = false;
    selectionWritesInFlight += 1;
    try {
      const response = await runtimeFetch('/api/config/websearch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ selection: webSearchSelectionToConfig(selection) }),
      });
      if (!response.ok) {
        console.warn('[web-search] failed to save the choice', await readSelectionError(response));
        failed = true;
=======
let readGeneration = 0;
let selectionRevision = 0;
let selectionWritesInFlight = 0;

const errorBodySchema = z.object({ error: z.string() });
const sourceBodySchema = z.object({ projectPath: z.string().min(1).nullable() });

const readProjectOverride = async (directory: string | null): Promise<string | null> => {
  try {
    const response = await runtimeFetch('/api/config/websearch', {
      headers: { Accept: 'application/json' },
      query: directory ? { directory } : undefined,
    });
    if (!response.ok) return null;
    return sourceBodySchema.safeParse(await response.json()).data?.projectPath ?? null;
  } catch (error) {
    console.warn('[web-search] failed to read where the choice is set', error);
    return null;
  }
};

const readSelectionError = async (response: Response): Promise<string> => {
  const body = errorBodySchema.safeParse(await response.json().catch(() => null));
  return body.data?.error ?? `HTTP ${response.status}`;
};

export const useWebSearchStore = create<WebSearchStore>()((set, get) => ({
  state: { kind: 'idle' },

  load: async () => {
    const scope = getWebSearchScopeKey();
    const directory = currentDirectory();
    const generation = ++readGeneration;
    const revisionAtStart = selectionRevision;
    const previous = get().state;
    const hasSnapshot = previous.kind === 'ready' && previous.snapshot.scope === scope;
    if (!hasSnapshot) set({ state: { kind: 'loading', scope } });

    try {
      const overridePromise = readProjectOverride(directory);
      const [providers, config] = await Promise.all([
        listWebSearchProviders(directory),
        opencodeClient.getConfig(directory),
      ]);
      const projectOverride = await overridePromise;
      const accounts = await readWebSearchAccounts(directory, providers.map((provider) => provider.id)).catch(() => null);
      if (generation !== readGeneration || getWebSearchScopeKey() !== scope) return;
      const current = get().state;
      const localChoiceIsNewer = selectionRevision !== revisionAtStart || selectionWritesInFlight > 0;
      const selection = localChoiceIsNewer && current.kind === 'ready' && current.snapshot.scope === scope
        ? current.snapshot.selection
        : readWebSearchSelection(config);
      set({
        state: {
          kind: 'ready',
          snapshot: {
            scope,
            providers,
            selection,
            access: accounts?.access ?? null,
            connectable: accounts?.connectable ?? [],
            projectOverride,
          },
        },
      });
    } catch (error) {
      if (generation !== readGeneration || getWebSearchScopeKey() !== scope) return;
      console.warn('[web-search] failed to read providers', error);
      const current = get().state;
      if (current.kind === 'ready' && current.snapshot.scope === scope) return;
      set({ state: { kind: 'failed', scope } });
    }
  },

  setSelection: async (selection) => {
    const current = get().state;
    if (current.kind !== 'ready' || current.snapshot.projectOverride) return false;
    const previous = current.snapshot.selection;
    selectionRevision += 1;
    const revision = selectionRevision;
    set({ state: { kind: 'ready', snapshot: { ...current.snapshot, selection } } });
    reportSettingsSaveState('saving');

    let failed = false;
    selectionWritesInFlight += 1;
    try {
      const response = await runtimeFetch('/api/config/websearch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ selection: webSearchSelectionToConfig(selection) }),
      });
      if (!response.ok) {
        console.warn('[web-search] failed to save the choice', await readSelectionError(response));
        failed = true;
>>>>>>> upstream/main
      }
<<<<<<< HEAD
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
||||||| bc50ba56aa
    } catch (error) {
      console.warn('[web-search] failed to save the choice', error);
      failed = true;
    } finally {
      selectionWritesInFlight -= 1;
    }

    if (!failed) {
      reportSettingsSaveState('saved');
      // OpenCode reads its config fresh on the next request; drop the copy
      // cached for the page's read.
      opencodeClient.clearConfigCache();
      return true;
    }
    reportSettingsSaveState('error');
    // Roll back only if no newer choice was made meanwhile.
    const latest = get().state;
    if (revision === selectionRevision && latest.kind === 'ready' && latest.snapshot.scope === current.snapshot.scope) {
      set({ state: { kind: 'ready', snapshot: { ...latest.snapshot, selection: previous } } });
    }
    return false;
  },

  saveKey: async (providerId, input) => {
    const current = get().state;
    const connect = current.kind === 'ready' ? current.snapshot.access?.[providerId]?.connect : null;
    if (!connect) return false;
    try {
      await saveWebSearchCredential(currentDirectory(), providerId, connect, input);
    } catch (error) {
      console.warn('[web-search] failed to save the key', error);
      return false;
    }
    // OpenCode announces the credential change; reading now shows it without
    // waiting for the event's debounce.
    void get().load();
    return true;
  },

  removeKey: async (providerId) => {
    const current = get().state;
    if (current.kind !== 'ready') return false;
    const status = current.snapshot.access?.[providerId]?.key;
    if (status?.kind !== 'stored') return false;
    try {
      await removeWebSearchKey(status.ids);
    } catch (error) {
      console.warn('[web-search] failed to remove the key', error);
      void get().load();
      return false;
    }
    void get().load();
    return true;
  },
}));

/** Re-read after a catalog event, but only once something asked for the data. */
export const refreshWebSearchIfLoaded = async (): Promise<void> => {
  if (useWebSearchStore.getState().state.kind === 'idle') return;
  await useWebSearchStore.getState().load();
=======
    } catch (error) {
      console.warn('[web-search] failed to save the choice', error);
      failed = true;
    } finally {
      selectionWritesInFlight -= 1;
    }

    if (!failed) {
      reportSettingsSaveState('saved');
      opencodeClient.clearConfigCache();
      return true;
    }
    reportSettingsSaveState('error');
    const latest = get().state;
    if (revision === selectionRevision && latest.kind === 'ready' && latest.snapshot.scope === current.snapshot.scope) {
      set({ state: { kind: 'ready', snapshot: { ...latest.snapshot, selection: previous } } });
    }
    return false;
  },

  saveKey: async (providerId, input) => {
    const current = get().state;
    const connect = current.kind === 'ready' ? current.snapshot.access?.[providerId]?.connect : null;
    if (!connect) return false;
    try {
      await saveWebSearchCredential(currentDirectory(), providerId, connect, input);
    } catch (error) {
      console.warn('[web-search] failed to save the key', error);
      return false;
    }
    void get().load();
    return true;
  },

  removeKey: async (providerId) => {
    const current = get().state;
    if (current.kind !== 'ready') return false;
    const status = current.snapshot.access?.[providerId]?.key;
    if (status?.kind !== 'stored') return false;
    try {
      await removeWebSearchKey(status.ids);
    } catch (error) {
      console.warn('[web-search] failed to remove the key', error);
      void get().load();
      return false;
    }
    void get().load();
    return true;
  },
}));

export const refreshWebSearchIfLoaded = async (): Promise<void> => {
  if (useWebSearchStore.getState().state.kind === 'idle') return;
  await useWebSearchStore.getState().load();
>>>>>>> upstream/main
};
export const useWebSearchStore = createWebSearchStore({ client: canonicalClient, directory: currentDirectory, scope: getWebSearchScopeKey, report: reportSettingsSaveState });
subscribeRuntimeEndpointWillChange(() => useWebSearchStore.getState().invalidate());
