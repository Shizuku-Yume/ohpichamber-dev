import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { switchRuntimeEndpoint } from './runtime-switch';
import { opencodeClient } from './opencode/client';
import type { Session } from './opencode/model';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSelectionStore } from '@/sync/selection-store';
import { ChildStoreManager } from '@/sync/child-store';
import { setActionRefs, setOptimisticRefs } from '@/sync/session-actions';

<<<<<<< HEAD
import {
  assertAutoReviewRuntimeStillCurrent,
  claimAutoReviewForward,
  releaseAutoReviewForward,
  hasFinalReviewMarker,
  isAutoReviewRuntimeCurrent,
  stripFinalReviewMarker,
} from './reviewFlow';
import type { AutoReviewRun } from '@/stores/useAutoReviewStore';
import type { Session, SessionSnapshot } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as actions from '@/sync/session-actions';
import { useSelectionStore } from '@/sync/selection-store';
import { useConfigStore } from '@/stores/useConfigStore';
import { sendImplementationResponseToReviewer, sendReviewFeedbackToOriginal, startReviewFlow } from './reviewFlow';
=======
import { assertAutoReviewRuntimeStillCurrent, isAutoReviewRuntimeCurrent, sendReviewFeedbackToOriginal } from './reviewFlow';
>>>>>>> bc50ba56a

describe('reviewFlow auto-review helpers', () => {
  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-a.test', runtimeKey: 'runtime-a' });
  });

  test('runtime guard rejects a start that began on another runtime', () => {
    expect(isAutoReviewRuntimeCurrent('runtime-a')).toBe(true);
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-b.test', runtimeKey: 'runtime-b' });
    expect(isAutoReviewRuntimeCurrent('runtime-a')).toBe(false);
    expect(() => assertAutoReviewRuntimeStillCurrent('runtime-a')).toThrow('runtime changed');
  });
});

describe('review feedback model pick settlement', () => {
  let manager: ChildStoreManager;
  const spies: Array<{ mockRestore: () => void }> = [];
  const original: Session = {
    id: 'original', projectID: 'project', directory: '/repo', title: 'Original',
    model: { providerID: 'p', id: 'picked' }, time: { created: 1, updated: 1 },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  };

  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-a.test', runtimeKey: 'runtime-a' });
    manager = new ChildStoreManager();
    manager.ensureChild('/repo', { bootstrap: false }).setState({ session: [original] });
    setActionRefs(manager, () => '/repo');
    setOptimisticRefs(() => {}, () => {});
    useConfigStore.setState({ isConnected: true, currentAgentName: undefined });
    useSelectionStore.setState({ sessionPickedModels: new Map() });
    useSelectionStore.getState().saveSessionModelSelection('original', 'p', 'picked');
    useSelectionStore.getState().pickSessionModel('original', 'p', 'picked');
    spies.push(spyOn(opencodeClient, 'getSession').mockResolvedValue({
      ...original, id: 'review', metadata: { openchamber: { kind: 'review', originalSessionID: 'original' } },
    }));
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ version: 1, overrides: {} })));
  });

  afterEach(() => {
    for (const spy of spies.splice(0)) spy.mockRestore();
    manager.disposeAll();
  });

  test('a failed review feedback send keeps its pick, then a successful send settles it', async () => {
    spies.push(spyOn(opencodeClient, 'sendMessage').mockRejectedValueOnce(new Error('send refused')).mockResolvedValue('msg'));
    await expect(sendReviewFeedbackToOriginal('review', '/repo', 'Feedback')).rejects.toThrow('send refused');
    expect(useSelectionStore.getState().getSessionModelPick('original')).toEqual({ providerId: 'p', modelId: 'picked' });
    await sendReviewFeedbackToOriginal('review', '/repo', 'Feedback');
    expect(useSelectionStore.getState().getSessionModelPick('original')).toBeNull();
  });

  test('a successful feedback send settles the captured runtime and leaves its replacement alone', async () => {
    spies.push(spyOn(opencodeClient, 'sendMessage').mockImplementation(async () => {
      switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-b.test', runtimeKey: 'runtime-b' });
      useSelectionStore.getState().pickSessionModel('original', 'p', 'picked');
      return 'msg';
    }));
    await sendReviewFeedbackToOriginal('review', '/repo', 'Feedback');
    expect(useSelectionStore.getState().getSessionModelPick('original')).toEqual({ providerId: 'p', modelId: 'picked' });
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-a.test', runtimeKey: 'runtime-a' });
    expect(useSelectionStore.getState().getSessionModelPick('original')).toBeNull();
  });
});

