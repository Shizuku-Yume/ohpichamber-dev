import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as keep from './keep';
import { withMultiRunMembership } from './identity';
import { buildMultiRunIndex } from './runs';
import { fusionModeFor, NoFusionOutputsError, shouldInlineDiffs, startRunFusion } from './fusion';
import * as laneData from './laneData';
import * as creation from './createSession';
import * as observation from './observation';
import * as prompts from '@/lib/magicPrompts';
import * as actions from '@/sync/session-actions';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { switchRuntimeEndpoint } from '@/lib/runtime-switch';

describe('fusionModeFor', () => {
  const changed = { files: 3, insertions: 10, deletions: 2 };
  const clean = { files: 0, insertions: 0, deletions: 0 };

  test('code when every source has a worktree and at least one changed files', () => {
    expect(fusionModeFor([
      { hasWorktree: true, diff: changed },
      { hasWorktree: true, diff: clean },
    ])).toBe('code');
  });

  test('answers when any source shares a directory', () => {
    expect(fusionModeFor([
      { hasWorktree: true, diff: changed },
      { hasWorktree: false, diff: null },
    ])).toBe('answers');
  });

  test('answers when no source changed anything or the changes are unknown', () => {
    expect(fusionModeFor([
      { hasWorktree: true, diff: clean },
      { hasWorktree: true, diff: null },
    ])).toBe('answers');
    expect(fusionModeFor([])).toBe('answers');
  });
});

describe('shouldInlineDiffs', () => {
  test('inlines only while the diffs fit a tenth of the context window', () => {
    // 12 tokens per changed line: 1,000 lines ≈ 12,000 tokens.
    expect(shouldInlineDiffs(1_000, 200_000)).toBe(true);
    expect(shouldInlineDiffs(2_000, 200_000)).toBe(false);
  });

  test('never inlines without a known context window', () => {
    expect(shouldInlineDiffs(1, undefined)).toBe(false);
    expect(shouldInlineDiffs(1, 0)).toBe(false);
  });
});

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
function sessionFixture(sessionId: string): Session {
  const session: Session = { sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.', createdAt: 1, updatedAt: 1,
    epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null, metadata: {}, metadataRevision: '1', archiveRevision: '0' };
  session.metadata = withMultiRunMembership(session, { version: 1, sessionID: sessionId, group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' }, groupSlug: 'run', role: 'run', providerID: 'provider', modelID: 'model' });
  return session;
}
function sourceFixture() {
  const sessions = ['a', 'b'].map(sessionFixture);
  const run = [...buildMultiRunIndex(sessions, (session) => session.projectId).runs.values()][0];
  spies.push(spyOn(keep, 'resolveRunMemberLocation').mockResolvedValue(null));
  const create = spyOn(canonicalClient, 'createSession');
  spies.push(create);
  return { sessions, create, input: { run, sourceIds: ['a', 'b'], judge: { providerId: 'judge', modelId: 'model' }, sessionById: new Map(sessions.map((session) => [session.sessionId, session])) } };
}

describe('canonical fusion source authority', () => {
  test('a listed source error aborts rather than dropping the source', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: { a: 'read_failed' } }));
    await expect(startRunFusion(api.input)).rejects.toThrow('Fusion source could not be read');
    expect(api.create.mock.calls.length).toBe(0);
  });
  test('fresh changed membership invalidates cached source selection', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions.map((session) => ({ ...session, metadata: null })), errors: {} }));
    await expect(startRunFusion(api.input)).rejects.toThrow('Fusion source membership changed');
    expect(api.create.mock.calls.length).toBe(0);
  });
  test('successfully empty native histories do not create a fusion', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: {} }));
    spies.push(spyOn(canonicalClient, 'getHistory').mockImplementation(async (sessionId) => ({ sessionId, branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, messages: [], turns: [], nextCursor: null })));
    await expect(startRunFusion(api.input)).rejects.toBeInstanceOf(NoFusionOutputsError);
    expect(api.create.mock.calls.length).toBe(0);
  });
  test('history errors abort before creating a result', async () => {
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: {} }));
    spies.push(spyOn(canonicalClient, 'getHistory').mockRejectedValue(new Error('History failed')));
    await expect(startRunFusion(api.input)).rejects.toThrow('History failed');
    expect(api.create.mock.calls.length).toBe(0);
  });
});

