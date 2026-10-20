import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Message, Session, SessionMetadata, SessionSnapshot, Turn } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as sessionActions from '@/sync/session-actions';
import { useBtwStore } from '@/stores/useBtwStore';
import { ChildStoreManager } from '@/sync/child-store';
import { setSyncRefs } from '@/sync/sync-refs';
import { useSelectionStore } from '@/sync/selection-store';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { BTW_BOUNDARY_INSTRUCTION, filterBtwTailMessages, startBtwSession } from './btw';
import { withBtwSessionLink, withBtwSessionMarker, withoutBtwSessionLink, withoutBtwSessionMarker } from './sessionBtwMetadata';

const message = (messageId: string, role: Message['role'] = 'assistant'): Message => ({
  messageId, sessionId: 'session_1', turnId: 'turn_1', role, createdAt: Number(messageId.replace(/\D/g, '') || 1),
  parts: [],
});

describe('btw metadata and tail helpers', () => {
  test('filters messages strictly after the recorded boundary', () => {
    const records = [message('msg_1'), message('msg_2'), message('msg_3')].map((info) => ({ info, parts: info.parts }));
    expect(filterBtwTailMessages(records, 'msg_2').map((record) => record.info.messageId)).toEqual(['msg_3']);
    expect(filterBtwTailMessages(records, null)).toEqual(records);
    expect(filterBtwTailMessages(records, 'missing')).toEqual(records);
  });

  test('writes and removes native btw link and marker fields', () => {
    const linked = withBtwSessionLink({}, 'session_btw');
    expect(linked.openchamber?.btwSessionID).toBe('session_btw');
    expect(withoutBtwSessionLink(linked, 'other')).toBe(linked);
    expect(withoutBtwSessionLink(linked, 'session_btw')).toEqual({});

    const marked = withBtwSessionMarker({}, 'session_parent', 'msg_boundary');
    expect(marked.openchamber).toEqual({ kind: 'btw', originalSessionID: 'session_parent', btwBoundaryMessageID: 'msg_boundary' });
    expect(withoutBtwSessionMarker(marked)).toEqual({ openchamber: { btwPromoted: true } });
  });

  test('preserves unrelated metadata while changing btw fields', () => {
    const metadata: SessionMetadata = { title: 'Thread', notes: 'keep' };
    const marked = withBtwSessionMarker(metadata, 'parent', null);
    expect(marked.title).toBe('Thread');
    expect(marked.notes).toBe('keep');
    expect(marked.openchamber?.btwBoundaryMessageID).toBeUndefined();
  });
});

