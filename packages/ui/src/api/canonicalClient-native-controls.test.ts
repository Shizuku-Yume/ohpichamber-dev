import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session, SessionBranchRequest, SessionBranchResult, SessionRelocateResult } from '@openchamber/agent-contract';
import * as transport from '../lib/runtime-fetch';
import { CanonicalClient } from './canonicalClient';

const client = new CanonicalClient();
let fetchSpy: ReturnType<typeof spyOn> | undefined;
afterEach(() => { fetchSpy?.mockRestore(); fetchSpy = undefined; });
const respond = (payload: SessionBranchResult | SessionRelocateResult) => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  fetchSpy = spyOn(transport, 'runtimeFetch').mockImplementation(async (path, init = {}) => {
    calls.push({ path: String(path), init });
    return Response.json(payload);
  });
  return calls;
};
const branchRequest: SessionBranchRequest = { action: 'revert', messageId: 'public-message', branchId: 'public-branch', branchVersion: '9007199254740993' };
const branchResult = () => ({ sessionId: 'public-session', branch: { branchId: 'public-branch', branchVersion: '9007199254740994', leafMessageId: null, revert: { messageId: 'public-message' } }, draft: null });
const session = (sessionId: string, parentSessionId?: string): Session => ({
  sessionId, rootSessionId: 'public-session', parentSessionId, projectId: 'public-project', workspaceId: 'destination-workspace',
  displayPath: '.', createdAt: 1, updatedAt: 2, epoch: 'new-epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
  metadata: null, metadataRevision: '0', archiveRevision: '0',
});

describe('canonical native control response bindings', () => {
  test('sends only public branch ownership and preserves large decimal versions', async () => {
    const result = branchResult();
    const calls = respond(result);
    await expect(client.selectSessionBranch('public-session', branchRequest)).resolves.toEqual(result);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe('/api/agent/v1/sessions/public-session/branch');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual(branchRequest);
  });

  test.each(['session', 'owner', 'version', 'selection'])('rejects a mismatched branch %s before its consumer receives a success', async (kind) => {
    const result = branchResult();
    if (kind === 'session') result.sessionId = 'other-session';
    if (kind === 'owner') result.branch.branchId = 'other-owner';
    if (kind === 'version') result.branch.branchVersion = branchRequest.branchVersion;
    if (kind === 'selection') result.branch.revert.messageId = 'other-message';
    respond(result);
    await expect(client.selectSessionBranch('public-session', branchRequest)).rejects.toThrow('requested branch owner and selection');
  });

  test('rejects restore acknowledgements which retain a revert selection', async () => {
    respond(branchResult());
    await expect(client.selectSessionBranch('public-session', { action: 'restore', branchId: branchRequest.branchId, branchVersion: branchRequest.branchVersion })).rejects.toThrow('requested branch owner and selection');
  });

  test('accepts stable root and child identities at the opaque destination', async () => {
    const result = { sessions: [session('public-session'), session('public-child', 'public-session')] };
    const calls = respond(result);
    await expect(client.relocateSession('public-child', 'destination-workspace')).resolves.toEqual(result);
    expect(calls[0]?.path).toBe('/api/agent/v1/sessions/public-child/relocate');
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ workspaceId: 'destination-workspace' });
  });

  test.each(['root', 'workspace', 'project', 'duplicate'])('rejects a mismatched relocation %s', async (kind) => {
    const result = { sessions: [session('public-session'), session('public-child', 'public-session')] };
    if (kind === 'root') result.sessions.shift();
    if (kind === 'workspace') result.sessions[1]!.workspaceId = 'other-workspace';
    if (kind === 'project') result.sessions[1]!.projectId = 'other-project';
    if (kind === 'duplicate') result.sessions.push(result.sessions[1]!);
    respond(result);
    await expect(client.relocateSession('public-child', 'destination-workspace')).rejects.toThrow('requested destination session family');
  });
});