describe('review native prompt delivery', () => {
  const spies: Array<{ mockRestore(): void }> = [];
  afterEach(() => { for (const spy of spies.splice(0).reverse()) spy.mockRestore(); });
  test.each(['command', 'template', 'text', 'failure', 'stale', 'aba', 'plain'] as const)('forwards generated primary text through native expansion: %s', async (mode) => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://review.test', runtimeKey: 'review-test' });
    const session: Session = { sessionId: 'review', rootSessionId: 'review', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadata: { openchamber: { kind: 'review', originalSessionID: 'original' } }, metadataRevision: '1', archiveRevision: '0' };
    const snapshot: SessionSnapshot = { session, cursor: 'epoch:0', activeRun: null, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } };
    spies.push(spyOn(canonicalClient, 'getSession').mockResolvedValue(snapshot));
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [session], errors: {} }));
    spies.push(spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ projectId: 'project', workspaceId: 'workspace', name: 'repo' }));
    const text = mode === 'plain' ? 'Generated review feedback\n#literal' : '/review "two words"\n trailing  ';
    const selection = useSelectionStore.getState();
    selection.saveSessionModelSelection('original', 'captured', 'model');
    selection.saveSessionAgentSelection('original', 'agent');
    selection.saveAgentModelForSession('original', 'agent', 'captured', 'model');
    selection.saveAgentModelVariantForSession('original', 'agent', 'captured', 'model', 'high');
    const send = spyOn(actions, 'sendMessage').mockResolvedValue(null);
    const optimistic = spyOn(actions, 'optimisticSend').mockImplementation(async (input) => {
      input.beforeOptimisticInsert?.();
      input.onMessageID?.('message');
      await input.send('message', input.context ?? []);
    });
    spies.push(send, optimistic);
    const requests: Request[] = [];
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const request = new Request(new URL(url instanceof Request ? url.url : String(url), 'http://test'), init);
      if (new URL(request.url).pathname === '/api/magic-prompts') {
        expect(new URL(request.url).searchParams.get('sessionDirectory')).toBe('/repo');
        return Response.json({ version: 1, overrides: { 'session.reviewFeedbackToImplementer.visible': text } });
      }
      // The runtime endpoint switch fires a swallowed auth-token mint on the
      // same global fetch; only the expansion call is this test's subject.
      if (new URL(request.url).pathname !== '/api/agent/v1/workspaces/workspace/commands/expand-text') return Response.json({});
      requests.push(request);
      expect(await request.json()).toEqual({ text });
      if (mode === 'failure') return new Response('unavailable', { status: 503 });
      if (mode === 'stale') switchRuntimeEndpoint({ apiBaseUrl: 'http://other.test', runtimeKey: 'other-review' });
      if (mode === 'aba') {
        switchRuntimeEndpoint({ apiBaseUrl: 'http://other.test', runtimeKey: 'other-review' });
        switchRuntimeEndpoint({ apiBaseUrl: 'http://review.test', runtimeKey: 'review-test' });
      }
      return Response.json(mode === 'command' || mode === 'template' ? { kind: mode, content: '/expanded once', modelSelection: { providerId: 'bound', modelId: 'bound-model' }, agentId: 'bound-agent' } : { kind: 'text', content: text });
    }));
    const result = sendReviewFeedbackToOriginal('review', '/repo', 'Feedback');
    if (mode === 'failure' || mode === 'stale' || mode === 'aba') {
      await expect(result).rejects.toThrow();
      expect(optimistic).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      return;
    }
    expect(await result).toBe('message');
    expect(requests).toHaveLength(mode === 'plain' ? 0 : 1);
    const matched = mode === 'command' || mode === 'template';
    expect(send.mock.calls[0][0].request).toMatchObject({ input: { text: matched ? '/expanded once' : text }, options: { providerId: matched ? 'bound' : 'captured', modelId: matched ? 'bound-model' : 'model', agentId: null, variant: null, reasoningEffort: null } });
  });
});

test.each(['feedback', 'response'] as const)('manual %s does not send after A-B-A during prompt loading', async (direction) => {
  switchRuntimeEndpoint({ apiBaseUrl: 'http://review-aba.test', runtimeKey: 'review-aba' });
  const base: Session = { sessionId: 'original', rootSessionId: 'original', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const }, metadata: { openchamber: { reviewSessionID: 'review' } }, metadataRevision: '1', archiveRevision: '0' };
  const review: Session = { ...base, sessionId: 'review', rootSessionId: 'review', metadata: { openchamber: { kind: 'review', originalSessionID: 'original' } } };
  const snapshot = (session: Session): SessionSnapshot => ({ session, cursor: 'epoch:0', activeRun: null, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } });
  const get = spyOn(canonicalClient, 'getSession').mockImplementation(async (id) => snapshot(id === 'original' ? base : review));
  const list = spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [base, review], errors: {} });
  const send = spyOn(actions, 'optimisticSend').mockResolvedValue(undefined);
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { started = resolve; });
  const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input), 'http://review-aba.test');
    if (url.pathname !== '/api/magic-prompts') return Response.json({});
    started(); await gate;
    return Response.json({ version: 1, overrides: {} });
  });
  try {
    const pending = direction === 'feedback' ? sendReviewFeedbackToOriginal('review', '/repo', 'feedback') : sendImplementationResponseToReviewer('original', '/repo', 'response');
    await reached;
    switchRuntimeEndpoint({ apiBaseUrl: 'http://other.test', runtimeKey: 'review-other' });
    switchRuntimeEndpoint({ apiBaseUrl: 'http://review-aba.test', runtimeKey: 'review-aba' });
    release();
    await expect(pending).rejects.toThrow('runtime changed');
    expect(send).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore(); send.mockRestore(); list.mockRestore(); get.mockRestore();
  }
});

