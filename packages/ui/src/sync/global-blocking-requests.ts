import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ApprovalRequest, CanonicalEvent, QuestionRequest, SessionSnapshot } from '@openchamber/agent-contract';
import { compareCounters } from './event-reducer';

<<<<<<< HEAD
export type BlockingPermissionRequest = ApprovalRequest;
export type BlockingFormRequest = QuestionRequest;
type PendingBlockingRequests = { directory: string; permissions: readonly BlockingPermissionRequest[]; forms: readonly BlockingFormRequest[] };
type GlobalBlockingRequestsState = { bySession: ReadonlyMap<string, PendingBlockingRequests> };
const EMPTY_PERMISSIONS: readonly ApprovalRequest[] = [];
const EMPTY_FORMS: readonly QuestionRequest[] = [];
export const useGlobalBlockingRequestsStore: UseBoundStore<StoreApi<GlobalBlockingRequestsState>> = create<GlobalBlockingRequestsState>(() => ({ bySession: new Map() }));
const snapshots = new Map<string, { epoch: string; sequence: string }>();
const requests = new Map<string, Map<string, ApprovalRequest | QuestionRequest>>();
export const resetGlobalBlockingRequests = (): void => { snapshots.clear(); requests.clear(); useGlobalBlockingRequestsStore.setState({ bySession: new Map() }); };
const upsertRequest = <T extends { approvalId?: string; questionId?: string }>(list: readonly T[], request: T): readonly T[] | null => {
  const id = request.approvalId ?? request.questionId;
  if (!id) return null;
  const index = list.findIndex((entry) => (entry.approvalId ?? entry.questionId) === id);
  if (index < 0) return [...list, request];
||||||| bc50ba56aa
// Cross-directory index of permission requests and forms still waiting for an
// answer. Directory stores remain the source for open directories; this index
// exists for the ones that are never bootstrapped, whose pending requests
// would otherwise be invisible to the tray and to any surface that does not
// mount a row for them.
//
// It is fed by the same rare events the directory reducer consumes
// (`permission.asked`/`permission.replied`, `form.created`/`form.settled`,
// `session.deleted`) and seeded from the host. Pages that wait for the
// user's answer have no OpenCode event and no directory store; the server
// announces them (`applyWaitingPageEvent`), and this index is their only home. Nothing streams through
// here, so consumers subscribe per session ID without cost.
//
// Only the fields the consuming surfaces render are kept. The host seed can
// carry no more than this, and storing the full requests would make the two
// feeds disagree on shape for no gain.
export type BlockingPermissionRequest = Pick<PermissionRequest, 'id' | 'sessionID' | 'action' | 'resources' | 'save'>;
export type BlockingFormRequest = Pick<FormRequest, 'id' | 'sessionID' | 'title'>;
/**
 * A page an agent showed that waits for the user's answer (render.page with
 * awaitAnswer). It blocks the agent like a form, so every surface shows it as
 * one, but it is answered on the page in the chat: it is kept apart from
 * forms so nothing tries to answer it as a form. `id` is the tool call id.
 */
type BlockingPageRequest = { id: string; sessionID: string; title: string };

type PendingBlockingRequests = {
  directory: string;
  permissions: readonly BlockingPermissionRequest[];
  forms: readonly BlockingFormRequest[];
  pages: readonly BlockingPageRequest[];
};

type GlobalBlockingRequestsState = {
  bySession: ReadonlyMap<string, PendingBlockingRequests>;
};

const EMPTY: readonly never[] = [];
type WaitingPageEvent = Extract<SyncEvent, { type: 'openchamber.page-waiting' | 'openchamber.page-settled' | 'session.deleted' }>;
const pageSnapshotObservers = new Set<(event: WaitingPageEvent) => void>();

const recordWaitingPageEvent = (event: WaitingPageEvent): void => {
  for (const observer of pageSnapshotObservers) observer(event);
};

export const useGlobalBlockingRequestsStore = create<GlobalBlockingRequestsState>(() => ({
  bySession: new Map(),
}));

/** Whether a page or a secret card in this session waits for the user's answer. */
export const useIsPageWaiting = (sessionId: string | null | undefined): boolean => (
  useGlobalBlockingRequestsStore((state) => Boolean(sessionId && state.bySession.get(sessionId)?.pages.length))
);

/** Whether this call's page or secret card waits for the user's answer, as the server announced it. */
export const useIsCallWaiting = (sessionId: string | null | undefined, callId: string | null | undefined): boolean => (
  useGlobalBlockingRequestsStore((state) => Boolean(sessionId && callId && state.bySession.get(sessionId)?.pages.some((page) => page.id === callId)))
);

/**
 * The pages that stopped waiting between two states of the index, as
 * `sessionID:pageID`: answered, settled by the host's snapshot after a missed
 * end, or gone with their session.
 */
export const settledPageKeys = (
  previous: ReadonlyMap<string, PendingBlockingRequests>,
  next: ReadonlyMap<string, PendingBlockingRequests>,
): string[] => {
  const settled: string[] = [];
  for (const [sessionId, entry] of previous) {
    if (entry.pages.length === 0) continue;
    const remaining = next.get(sessionId)?.pages;
    if (remaining === entry.pages) continue;
    const kept = new Set(remaining?.map((page) => page.id));
    for (const page of entry.pages) if (!kept.has(page.id)) settled.push(`${sessionId}:${page.id}`);
  }
  return settled;
};

export const resetGlobalBlockingRequests = (): void => {
  pageSnapshotObservers.clear();
  useGlobalBlockingRequestsStore.setState({ bySession: new Map() });
};

const normalizeDirectory = (directory: string): string => normalizeProjectPath(directory) ?? directory;

// The live events carry the whole request; only the rendered fields are kept,
// so the index holds the same shape the host seed can provide and a long-lived
// global map never retains a form's full field definitions.
const toBlockingPermission = ({ id, sessionID, action, resources, save }: PermissionRequest): BlockingPermissionRequest => (
  { id, sessionID, action, resources, save }
);
const toBlockingForm = ({ id, sessionID, title }: FormRequest): BlockingFormRequest => ({ id, sessionID, title });

/**
 * Returns the list with the request added or replaced, or null when nothing
 * changed. OpenCode re-sends an unanswered ask, and the projection above makes
 * a fresh object every time, so equality is by value: an identical repeat must
 * not publish a new store snapshot to every subscriber.
 */
const upsertRequest = <T extends { id: string }>(list: readonly T[], request: T): readonly T[] | null => {
  const index = list.findIndex((entry) => entry.id === request.id);
  if (index === -1) return [...list, request];
=======
export type BlockingPermissionRequest = Pick<PermissionRequest, 'id' | 'sessionID' | 'action' | 'resources' | 'save'>;
export type BlockingFormRequest = Pick<FormRequest, 'id' | 'sessionID' | 'title'>;
type BlockingPageRequest = { id: string; sessionID: string; title: string };

type PendingBlockingRequests = {
  directory: string;
  permissions: readonly BlockingPermissionRequest[];
  forms: readonly BlockingFormRequest[];
  pages: readonly BlockingPageRequest[];
};

type GlobalBlockingRequestsState = {
  bySession: ReadonlyMap<string, PendingBlockingRequests>;
};

const EMPTY: readonly never[] = [];
type WaitingPageEvent = Extract<SyncEvent, { type: 'openchamber.page-waiting' | 'openchamber.page-settled' | 'session.deleted' }>;
const pageSnapshotObservers = new Set<(event: WaitingPageEvent) => void>();

const recordWaitingPageEvent = (event: WaitingPageEvent): void => {
  for (const observer of pageSnapshotObservers) observer(event);
};

export const useGlobalBlockingRequestsStore = create<GlobalBlockingRequestsState>(() => ({
  bySession: new Map(),
}));

export const useIsPageWaiting = (sessionId: string | null | undefined): boolean => (
  useGlobalBlockingRequestsStore((state) => Boolean(sessionId && state.bySession.get(sessionId)?.pages.length))
);

export const useIsCallWaiting = (sessionId: string | null | undefined, callId: string | null | undefined): boolean => (
  useGlobalBlockingRequestsStore((state) => Boolean(sessionId && callId && state.bySession.get(sessionId)?.pages.some((page) => page.id === callId)))
);

export const settledPageKeys = (
  previous: ReadonlyMap<string, PendingBlockingRequests>,
  next: ReadonlyMap<string, PendingBlockingRequests>,
): string[] => {
  const settled: string[] = [];
  for (const [sessionId, entry] of previous) {
    if (entry.pages.length === 0) continue;
    const remaining = next.get(sessionId)?.pages;
    if (remaining === entry.pages) continue;
    const kept = new Set(remaining?.map((page) => page.id));
    for (const page of entry.pages) if (!kept.has(page.id)) settled.push(`${sessionId}:${page.id}`);
  }
  return settled;
};

export const resetGlobalBlockingRequests = (): void => {
  pageSnapshotObservers.clear();
  useGlobalBlockingRequestsStore.setState({ bySession: new Map() });
};

const normalizeDirectory = (directory: string): string => normalizeProjectPath(directory) ?? directory;

const toBlockingPermission = ({ id, sessionID, action, resources, save }: PermissionRequest): BlockingPermissionRequest => (
  { id, sessionID, action, resources, save }
);
const toBlockingForm = ({ id, sessionID, title }: FormRequest): BlockingFormRequest => ({ id, sessionID, title });

const upsertRequest = <T extends { id: string }>(list: readonly T[], request: T): readonly T[] | null => {
  const index = list.findIndex((entry) => entry.id === request.id);
  if (index === -1) return [...list, request];
>>>>>>> upstream/main
  if (JSON.stringify(list[index]) === JSON.stringify(request)) return null;
  const next = [...list]; next[index] = request; return next;
};
<<<<<<< HEAD
const withoutRequest = <T extends { approvalId?: string; questionId?: string }>(list: readonly T[], id: string | undefined): readonly T[] | null => {
  if (!id) return list.length === 0 ? null : [];
  const next = list.filter((entry) => (entry.approvalId ?? entry.questionId) !== id);
||||||| bc50ba56aa

/** Returns the list without the request, or null when nothing changed. A missing id settles the whole kind. */
const withoutRequest = <T extends { id: string }>(list: readonly T[], requestId: string | undefined): readonly T[] | null => {
  if (!requestId) return list.length === 0 ? null : EMPTY;
  const next = list.filter((entry) => entry.id !== requestId);
=======

const withoutRequest = <T extends { id: string }>(list: readonly T[], requestId: string | undefined): readonly T[] | null => {
  if (!requestId) return list.length === 0 ? null : EMPTY;
  const next = list.filter((entry) => entry.id !== requestId);
>>>>>>> upstream/main
  return next.length === list.length ? null : next;
};
type Draft = Map<string, PendingBlockingRequests>;
class Reducer {
  private draft: Draft | null = null;
  constructor(private readonly state: GlobalBlockingRequestsState) {}
  current(sessionId: string): PendingBlockingRequests | undefined { return (this.draft ?? this.state.bySession).get(sessionId); }
  observe(request: ApprovalRequest | QuestionRequest): boolean {
    const key = 'approvalId' in request ? `approval:${request.approvalId}` : `question:${request.questionId}`;
    let known = requests.get(request.sessionId);
    const previous = known?.get(key);
    if (previous && (previous.epoch !== request.epoch || previous.workerGeneration !== request.workerGeneration || compareCounters(request.version, previous.version) <= 0)) return false;
    if (!known) { known = new Map(); requests.set(request.sessionId, known); }
    known.set(key, request);
    return true;
  }
  write(sessionId: string, entry: PendingBlockingRequests): void {
    const existing = this.current(sessionId);
    if (!existing && entry.permissions.length === 0 && entry.forms.length === 0) return;
    if (existing?.directory === entry.directory && JSON.stringify(existing.permissions) === JSON.stringify(entry.permissions) && JSON.stringify(existing.forms) === JSON.stringify(entry.forms)) return;
    this.draft ??= new Map(this.state.bySession);
    if (entry.permissions.length === 0 && entry.forms.length === 0) this.draft.delete(sessionId);
    else this.draft.set(sessionId, entry);
  }
  ask(directory: string, request: BlockingPermissionRequest | BlockingFormRequest): void {
    const sessionId = request.sessionId; const existing = this.current(sessionId) ?? { directory, permissions: EMPTY_PERMISSIONS, forms: EMPTY_FORMS };
    if ('approvalId' in request) {
      const permissions = upsertRequest(existing.permissions, request);
      if (permissions || existing.directory !== directory) this.write(sessionId, { directory, permissions: permissions ?? existing.permissions, forms: existing.forms });
    } else {
      const forms = upsertRequest(existing.forms, request);
      if (forms || existing.directory !== directory) this.write(sessionId, { directory, permissions: existing.permissions, forms: forms ?? existing.forms });
    }
  }
  settle(kind: 'permissions' | 'forms', sessionId: string, id: string): void {
    const existing = this.current(sessionId); if (!existing) return;
    if (kind === 'permissions') {
      const permissions = withoutRequest(existing.permissions, id);
      if (permissions) this.write(sessionId, { ...existing, permissions });
    } else {
      const forms = withoutRequest(existing.forms, id);
      if (forms) this.write(sessionId, { ...existing, forms });
    }
  }
  remove(sessionId: string): void { if (this.current(sessionId)) this.write(sessionId, { ...this.current(sessionId)!, permissions: EMPTY_PERMISSIONS, forms: EMPTY_FORMS }); }
  publish(): void { if (this.draft) useGlobalBlockingRequestsStore.setState({ bySession: this.draft }); }
}
<<<<<<< HEAD
export const applyGlobalBlockingRequestEvents = (rawDirectory: string, payloads: readonly CanonicalEvent[]): void => {
||||||| bc50ba56aa

/** Applies request lifecycle events for one directory. Other event types are ignored cheaply. */
export const applyGlobalBlockingRequestEvents = (rawDirectory: string, payloads: readonly SyncEvent[]): void => {
=======

export const applyGlobalBlockingRequestEvents = (rawDirectory: string, payloads: readonly SyncEvent[]): void => {
>>>>>>> upstream/main
  if (payloads.length === 0) return;
  const reducer = new Reducer(useGlobalBlockingRequestsStore.getState());
  for (const event of payloads) {
    const snapshot = snapshots.get(event.sessionId);
    if (snapshot && snapshot.epoch !== event.epoch) continue;
    switch (event.type) {
      case 'approval.requested':
      case 'approval.resolved':
        if (event.approval.sessionId !== event.sessionId || event.approval.epoch !== event.epoch || !reducer.observe(event.approval)) break;
        if (event.approval.status === 'pending') reducer.ask(rawDirectory, event.approval);
        else reducer.settle('permissions', event.sessionId, event.approval.approvalId);
        break;
      case 'question.requested':
      case 'question.resolved':
        if (event.question.sessionId !== event.sessionId || event.question.epoch !== event.epoch || !reducer.observe(event.question)) break;
        if (event.question.status === 'pending') reducer.ask(rawDirectory, event.question);
        else reducer.settle('forms', event.sessionId, event.question.questionId);
        break;
      case 'session.deleted': for (const id of event.deletedSessionIds) { reducer.remove(id); requests.delete(id); snapshots.delete(id); } break;
      default: break;
    }
  }
<<<<<<< HEAD
||||||| bc50ba56aa

  reducer.publish();
};

/**
 * Applies the server's announcement that a page an agent showed started or
 * stopped waiting for the user's answer. The server names the session's
 * directory when it knows it; otherwise `resolveDirectory` finds it, and a
 * page whose session this client cannot place is left out until the next
 * seed.
 */
export const applyWaitingPageEvent = (
  event: Extract<SyncEvent, { type: 'openchamber.page-waiting' | 'openchamber.page-settled' }>,
  resolveDirectory: (sessionId: string) => string | null,
): void => {
  recordWaitingPageEvent(event);
  const reducer = new Reducer(useGlobalBlockingRequestsStore.getState());
  if (event.type === 'openchamber.page-settled') {
    reducer.settle('pages', event.properties.sessionID, event.properties.pageID);
  } else {
    const { sessionID, page } = event.properties;
    const directory = event.properties.directory ?? resolveDirectory(sessionID);
    if (!directory) return;
    reducer.ask(normalizeDirectory(directory), sessionID, { kind: 'page', request: { id: page.id, sessionID, title: page.title } });
  }
=======

  reducer.publish();
};

export const applyWaitingPageEvent = (
  event: Extract<SyncEvent, { type: 'openchamber.page-waiting' | 'openchamber.page-settled' }>,
  resolveDirectory: (sessionId: string) => string | null,
): void => {
  recordWaitingPageEvent(event);
  const reducer = new Reducer(useGlobalBlockingRequestsStore.getState());
  if (event.type === 'openchamber.page-settled') {
    reducer.settle('pages', event.properties.sessionID, event.properties.pageID);
  } else {
    const { sessionID, page } = event.properties;
    const directory = event.properties.directory ?? resolveDirectory(sessionID);
    if (!directory) return;
    reducer.ask(normalizeDirectory(directory), sessionID, { kind: 'page', request: { id: page.id, sessionID, title: page.title } });
  }
>>>>>>> upstream/main
  reducer.publish();
};
<<<<<<< HEAD
export const seedGlobalBlockingRequests = (entries: ReadonlyArray<{ sessionId: string; directory: string; permissions: readonly BlockingPermissionRequest[]; forms: readonly BlockingFormRequest[] }>): void => {
  const state = useGlobalBlockingRequestsStore.getState(); const reducer = new Reducer(state);
  for (const entry of entries) {
    if (state.bySession.has(entry.sessionId) || snapshots.has(entry.sessionId) || requests.has(entry.sessionId)) continue;
    const permissions = entry.permissions.filter((request) => request.sessionId === entry.sessionId && request.status === 'pending');
    const forms = entry.forms.filter((request) => request.sessionId === entry.sessionId && request.status === 'pending');
    for (const request of [...permissions, ...forms]) reducer.observe(request);
    reducer.write(entry.sessionId, { directory: entry.directory, permissions, forms });
||||||| bc50ba56aa

/**
 * The host owns page waits directly, unlike permissions and forms forwarded
 * from OpenCode. Its complete pending map can clear pages after a missed end
 * event. Overlay events received during the read, including settlements whose
 * ask was missed, so a delayed response cannot bring an answered page back.
 * Only this in-flight read retains those mutations.
 */
export const readHostBlockingRequestsSnapshot = async (
  read: () => Promise<HostSessionStatusSnapshot | null>,
  resolveDirectory: (sessionId: string) => string | null,
): Promise<HostSessionStatusSnapshot | null> => {
  const changes = new Map<string, Map<string, BlockingPageRequest | null> | null>();
  const observe = (event: WaitingPageEvent): void => {
    const sessionId = event.properties.sessionID;
    if (event.type === 'session.deleted') {
      changes.set(sessionId, null);
      return;
    }
    const pages = changes.get(sessionId) ?? new Map<string, BlockingPageRequest | null>();
    if (event.type === 'openchamber.page-settled') pages.set(event.properties.pageID, null);
    else pages.set(event.properties.page.id, { id: event.properties.page.id, sessionID: sessionId, title: event.properties.page.title });
    changes.set(sessionId, pages);
  };
  pageSnapshotObservers.add(observe);
  try {
    const snapshot = await read();
    if (!snapshot || !pageSnapshotObservers.has(observe)) return null;
    // Omitted pending is unsupported, not an authoritative empty map.
    if (!snapshot.pending) return snapshot;
    const pending = snapshot.pending;
    const state = useGlobalBlockingRequestsStore.getState();
    const reducer = new Reducer(state);
    const sessionIds = new Set([...state.bySession.keys(), ...Object.keys(pending), ...changes.keys()]);
    for (const sessionId of sessionIds) {
      if (changes.get(sessionId) === null) continue;
      const current = state.bySession.get(sessionId);
      const directory = current?.directory ?? resolveDirectory(sessionId);
      // The host snapshot says nothing about waits owned by a space server.
      if (!directory || isSpaceDirectory(directory)) continue;
      const entry = pending[sessionId];
      const pagesById = new Map((entry?.pages ?? EMPTY).map(page => [page.id, page]));
      for (const [id, page] of changes.get(sessionId) ?? []) {
        if (page) pagesById.set(id, page);
        else pagesById.delete(id);
      }
      const pages = [...pagesById.values()];
      if (current && JSON.stringify(current.pages) === JSON.stringify(pages)) continue;
      const permissions = current?.permissions ?? entry?.permissions ?? EMPTY;
      const forms = current?.forms ?? entry?.forms ?? EMPTY;
      if (!current && permissions.length === 0 && forms.length === 0 && pages.length === 0) continue;
      reducer.write(sessionId, { directory: normalizeDirectory(directory), permissions, forms, pages });
    }
    reducer.publish();
    return snapshot;
  } finally {
    pageSnapshotObservers.delete(observe);
=======

export const readHostBlockingRequestsSnapshot = async (
  read: () => Promise<HostSessionStatusSnapshot | null>,
  resolveDirectory: (sessionId: string) => string | null,
): Promise<HostSessionStatusSnapshot | null> => {
  const changes = new Map<string, Map<string, BlockingPageRequest | null> | null>();
  const observe = (event: WaitingPageEvent): void => {
    const sessionId = event.properties.sessionID;
    if (event.type === 'session.deleted') {
      changes.set(sessionId, null);
      return;
    }
    const pages = changes.get(sessionId) ?? new Map<string, BlockingPageRequest | null>();
    if (event.type === 'openchamber.page-settled') pages.set(event.properties.pageID, null);
    else pages.set(event.properties.page.id, { id: event.properties.page.id, sessionID: sessionId, title: event.properties.page.title });
    changes.set(sessionId, pages);
  };
  pageSnapshotObservers.add(observe);
  try {
    const snapshot = await read();
    if (!snapshot || !pageSnapshotObservers.has(observe)) return null;
    if (!snapshot.pending) return snapshot;
    const pending = snapshot.pending;
    const state = useGlobalBlockingRequestsStore.getState();
    const reducer = new Reducer(state);
    const sessionIds = new Set([...state.bySession.keys(), ...Object.keys(pending), ...changes.keys()]);
    for (const sessionId of sessionIds) {
      if (changes.get(sessionId) === null) continue;
      const current = state.bySession.get(sessionId);
      const directory = current?.directory ?? resolveDirectory(sessionId);
      if (!directory || isSpaceDirectory(directory)) continue;
      const entry = pending[sessionId];
      const pagesById = new Map((entry?.pages ?? EMPTY).map(page => [page.id, page]));
      for (const [id, page] of changes.get(sessionId) ?? []) {
        if (page) pagesById.set(id, page);
        else pagesById.delete(id);
      }
      const pages = [...pagesById.values()];
      if (current && JSON.stringify(current.pages) === JSON.stringify(pages)) continue;
      const permissions = current?.permissions ?? entry?.permissions ?? EMPTY;
      const forms = current?.forms ?? entry?.forms ?? EMPTY;
      if (!current && permissions.length === 0 && forms.length === 0 && pages.length === 0) continue;
      reducer.write(sessionId, { directory: normalizeDirectory(directory), permissions, forms, pages });
    }
    reducer.publish();
    return snapshot;
  } finally {
    pageSnapshotObservers.delete(observe);
>>>>>>> upstream/main
  }
  reducer.publish();
};
export const replaceGlobalBlockingRequestSnapshot = (directory: string, snapshot: SessionSnapshot): void => {
  const { sessionId, epoch, headSequence } = snapshot.session;
  const previous = snapshots.get(sessionId);
  if (previous?.epoch === epoch && compareCounters(headSequence, previous.sequence) < 0) return;
  snapshots.set(sessionId, { epoch, sequence: headSequence });
  requests.delete(sessionId);
  const reducer = new Reducer(useGlobalBlockingRequestsStore.getState());
  const approvals = snapshot.approvals.filter((request): request is ApprovalRequest => request.sessionId === sessionId && request.epoch === epoch && request.status === 'pending');
  const questions = snapshot.questions.filter((request): request is QuestionRequest => request.sessionId === sessionId && request.epoch === epoch && request.status === 'pending');
  for (const request of approvals) reducer.observe(request);
  for (const request of questions) reducer.observe(request);
  reducer.write(sessionId, { directory, permissions: approvals, forms: questions });
  reducer.publish();
};
