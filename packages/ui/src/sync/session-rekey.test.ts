import { afterEach, beforeEach, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';

const browser = new Window({ url: 'http://localhost/' });
Object.assign(globalThis, {
  window: browser,
  document: browser.document,
  navigator: browser.navigator,
  localStorage: browser.localStorage,
});

const { useSessionUIStore } = await import('@/sync/session-ui-store');
const { useGlobalSessionsStore } = await import('@/stores/useGlobalSessionsStore');
const { useDirectoryStore } = await import('@/stores/useDirectoryStore');
const { buildMultiRunIndex } = await import('@/lib/multirun/runs');
const { withMultiRunMembership } = await import('@/lib/multirun/identity');

const DIR = '/workspace';
const WORKSPACE_ID = 'workspace-fixture';
const OLD_ID = 'ses_pre_branch';
const NEW_ID = 'ses_minted_branch';
const row = (sessionId: string) => ({
  sessionId, projectId: 'project-fixture', workspaceId: WORKSPACE_ID, displayPath: '.',
  rootSessionId: sessionId, createdAt: 1, updatedAt: 1, epoch: 'epoch-1', headSequence: '0',
  runtimeStatus: 'idle' as const, activeRunId: null, mode: { kind: 'main' as const },
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

beforeEach(() => {
  resetWorkspaceDirectories();
  registerWorkspaceDirectory(WORKSPACE_ID, DIR);
  useDirectoryStore.setState({ currentDirectory: DIR });
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useGlobalSessionsStore.getState().upsertSession(row(OLD_ID));
  useSessionUIStore.setState({ currentSessionId: OLD_ID, currentSessionDirectory: DIR });
});

afterEach(() => {
  useGlobalSessionsStore.getState().resetForRuntimeSwitch();
  useSessionUIStore.setState({ currentSessionId: null, currentSessionDirectory: null });
});

test('a rekey moves the selection, projection and caches to the minted session id', () => {
  useSessionUIStore.getState().rekeySession(OLD_ID, NEW_ID, DIR);

  expect(useSessionUIStore.getState().currentSessionId).toBe(NEW_ID);
  expect(useSessionUIStore.getState().currentSessionDirectory).toBe(DIR);
  // The retired identity must leave no projection behind: a later read for it
  // can only answer 404 from the service and the Host.
  expect(useGlobalSessionsStore.getState().entityById.get(OLD_ID)).toBeUndefined();
  expect(useGlobalSessionsStore.getState().entityById.get(NEW_ID)).toMatchObject({
    sessionId: NEW_ID, rootSessionId: NEW_ID, workspaceId: WORKSPACE_ID,
  });
  expect(useGlobalSessionsStore.getState().entityById.get(NEW_ID)?.parentSessionId).toBeUndefined();
  // The owned directory follows the rekey so the next read addresses the
  // minted id's workspace rather than a guess from the retired one.
  expect(useSessionUIStore.getState().getDirectoryForSession(NEW_ID)).toBe(DIR);
});

test('a promoted run stays in its sidebar group before the Host refreshes the projection', () => {
  const peerId = 'ses_peer';
  const membership = {
    version: 1,
    group: { kind: 'id', id: '0f15c66b-68a0-44bb-9cca-99ba63139caf' },
    groupSlug: 'compare', runGroup: 'g1', providerID: 'provider', modelID: 'model',
    index: 1, role: 'run', sessionID: OLD_ID,
  } as const;
  const store = useGlobalSessionsStore.getState();
  store.upsertSessions([
    { ...row(OLD_ID), metadata: withMultiRunMembership(row(OLD_ID), membership) },
    { ...row(peerId), metadata: withMultiRunMembership(row(peerId), { ...membership, sessionID: peerId, index: 2 }) },
  ]);
  const sidebarMembership = () =>
    buildMultiRunIndex(useGlobalSessionsStore.getState().activeSessions, () => DIR).runKeyBySessionId;
  const originalGroup = sidebarMembership().get(OLD_ID);
  expect(originalGroup).toBeDefined();
  expect(sidebarMembership().get(peerId)).toBe(originalGroup);

  useSessionUIStore.getState().rekeySession(OLD_ID, NEW_ID);

  const promoted = sidebarMembership();
  expect(promoted.get(NEW_ID)).toBe(originalGroup);
  expect(promoted.get(peerId)).toBe(originalGroup);
  expect(promoted.has(OLD_ID)).toBe(false);
});
