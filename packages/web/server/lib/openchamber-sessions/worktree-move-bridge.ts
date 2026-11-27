import type { WorktreeMoverDependencies, WorktreeSetupResult } from './worktree-move.js';

export interface SessionWorktreeMoveBridge {
  ready: boolean;
  createWorktree: WorktreeMoverDependencies['createWorktree'] | null;
  removeWorktree: WorktreeMoverDependencies['removeWorktree'] | null;
  hydrateCheckout: WorktreeMoverDependencies['hydrateCheckout'] | null;
  waitForWorktreeReady: WorktreeMoverDependencies['waitForWorktreeReady'] | null;
  bootstrapStore: WorktreeMoverDependencies['bootstrapStore'] | null;
  stashPush: WorktreeMoverDependencies['stashPush'] | null;
  getPathsWithoutChanges: WorktreeMoverDependencies['getPathsWithoutChanges'] | null;
  stashApply: WorktreeMoverDependencies['stashApply'] | null;
  stashDrop: WorktreeMoverDependencies['stashDrop'] | null;
  listStashes: WorktreeMoverDependencies['listStashes'] | null;
  getBranches: WorktreeMoverDependencies['getBranches'] | null;
  resolvePrimaryWorktreeRoot: WorktreeMoverDependencies['resolvePrimaryWorktreeRoot'] | null;
  resolveWorktreeSetup: NonNullable<WorktreeMoverDependencies['resolveWorktreeSetup']> | null;
}

export interface SessionWorktreeMoveBridgeDependencies {
  createWorktree?: WorktreeMoverDependencies['createWorktree'] | undefined;
  createWorktreeInstanceDisposer?: (() => void) | undefined;
  removeWorktree?: WorktreeMoverDependencies['removeWorktree'] | undefined;
  hydrateCheckout?: WorktreeMoverDependencies['hydrateCheckout'] | undefined;
  bootstrapStore?: WorktreeMoverDependencies['bootstrapStore'] | undefined;
  waitForWorktreeReady?: WorktreeMoverDependencies['waitForWorktreeReady'] | undefined;
  stashPush?: WorktreeMoverDependencies['stashPush'] | undefined;
  getPathsWithoutChanges?: WorktreeMoverDependencies['getPathsWithoutChanges'] | undefined;
  stashApply?: WorktreeMoverDependencies['stashApply'] | undefined;
  stashDrop?: WorktreeMoverDependencies['stashDrop'] | undefined;
  listStashes?: WorktreeMoverDependencies['listStashes'] | undefined;
  getBranches?: WorktreeMoverDependencies['getBranches'] | undefined;
  resolvePrimaryWorktreeRoot?: WorktreeMoverDependencies['resolvePrimaryWorktreeRoot'] | undefined;
  resolveWorktreeSetup?: WorktreeMoverDependencies['resolveWorktreeSetup'] | undefined;
}

const isFunctionOrObject = (candidate: unknown): candidate is ((...args: never[]) => never) | object =>
  candidate instanceof Function || candidate instanceof Object;

export const createUnregisteredSessionWorktreeMoveBridge = (): SessionWorktreeMoveBridge => ({
  ready: false,
  createWorktree: null,
  removeWorktree: null,
  hydrateCheckout: null,
  waitForWorktreeReady: null,
  bootstrapStore: null,
  stashPush: null,
  getPathsWithoutChanges: null,
  stashApply: null,
  stashDrop: null,
  listStashes: null,
  getBranches: null,
  resolvePrimaryWorktreeRoot: null,
  resolveWorktreeSetup: null,
});

export const fillSessionWorktreeMoveBridge = (
  bridge: SessionWorktreeMoveBridge | null | undefined,
  dependencies: SessionWorktreeMoveBridgeDependencies,
): SessionWorktreeMoveBridge | null | undefined => {
  if (!(bridge instanceof Object)) return bridge;
  const {
    createWorktree,
    createWorktreeInstanceDisposer: _createWorktreeInstanceDisposer,
    removeWorktree,
    hydrateCheckout,
    bootstrapStore,
    waitForWorktreeReady,
    stashPush,
    getPathsWithoutChanges,
    stashApply,
    stashDrop,
    listStashes,
    getBranches,
    resolvePrimaryWorktreeRoot,
    resolveWorktreeSetup,
  } = dependencies;
  if (
    !createWorktree
    || !removeWorktree
    || !hydrateCheckout
    || !waitForWorktreeReady
    || !bootstrapStore
    || !stashPush
    || !getPathsWithoutChanges
    || !stashApply
    || !stashDrop
    || !listStashes
    || !getBranches
    || !resolvePrimaryWorktreeRoot
    || ![createWorktree, removeWorktree, hydrateCheckout, waitForWorktreeReady, bootstrapStore,
      stashPush, getPathsWithoutChanges, stashApply, stashDrop, listStashes, getBranches,
      resolvePrimaryWorktreeRoot].every(isFunctionOrObject)
  ) {
    return bridge;
  }
  bridge.ready = true;
  bridge.createWorktree = createWorktree;
  bridge.removeWorktree = removeWorktree;
  bridge.hydrateCheckout = hydrateCheckout;
  bridge.waitForWorktreeReady = waitForWorktreeReady;
  bridge.bootstrapStore = bootstrapStore;
  bridge.stashPush = stashPush;
  bridge.getPathsWithoutChanges = getPathsWithoutChanges;
  bridge.stashApply = stashApply;
  bridge.stashDrop = stashDrop;
  bridge.listStashes = listStashes;
  bridge.getBranches = getBranches;
  bridge.resolvePrimaryWorktreeRoot = resolvePrimaryWorktreeRoot;
  bridge.resolveWorktreeSetup = resolveWorktreeSetup
    ?? (async (): Promise<WorktreeSetupResult> => ({ startCommand: '', untrustedSkipped: [] }));
  return bridge;
};
