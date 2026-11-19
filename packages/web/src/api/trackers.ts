
import { z } from 'zod';
import type {
  TrackerAPI,
  TrackerAuthOrigin,
  TrackerAuthStart,
  TrackerAuthStatus,
  TrackerConnectResult,
  TrackerDescriptor,
  TrackerItemResult,
  TrackerListOptions,
  TrackerListResult,
  TrackerMappingResult,
  TrackerMappingWrite,
  TrackerPreferences,
  TrackerProviderId,
  TrackerSessionStatusPostInput,
  TrackerSessionStatusPostResult,
  TrackerStatesResult,
  TrackerStateUpdateInput,
} from '@openchamber/ui/lib/api/types';
import { trackerDescriptorListSchema } from '@openchamber/ui/lib/trackers/descriptor';
import { runtimeFetch } from '@openchamber/ui/lib/runtime-fetch';
import { getRuntimeKey, getRuntimeSwitchRevision } from '@openchamber/ui/lib/runtime-switch';
import { BUILT_IN_LINEAR_TRACKER, createLegacyLinearTrackerAPI } from './trackers-legacy-linear';
import {
  authStartSchema,
  connectResultOf,
  authStatusSchema,
  itemResultSchema,
  listResultSchema,
  mappingResultSchema,
  preferencesSchema,
  sessionStatusResultSchema,
  failureOf,
  requestJson,
  statesResultSchema,
  type TrackerFetch,
  type TrackerRequest,
} from './trackers-schemas';

export { BUILT_IN_LINEAR_TRACKER } from './trackers-legacy-linear';

const providersResponseSchema = z.object({ providers: z.array(z.unknown()) });

const isJsonContentType = (value: string | null): boolean => {
  const type = value?.split(';')[0]?.trim().toLowerCase() ?? '';
  return type === 'application/json' || type.endsWith('+json');
};

type Wire = { kind: 'tracker'; descriptors: TrackerDescriptor[] } | { kind: 'legacy-linear' };


async function readWire(fetch: TrackerFetch): Promise<Wire> {
  const response = await fetch('/api/tracker/providers', { headers: { Accept: 'application/json' } });
  if (response.status === 404) return { kind: 'legacy-linear' };
  if (!response.ok) throw await failureOf(response, 'Failed to load trackers');




  if (!isJsonContentType(response.headers.get('content-type'))) return { kind: 'legacy-linear' };
  const listed = providersResponseSchema.parse(await response.json().catch(() => null)).providers;
  const descriptors = trackerDescriptorListSchema.parse(listed);
  if (listed.length > 0 && descriptors.length === 0) {
    throw new Error('Trackers response contained no readable tracker');
  }
  return { kind: 'tracker', descriptors };
}

const trackerPath = (provider: TrackerProviderId, path: string): string => `/api/tracker/${encodeURIComponent(provider)}${path}`;