describe('fusion native primary delivery', () => {
  test.each(['command', 'template', 'text', 'failure', 'stale', 'plain'] as const)('expands generated primary once without touching context: %s', async (mode) => {
    switchRuntimeEndpoint({ apiBaseUrl: 'http://fusion.test', runtimeKey: 'fusion-test' });
    registerWorkspaceDirectory('workspace', '/repo');
    const api = sourceFixture();
    spies.push(spyOn(canonicalClient, 'listSessions').mockResolvedValue({ items: api.sessions, errors: {} }));
    spies.push(spyOn(laneData, 'loadLaneLastReply').mockResolvedValue('Source reply /literal'));
    spies.push(spyOn(laneData, 'loadLaneFirstPrompt').mockResolvedValue({ messageId: 'user', turnId: 'turn', text: '/original task', files: [] }));
    const text = mode === 'plain' ? 'Fuse the answers\n#literal' : '/fusion "two words"\n trailing  ';
    spies.push(spyOn(prompts, 'renderMagicPrompt').mockImplementation(async (key) => key === 'session.fusion.visible' ? text : 'Generated instructions /literal'));
    const fusion = { ...sessionFixture('fusion'), metadata: null };
    spies.push(spyOn(creation, 'createMultiRunSession').mockResolvedValue(fusion));
    spies.push(spyOn(observation, 'observeLaneSession').mockResolvedValue(undefined));
    spies.push(spyOn(canonicalClient, 'resolveWorkspace').mockResolvedValue({ projectId: 'project', workspaceId: 'workspace', name: 'repo' }));
    const send = spyOn(actions, 'sendMessage').mockResolvedValue(undefined);
    spies.push(send);
    const requests: Request[] = [];
    spies.push(spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const request = new Request(new URL(url instanceof Request ? url.url : String(url), 'http://test'), init);
      requests.push(request);
      expect(new URL(request.url).pathname).toBe('/api/agent/v1/workspaces/workspace/commands/expand-text');
      expect(await request.json()).toEqual({ text });
      if (mode === 'failure') return new Response('unavailable', { status: 503 });
      if (mode === 'stale') registerWorkspaceDirectory('workspace', '/moved');
      return Response.json(mode === 'command' || mode === 'template' ? { kind: mode, content: '/expanded once', modelSelection: { providerId: 'bound', modelId: 'bound-model' }, agentId: 'bound-agent' } : { kind: 'text', content: text });
    }));
    const result = startRunFusion({ ...api.input, judge: { ...api.input.judge, variant: 'high', agent: 'judge-agent' } });
    if (mode === 'failure' || mode === 'stale') {
      await expect(result).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
      return;
    }
    expect(await result).toMatchObject({ sessionId: 'fusion', directory: '/repo', mode: 'answers' });
    expect(requests).toHaveLength(mode === 'plain' ? 0 : 1);
    const matched = mode === 'command' || mode === 'template';
    const request = send.mock.calls[0][0].request;
    expect(request.options).toEqual({ providerId: matched ? 'bound' : 'judge', modelId: matched ? 'bound-model' : 'model', agentId: matched ? 'bound-agent' : 'judge-agent', variant: 'high', reasoningEffort: null });
    expect(request.input.text).toBe(matched ? '/expanded once' : text);
    expect(request.input.context.some(part => part.text.includes('/original task'))).toBe(true);
    expect(request.input.context.some(part => part.text.includes('Source reply /literal'))).toBe(true);
  });
});