describe('native btw fork and delivery', () => {
  const restorers: Array<() => void> = [];
  afterEach(() => {
    for (const restore of restorers.splice(0).reverse()) restore();
    useBtwStore.setState({ byParent: {} });
  });

  test.each(['plain', 'command', 'template', 'text', 'failure', 'stale', 'queued', 'send-failure'] as const)('keeps captured Btw scope and native expansion: %s', async (mode) => {
    const fails = mode === 'send-failure';
    const question = mode === 'plain' || fails ? 'Side question' : '/side "two words"\n trailing  ';
    const expanded = mode === 'command' || mode === 'template';
    setSyncRefs(new ChildStoreManager(), '/repo');
    const parent: Session = {
      sessionId: 'parent', rootSessionId: 'parent', workspaceId: 'workspace_parent', projectId: 'project_parent',
      displayPath: '.', epoch: 'epoch_parent', headSequence: '5', createdAt: 1, updatedAt: 3,
      runtimeStatus: 'running', activeRunId: 'run_running', metadata: null, metadataRevision: '0', archiveRevision: '0',
    };
    const fork: Session = { ...parent, sessionId: 'fork', rootSessionId: 'fork', runtimeStatus: 'idle', activeRunId: null };
    const turns: Turn[] = [
      { turnId: 'turn_completed', sessionId: parent.sessionId, runId: 'run_completed', status: 'completed', userMessageId: 'user_completed', assistantMessageIds: ['assistant_early', 'assistant_completed'], startedAt: 1, finishedAt: 2 },
      { turnId: 'turn_failed', sessionId: parent.sessionId, runId: 'run_failed', status: 'failed', userMessageId: 'user_failed', assistantMessageIds: ['assistant_failed'], startedAt: 2, finishedAt: 3 },
      { turnId: 'turn_running', sessionId: parent.sessionId, runId: 'run_running', status: 'running', userMessageId: 'user_running', assistantMessageIds: ['assistant_running'], startedAt: 3 },
    ];
    const snapshot: SessionSnapshot = {
      session: parent, cursor: 'epoch_parent:5', activeRun: { runId: 'run_running', sessionId: parent.sessionId, status: 'running', createdAt: 3 },
      branch: { branchId: 'branch_parent', branchVersion: '1', leafMessageId: 'assistant_running' },
      window: { firstTurnId: 'turn_completed', lastTurnId: 'turn_running', firstMessageId: 'user_completed', lastMessageId: 'assistant_running', hasEarlier: false },
      turns, messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
    };
    const metadata = new Map<string, SessionMetadata>();
    const ready = spyOn(sessionActions, 'waitForConnectionOrThrow').mockResolvedValue(undefined);
    const read = spyOn(canonicalClient, 'getSnapshot').mockResolvedValue(snapshot);
    const forkSession = spyOn(canonicalClient, 'forkSession').mockResolvedValue({ session: fork });
    const history = spyOn(canonicalClient, 'getHistory').mockResolvedValue({ sessionId: fork.sessionId, branch: snapshot.branch, turns: [], messages: [], nextCursor: null });
    const patch = spyOn(sessionActions, 'patchSessionMetadata').mockImplementation(async (sessionId, _directory, update) => {
      const next = update(metadata.get(sessionId) ?? {});
      metadata.set(sessionId, next);
      return { ...(sessionId === parent.sessionId ? parent : fork), metadata: next, metadataRevision: '1' };
    });
    const title = spyOn(sessionActions, 'updateSessionTitle').mockResolvedValue(undefined);
    const send = spyOn(sessionActions, 'sendMessage').mockImplementation(async () => { if (fails) throw new Error('native delivery failed'); });
    const remove = spyOn(sessionActions, 'deleteSession').mockResolvedValue(true);
    const selection = useSelectionStore.getState();
    const model = spyOn(selection, 'saveSessionModelSelection').mockImplementation(() => undefined);
    const agent = spyOn(selection, 'saveSessionAgentSelection').mockImplementation(() => undefined);
    const agentModel = spyOn(selection, 'saveAgentModelForSession').mockImplementation(() => undefined);
    const variant = spyOn(selection, 'saveAgentModelVariantForSession').mockImplementation(() => undefined);
    for (const mock of [ready, read, forkSession, history, patch, title, send, remove, model, agent, agentModel, variant]) restorers.push(() => mock.mockRestore());
    const requests: Request[] = [];
    const resolve = spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ projectId: 'project_parent', workspaceId: 'workspace_parent', name: 'repo' });
    const http = spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const request = new Request(new URL(url instanceof Request ? url.url : String(url), 'http://test'), init);
      requests.push(request);
      expect(new URL(request.url).pathname).toBe('/api/agent/v1/workspaces/workspace_parent/commands/expand-text');
      expect(await request.json()).toEqual({ text: question });
      if (mode === 'failure') return new Response('unavailable', { status: 503 });
      if (mode === 'stale') useBtwStore.getState().clearPanelState(parent.sessionId);
      return Response.json(expanded ? { kind: mode, content: '/expanded body\n', modelSelection: { providerId: 'bound', modelId: 'bound-model' }, agentId: 'bound-agent' } : { kind: 'text', content: question });
    });
    restorers.push(() => resolve.mockRestore(), () => http.mockRestore());
    const runtimeKey = getRuntimeKey();
    const result = startBtwSession({
      parentSessionId: parent.sessionId, directory: '/repo', expectedRuntimeKey: runtimeKey, question, fileResourcesExpanded: mode === 'queued',
      providerId: 'provider_captured', modelId: 'model_captured', agentId: 'agent_captured', variant: 'variant_captured',
      additionalParts: [{ text: 'Requested context' }],
    });
    if (mode === 'failure' || mode === 'stale') {
      await expect(result).rejects.toThrow();
      expect(forkSession).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      return;
    }
    if (fails) await expect(result).rejects.toThrow('native delivery failed');
    else expect(await result).toEqual(fork);
    expect(requests).toHaveLength(mode === 'plain' || fails || mode === 'queued' ? 0 : 1);
    expect(read).toHaveBeenCalledWith(parent.sessionId);
    expect(forkSession).toHaveBeenCalledWith(parent, { messageId: 'assistant_completed', mode: 'selected' });
    expect(model).toHaveBeenCalledWith(fork.sessionId, expanded ? 'bound' : 'provider_captured', expanded ? 'bound-model' : 'model_captured');
    expect(agent).toHaveBeenCalledWith(fork.sessionId, expanded ? 'bound-agent' : 'agent_captured');
    expect(send).toHaveBeenCalledWith({ sessionId: fork.sessionId, runtimeKey, request: {
      input: { text: expanded ? '/expanded body\n' : question, attachments: [], context: [{ kind: 'synthetic', text: BTW_BOUNDARY_INSTRUCTION }, { kind: 'instruction', text: 'Requested context' }] },
      options: { providerId: expanded ? 'bound' : 'provider_captured', modelId: expanded ? 'bound-model' : 'model_captured', agentId: expanded ? 'bound-agent' : 'agent_captured', variant: 'variant_captured', reasoningEffort: null },
    } });
    expect(metadata.get(fork.sessionId)?.openchamber?.btwBoundaryMessageID).toBe('assistant_completed');
    expect(metadata.get(parent.sessionId)?.openchamber?.btwSessionID).toBe(fails ? undefined : fork.sessionId);
    expect(remove).toHaveBeenCalledTimes(fails ? 1 : 0);
    expect(useBtwStore.getState().byParent[parent.sessionId]?.creating).toBe(false);
  });
});
