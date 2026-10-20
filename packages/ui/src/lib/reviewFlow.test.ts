import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { switchRuntimeEndpoint } from './runtime-switch';

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
import * as prompts from '@/lib/magicPrompts';
import * as knowledge from '@/lib/sessionKnowledgeApi';
import { useSelectionStore } from '@/sync/selection-store';
import { sendReviewFeedbackToOriginal } from './reviewFlow';

describe('reviewFlow auto-review helpers', () => {
  beforeEach(() => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-a.test', runtimeKey: 'runtime-a' });
  });

  test('detects and strips final review marker only from the final line', () => {
    const text = 'No remaining issues.\n\nFINAL_REVIEW_STATUS: no_remaining_findings\n';

    expect(hasFinalReviewMarker(text)).toBe(true);
    expect(stripFinalReviewMarker(text)).toBe('No remaining issues.');
  });

  test('detects and strips final review marker case-insensitively', () => {
    const text = 'No findings.\nFINAL_REVIEW_STATUS: no_remaining_findINGS\n';

    expect(hasFinalReviewMarker(text)).toBe(true);
    expect(stripFinalReviewMarker(text)).toBe('No findings.');
  });

  test('does not treat quoted or non-final marker text as completion', () => {
    const text = 'The marker is FINAL_REVIEW_STATUS: no_remaining_findings, but issues remain.';

    expect(hasFinalReviewMarker(text)).toBe(false);
    expect(stripFinalReviewMarker(text)).toBe(text);
  });

  test('runtime guard rejects runs from a stale runtime', () => {
    expect(isAutoReviewRuntimeCurrent('runtime-a')).toBe(true);
    switchRuntimeEndpoint({ apiBaseUrl: 'http://runtime-b.test', runtimeKey: 'runtime-b' });
    expect(isAutoReviewRuntimeCurrent('runtime-a')).toBe(false);
    expect(() => assertAutoReviewRuntimeStillCurrent('runtime-a')).toThrow('runtime changed');
  });

  test('claims only one in-flight forward for the same auto-review message', () => {
    const run: AutoReviewRun = {
      originalSessionID: 'original-1',
      reviewSessionID: 'review-1',
      directory: '/workspace',
      runtimeKey: 'runtime-a',
      status: 'running',
      phase: 'waiting_for_reviewer',
      iteration: 0,
      maxIterations: 15,
      expectedAssistantParentID: 'msg_user_prompt',
    };

    const key = claimAutoReviewForward(run, 'msg_assistant_review');

    expect(typeof key).toBe('string');
    expect(claimAutoReviewForward(run, 'msg_assistant_review')).toBeNull();

    releaseAutoReviewForward(key!);
    const nextKey = claimAutoReviewForward(run, 'msg_assistant_review');
    expect(nextKey).toBe(key);
    releaseAutoReviewForward(nextKey!);
  });
});

describe('review native prompt delivery', () => {
  const spies: Array<{ mockRestore(): void }> = [];
  afterEach(() => { for (const spy of spies.splice(0).reverse()) spy.mockRestore(); });
  test.each(['command', 'template', 'text', 'failure', 'stale', 'plain'] as const)('forwards generated primary text through native expansion: %s', async (mode) => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://review.test', runtimeKey: 'review-test' });
    const session: Session = { sessionId: 'review', rootSessionId: 'review', projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, metadata: { openchamber: { kind: 'review', originalSessionID: 'original' } }, metadataRevision: '1', archiveRevision: '0' };
    const snapshot: SessionSnapshot = { session, cursor: 'epoch:0', activeRun: null, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false }, turns: [], messages: [], approvals: [], questions: [], requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' } };
    spies.push(spyOn(canonicalClient, 'getSession').mockResolvedValue(snapshot));
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: [session], errors: {} }));
    spies.push(spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ projectId: 'project', workspaceId: 'workspace', name: 'repo' }));
    const text = mode === 'plain' ? 'Generated review feedback\n#literal' : '/review "two words"\n trailing  ';
    spies.push(spyOn(prompts, 'renderMagicPrompt').mockResolvedValue(text));
    spies.push(spyOn(knowledge, 'fetchSessionKnowledge').mockResolvedValue({ text: '', signature: '' }));
    const selection = useSelectionStore.getState();
    selection.saveSessionModelSelection('original', 'captured', 'model');
    selection.saveSessionAgentSelection('original', 'agent');
    selection.saveAgentModelForSession('original', 'agent', 'captured', 'model');
    selection.saveAgentModelVariantForSession('original', 'agent', 'captured', 'model', 'high');
    const send = spyOn(actions, 'sendMessage').mockResolvedValue(undefined);
    const optimistic = spyOn(actions, 'optimisticSend').mockImplementation(async (input) => {
      input.beforeOptimisticInsert?.();
      input.onMessageID?.('message');
      await input.send('message', input.context ?? []);
    });
    spies.push(send, optimistic);
    const requests: Request[] = [];
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const request = new Request(new URL(url instanceof Request ? url.url : String(url), 'http://test'), init);
      requests.push(request);
      expect(new URL(request.url).pathname).toBe('/api/agent/v1/workspaces/workspace/commands/expand-text');
      expect(await request.json()).toEqual({ text });
      if (mode === 'failure') return new Response('unavailable', { status: 503 });
      if (mode === 'stale') switchRuntimeEndpoint({ apiBaseUrl: 'http://other.test', runtimeKey: 'other-review' });
      return Response.json(mode === 'command' || mode === 'template' ? { kind: mode, content: '/expanded once', modelSelection: { providerId: 'bound', modelId: 'bound-model' }, agentId: 'bound-agent' } : { kind: 'text', content: text });
    }));
    const result = sendReviewFeedbackToOriginal('review', '/repo', 'Feedback');
    if (mode === 'failure' || mode === 'stale') {
      await expect(result).rejects.toThrow();
      expect(optimistic).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      return;
    }
    expect(await result).toBe('message');
    expect(requests).toHaveLength(mode === 'plain' ? 0 : 1);
    const matched = mode === 'command' || mode === 'template';
    expect(send.mock.calls[0][0].request).toMatchObject({ input: { text: matched ? '/expanded once' : text }, options: { providerId: matched ? 'bound' : 'captured', modelId: matched ? 'bound-model' : 'model', agentId: matched ? 'bound-agent' : 'agent', variant: 'high', reasoningEffort: null } });
  });
});
