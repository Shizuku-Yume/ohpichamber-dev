import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { setLinearAuth, clearLinearAuth, setLinearSessionCommentsEnabled } from './auth.js';
import { createLinearSessionStatusRuntime } from './status-runtime.js';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-linear-status-runtime-'));
const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const issueNode = { id: 'issue-uuid-1', identifier: 'ENG-12', title: 'Broken login', url: 'https://linear.app/openchamber/issue/ENG-12', state: { name: 'In Progress', type: 'started' }, assignee: null, team: { id: 'team-eng', key: 'ENG', name: 'Engineering' }, description: null, comments: { nodes: [] } };
const sessionStatus = (runtimeStatus, sequence = '1') => ({ type: 'session.status', sessionId: 'ses_1', epoch: 'epoch_1', sequence, timestamp: 3, runtimeStatus, activeRunId: runtimeStatus === 'idle' || runtimeStatus === 'unavailable' ? null : 'run_1' });
const runFailed = { type: 'run.failed', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '2', timestamp: 4, runId: 'run_1', finishedAt: 4, error: 'ProviderError' };

function stubLinearGraphql({ commentId = 'comment-1' } = {}) {
  return vi.fn(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.query.includes('query GetLinearIssue')) return jsonResponse({ data: { issue: issueNode } });
    if (body.query.includes('mutation CommentCreate')) return jsonResponse({ data: { commentCreate: { success: true, comment: { id: commentId } } } });
    throw new Error(`unexpected query: ${body.query}`);
  });
}

describe('Linear session status runtime', () => {
  let dataDir;
  let previousDataDir;
  let previousPort;

  beforeEach(() => {
    previousDataDir = process.env.OPENCHAMBER_DATA_DIR;
    previousPort = process.env.OPENCHAMBER_PORT;
    dataDir = makeTempDir();
    process.env.OPENCHAMBER_DATA_DIR = dataDir;
    process.env.OPENCHAMBER_PORT = '3001';
    setLinearAuth({ accessToken: 'access-1', refreshToken: 'refresh-1', tokenType: 'Bearer', expiresAt: Date.now() + 86_400_000, scope: 'read,write,comments:create' });
    setLinearSessionCommentsEnabled(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearLinearAuth();
    if (previousDataDir === undefined) delete process.env.OPENCHAMBER_DATA_DIR;
    else process.env.OPENCHAMBER_DATA_DIR = previousDataDir;
    if (previousPort === undefined) delete process.env.OPENCHAMBER_PORT;
    else process.env.OPENCHAMBER_PORT = previousPort;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('posts completed on the first canonical idle status, then ignores later idles', async () => {
    const { postLinearSessionStatus } = await import('./status.js');
    vi.stubGlobal('fetch', stubLinearGraphql({ commentId: 'started' }));
    await postLinearSessionStatus({ kind: 'started', sessionId: 'ses_1', issueIdentifier: 'ENG-12', sessionOrigin: 'https://app.example.com' });
    const graphql = stubLinearGraphql({ commentId: 'done' });
    vi.stubGlobal('fetch', graphql);
    const runtime = createLinearSessionStatusRuntime();
    runtime.processCanonicalEvent(sessionStatus('idle'));
    runtime.processCanonicalEvent(sessionStatus('idle', '2'));
    await vi.waitFor(() => {
      const commentCalls = graphql.mock.calls.filter(([, options]) => JSON.parse(options.body).query.includes('mutation CommentCreate'));
      expect(commentCalls).toHaveLength(1);
    });
    runtime.stop();
  });

  it('posts failure for a canonical run failure and ignores a cancelled run', async () => {
    const { postLinearSessionStatus } = await import('./status.js');
    vi.stubGlobal('fetch', stubLinearGraphql({ commentId: 'started' }));
    await postLinearSessionStatus({ kind: 'started', sessionId: 'ses_1', issueIdentifier: 'ENG-12', sessionOrigin: 'https://app.example.com' });
    const graphql = stubLinearGraphql({ commentId: 'fail' });
    vi.stubGlobal('fetch', graphql);
    const runtime = createLinearSessionStatusRuntime();
    runtime.processCanonicalEvent({ type: 'run.cancelled', sessionId: 'ses_1', epoch: 'epoch_1', sequence: '2', timestamp: 4, runId: 'run_1', finishedAt: 4 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(graphql).not.toHaveBeenCalled();
    runtime.processCanonicalEvent(runFailed);
    await vi.waitFor(() => {
      const commentCalls = graphql.mock.calls.filter(([, options]) => JSON.parse(options.body).query.includes('mutation CommentCreate'));
      expect(commentCalls).toHaveLength(1);
      expect(JSON.parse(commentCalls[0][1].body).variables.input.body).toContain('OhPiChamber session failed');
    });
    runtime.stop();
  });

  it('does not treat a canonical running status as completed', async () => {
    const graphql = stubLinearGraphql();
    vi.stubGlobal('fetch', graphql);
    const runtime = createLinearSessionStatusRuntime();
    runtime.processCanonicalEvent(sessionStatus('running'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(graphql).not.toHaveBeenCalled();
    runtime.stop();
  });
});