export const createWebTrackerAPI = ({
  fetch = runtimeFetch,
  runtimeKey = getRuntimeKey,
}: { fetch?: TrackerFetch; runtimeKey?: () => string } = {}): TrackerAPI => {
  const legacy = createLegacyLinearTrackerAPI(fetch);

<<<<<<< HEAD
  // Which wire the connected server speaks, asked once and again by every
  // `providers()`. A failed read is not remembered: the next call asks again.
  // The adapter outlives a runtime switch, so the answer belongs to the
  // runtime it was read on; another runtime asks its own server.
  let wire: { runtimeKey: string; revision: number; request: Promise<Wire> } | null = null;
  const readWireOnce = (owner: string, revision: number): Promise<Wire> => {
||||||| bc50ba56aa
  // Which wire the connected server speaks, asked once and again by every
  // `providers()`. A failed read is not remembered: the next call asks again.
  // The adapter outlives a runtime switch, so the answer belongs to the
  // runtime it was read on; another runtime asks its own server.
  let wire: { runtimeKey: string; request: Promise<Wire> } | null = null;
  const readWireOnce = (): Promise<Wire> => {
=======




  let wire: { runtimeKey: string; request: Promise<Wire> } | null = null;
  const readWireOnce = (): Promise<Wire> => {
>>>>>>> upstream/main
    const request = readWire(fetch);
    const entry = { runtimeKey: owner, revision, request };
    wire = entry;
    request.catch(() => {
      if (wire === entry) wire = null;
    });
    return request;
  };
  const assertOwner = (owner: string): void => {
    if (runtimeKey() !== owner) throw new Error('Tracker runtime changed during operation');
  };
  const onWire = async <T>(dispatch: (legacyWire: boolean) => Promise<T>): Promise<T> => {
    const owner = runtimeKey();
    const revision = getRuntimeSwitchRevision();
    const held = wire?.runtimeKey === owner && wire.revision === revision ? wire.request : null;
    const selected = await (held ?? readWireOnce(owner, revision));
    assertOwner(owner);
    if (getRuntimeSwitchRevision() !== revision) throw new Error('Tracker runtime changed during operation');
    // Dispatch synchronously after the ownership check, before another switch can run.
    return dispatch(selected.kind === 'legacy-linear');
  };

  const call = <T>(provider: TrackerProviderId, path: string, request: TrackerRequest, schema: z.ZodType<T>, failure: string) => (
    requestJson(fetch, trackerPath(provider, path), request, schema, failure)
  );
  const GET = { method: 'GET' } as const;

  const listQuery = (options: TrackerListOptions | undefined): string => {
    const params = new URLSearchParams();
    const set = (key: string, value: string | null | undefined) => {
      const trimmed = value?.trim();
      if (trimmed) params.set(key, trimmed);
    };
    set('query', options?.query);
    set('cursor', options?.cursor);
    set('state', options?.state);
    set('people', options?.people);
    set('priority', options?.priority);
    set('containerId', options?.containerId);
    const query = params.toString();
    return query ? `?${query}` : '';
  };

  return {
    async providers(): Promise<TrackerDescriptor[]> {
      const owner = runtimeKey();
      const revision = getRuntimeSwitchRevision();
      const answer = await readWireOnce(owner, revision);
      assertOwner(owner);
      if (getRuntimeSwitchRevision() !== revision) throw new Error('Tracker runtime changed during operation');
      return answer.kind === 'legacy-linear' ? [BUILT_IN_LINEAR_TRACKER] : answer.descriptors;
    },

    authStatus: (provider): Promise<TrackerAuthStatus> => onWire((legacyWire) => (
      legacyWire ? legacy.authStatus(provider) : call(provider, '/auth/status', GET, authStatusSchema, 'Failed to load tracker status')
    )),

    authStart: (provider, origin?: TrackerAuthOrigin, options?: { instance?: string }): Promise<TrackerAuthStart> => onWire((legacyWire) => (
      legacyWire ? legacy.authStart(provider, origin) : call(
        provider,
        '/auth/start',
        { method: 'POST', body: JSON.stringify(options?.instance ? { origin, instance: options.instance } : { origin }) },
        authStartSchema,
        'Failed to start tracker sign-in',
      )
    )),

    authConnectToken: (provider, input): Promise<TrackerConnectResult> => onWire(async (legacyWire) => {
      if (legacyWire) return legacy.authConnectToken(provider, input);
      // A refusal is its own answer, not a thrown failure: the card shows the
      // server's code and message.
      try {
        const response = await fetch(trackerPath(provider, '/auth/token'), {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        });
        return await connectResultOf(response);
      } catch {
        return { ok: false as const, code: 'failed' as const, message: null };
      }
    }),

    authSaveOAuthClient: (provider, input): Promise<TrackerConnectResult> => onWire(async (legacyWire) => {
      if (legacyWire) return legacy.authSaveOAuthClient(provider, input);
      try {
        const response = await fetch(trackerPath(provider, '/auth/oauth-client'), {
          method: 'PUT', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(input),
        });
        return await connectResultOf(response);
      } catch {
        return { ok: false as const, code: 'failed' as const, message: null };
      }
    }),

    authDisconnect: (provider): Promise<{ removed: boolean }> => onWire((legacyWire) => (
      legacyWire ? legacy.authDisconnect(provider) : call(provider, '/auth', { method: 'DELETE' }, z.object({ removed: z.boolean().catch(false) }), 'Failed to disconnect tracker')
        .then(({ removed }) => ({ removed }))
    )),

    authActivate: (provider, accountId): Promise<TrackerAuthStatus> => onWire((legacyWire) => (
      legacyWire ? legacy.authActivate(provider, accountId) : call(provider, '/auth/activate', { method: 'POST', body: JSON.stringify({ accountId }) }, authStatusSchema, 'Failed to switch tracker account')
    )),

    list: (provider, options): Promise<TrackerListResult> => onWire((legacyWire) => (
      legacyWire ? legacy.list(provider, options) : call(provider, `/items/list${listQuery(options)}`, GET, listResultSchema, 'Failed to load tracker items')
    )),

    refreshListReads: (provider): Promise<void> => onWire(async (legacyWire) => {
      if (legacyWire) return legacy.refreshListReads(provider);
      await call(provider, '/read-cache/refresh?scope=lists', { method: 'POST' }, z.unknown(), 'Failed to refresh tracker lists');
    }),

    get: (provider, id): Promise<TrackerItemResult> => onWire((legacyWire) => (
      legacyWire ? legacy.get(provider, id) : call(provider, `/items/get?${new URLSearchParams({ id }).toString()}`, GET, itemResultSchema, 'Failed to load tracker item')
    )),

    states: (provider, containerId): Promise<TrackerStatesResult> => onWire((legacyWire) => (
      legacyWire ? legacy.states(provider, containerId) : call(provider, `/states?${new URLSearchParams({ containerId }).toString()}`, GET, statesResultSchema, 'Failed to load workflow states')
    )),

    updateState: (provider, input: TrackerStateUpdateInput): Promise<TrackerItemResult> => onWire((legacyWire) => (
      legacyWire ? legacy.updateState(provider, input) : call(provider, '/items/update', { method: 'POST', body: JSON.stringify({ id: input.id, stateId: input.stateId }) }, itemResultSchema, 'Failed to update tracker item')
    )),

    mappingGet: (provider): Promise<TrackerMappingResult> => onWire((legacyWire) => (
      legacyWire ? legacy.mappingGet(provider) : call(provider, '/mapping', GET, mappingResultSchema, 'Failed to load project mapping')
    )),

    mappingSet: (provider, mapping: TrackerMappingWrite): Promise<TrackerMappingResult> => onWire((legacyWire) => {
      if (legacyWire) return legacy.mappingSet(provider, mapping);
      return call(
        provider,
        '/mapping',
        { method: 'PUT', body: JSON.stringify({ defaultProjectPath: mapping.defaultProjectPath, containerProjectPaths: mapping.containerProjectPaths }) },
        mappingResultSchema,
        'Failed to save project mapping',
      );
    }),

    sessionStatusPost: (provider, input: TrackerSessionStatusPostInput): Promise<TrackerSessionStatusPostResult> => onWire((legacyWire) => {
      if (legacyWire) return legacy.sessionStatusPost(provider, input);
      return call(provider, '/session-status', {
        method: 'POST',
        body: JSON.stringify({ kind: input.kind, sessionId: input.sessionId, identifier: input.identifier, sessionOrigin: input.sessionOrigin }),
      }, sessionStatusResultSchema, 'Failed to post session status');
    }),

    preferencesGet: (provider): Promise<TrackerPreferences> => onWire((legacyWire) => (
      legacyWire ? legacy.preferencesGet(provider) : call(provider, '/preferences', GET, preferencesSchema, 'Failed to load tracker preferences')
    )),

    preferencesSet: (provider, preferences: TrackerPreferences): Promise<TrackerPreferences> => onWire((legacyWire) => (
      legacyWire ? legacy.preferencesSet(provider, preferences) : call(provider, '/preferences', { method: 'PUT', body: JSON.stringify({ sessionComments: preferences.sessionComments }) }, preferencesSchema, 'Failed to save tracker preferences')
    )),
  };
};