test('manual review creation does not link or send after an A-B-A runtime switch', async () => {
  switchRuntimeEndpoint({ apiBaseUrl: 'http://review-create.test', runtimeKey: 'review-create' });
  const original: Session = { sessionId: 'original', rootSessionId: 'original', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' as const }, metadata: null, metadataRevision: '0', archiveRevision: '0' };
  const snapshot: SessionSnapshot = { session: original, cursor: 'epoch:0', activeRun: null, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } };
  let release!: () => void; let started!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const reached = new Promise<void>((resolve) => { started = resolve; });
  const spies = [
    spyOn(actions, 'waitForConnectionOrThrow').mockResolvedValue(undefined),
    spyOn(canonicalClient, 'getSession').mockResolvedValue(snapshot),
    spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [original], errors: {} }),
    spyOn(canonicalClient, 'createSession').mockImplementation(async () => { started(); await gate; return { session: { ...original, sessionId: 'review', rootSessionId: 'review' } }; }),
    spyOn(globalThis, 'fetch').mockImplementation(async () => Response.json({ version: 1, overrides: {} })),
  ];
  const patch = spyOn(actions, 'patchSessionMetadata').mockResolvedValue(original);
  const send = spyOn(actions, 'optimisticSend').mockResolvedValue(undefined);
  try {
    const pending = startReviewFlow({ originalSessionID: 'original', directory: '/repo', providerId: 'provider', modelId: 'model', generateHandoff: false });
    await reached;
    switchRuntimeEndpoint({ apiBaseUrl: 'http://other.test', runtimeKey: 'review-other' });
    switchRuntimeEndpoint({ apiBaseUrl: 'http://review-create.test', runtimeKey: 'review-create' });
    release();
    await expect(pending).rejects.toThrow('runtime changed');
    expect(patch).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  } finally { send.mockRestore(); patch.mockRestore(); for (const spy of spies.reverse()) spy.mockRestore(); }
});

describe('review native prompt optimistic boundary', () => {
  const spies: Array<{ mockRestore(): void }> = [];
  const originalConfig = useConfigStore.getState();
  afterEach(() => {
    for (const spy of spies.splice(0).reverse()) spy.mockRestore();
    actions.setOptimisticRefs(() => {}, () => {}, () => {});
    useConfigStore.setState(originalConfig);
  });

  test('shows the pending user message before the native send settles and rolls it back on rejection', async () => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://review-optimistic.test', runtimeKey: 'review-optimistic' });
    useConfigStore.setState({ isConnected: true, hasEverConnected: true });
    const session: Session = { sessionId: 'review', rootSessionId: 'review', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadata: { openchamber: { kind: 'review', originalSessionID: 'original' } }, metadataRevision: '1', archiveRevision: '0' };
    const snapshot: SessionSnapshot = { session, cursor: 'epoch:0', activeRun: null, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } };
    spies.push(spyOn(canonicalClient, 'getSession').mockResolvedValue(snapshot));
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [session], errors: {} }));
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      const requestUrl = new URL(url instanceof Request ? url.url : String(url), 'http://test');
      if (requestUrl.pathname === '/api/magic-prompts') {
        expect(requestUrl.searchParams.get('sessionDirectory')).toBe('/repo');
        return Response.json({ version: 1, overrides: { 'session.reviewFeedbackToImplementer.visible': 'Generated review feedback' } });
      }
      return Response.json({});
    }));
    const selection = useSelectionStore.getState();
    selection.saveSessionModelSelection('original', 'captured', 'model');

    const calls: string[] = [];
    let pendingId: string | null = null;
    actions.setOptimisticRefs(
      (input) => {
        pendingId = input.message.messageId;
        expect(input.message.role).toBe('user');
        expect(input.message.sessionId).toBe('original');
        expect(input.message.parts).toEqual([{ type: 'text', partId: expect.any(String), content: 'Generated review feedback' }]);
        calls.push('add');
      },
      (input) => {
        expect(input.messageId).toBe(pendingId);
        calls.push('remove');
      },
    );
    spies.push(spyOn(actions, 'sendMessage').mockImplementation(async () => {
      expect(pendingId).not.toBeNull();
      calls.push('send');
      throw new Error('rejected');
    }));

    await expect(sendReviewFeedbackToOriginal('review', '/repo', 'Feedback')).rejects.toThrow('rejected');

    expect(calls).toEqual(['add', 'send', 'remove']);
    expect(pendingId).not.toBeNull();
  });
});
