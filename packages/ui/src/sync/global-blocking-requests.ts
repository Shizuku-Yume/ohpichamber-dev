

import { create, type StoreApi, type UseBoundStore } from 'zustand';
import type { ApprovalRequest, CanonicalEvent, QuestionRequest, SessionSnapshot } from '@openchamber/agent-contract';
import { compareCounters } from './event-reducer';

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
  if (JSON.stringify(list[index]) === JSON.stringify(request)) return null;
  const next = [...list]; next[index] = request; return next;
};
const withoutRequest = <T extends { approvalId?: string; questionId?: string }>(list: readonly T[], id: string | undefined): readonly T[] | null => {
  if (!id) return list.length === 0 ? null : [];
  const next = list.filter((entry) => (entry.approvalId ?? entry.questionId) !== id);
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
export const applyGlobalBlockingRequestEvents = (rawDirectory: string, payloads: readonly CanonicalEvent[]): void => {
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
  reducer.publish();
};
export const seedGlobalBlockingRequests = (entries: ReadonlyArray<{ sessionId: string; directory: string; permissions: readonly BlockingPermissionRequest[]; forms: readonly BlockingFormRequest[] }>): void => {
  const state = useGlobalBlockingRequestsStore.getState(); const reducer = new Reducer(state);
  for (const entry of entries) {
    if (state.bySession.has(entry.sessionId) || snapshots.has(entry.sessionId) || requests.has(entry.sessionId)) continue;
    const permissions = entry.permissions.filter((request) => request.sessionId === entry.sessionId && request.status === 'pending');
    const forms = entry.forms.filter((request) => request.sessionId === entry.sessionId && request.status === 'pending');
    for (const request of [...permissions, ...forms]) reducer.observe(request);
    reducer.write(entry.sessionId, { directory: entry.directory, permissions, forms });
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

export const useIsPageWaiting = (sessionId: string | null | undefined): boolean => (
  useGlobalBlockingRequestsStore((state) => Boolean(sessionId && state.bySession.get(sessionId)?.pages.length))
);

export const useIsCallWaiting = (sessionId: string | null | undefined, callId: string | null | undefined): boolean => (
  useGlobalBlockingRequestsStore((state) => Boolean(sessionId && callId && state.bySession.get(sessionId)?.pages.some((page) => page.id === callId)))
);
