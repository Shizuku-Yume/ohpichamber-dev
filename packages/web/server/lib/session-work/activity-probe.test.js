import { describe, expect, it } from 'vitest';
import { createCanonicalActivityProbe } from './activity-probe.js';

const child = (extra = {}) => ({ subagentId: 'sub-1', parentSessionId: 'ses-1', childSessionId: 'ses-child', role: 'worker', status: 'running', ...extra });
const job = (extra = {}) => ({ jobId: 'job-1', sessionId: 'ses-1', epoch: 'epoch-1', workerGeneration: 'gen-1', workspaceId: 'ws-1', projectId: 'pro-1', command: 'test', background: true, startedAt: 5, outputCursor: '0', status: 'running', ...extra });
const snapshot = (running = []) => ({ scope: { kind: 'session', sessionId: 'ses-1' }, epoch: 'epoch-1', revision: '1', running, ended: [], recovery: { priorEpochs: 'invalidated' } });

describe('Canonical session activity probe', () => {
  it('reads only running background shell jobs from the current session snapshot', async () => {
    const paths = [];
    const probe = createCanonicalActivityProbe({ service: { request: async (pathname) => {
      paths.push(pathname);
      return Response.json(snapshot([job(), job({ jobId: 'foreground', background: false })]));
    } } });
    expect(await probe.fetchRunningBackgroundJobs('ses-1')).toEqual([{ kind: 'shell', startedAt: 5 }]);
    expect(paths).toEqual(['/api/agent/v1/sessions/ses-1/shell/jobs']);
  });

  it('answers a healthy empty job snapshot as empty, never a failed or mismatched snapshot', async () => {
    for (const [body, expected] of [[snapshot(), []], [{}, null], [{ ...snapshot(), scope: { kind: 'session', sessionId: 'other' } }, null]]) {
      const probe = createCanonicalActivityProbe({ service: { request: async () => Response.json(body) } });
      expect(await probe.fetchRunningBackgroundJobs('ses-1')).toEqual(expected);
    }
  });

  it('keeps refusal, transport and malformed activity reads unknown', async () => {
    for (const request of [async () => Response.json({}, { status: 503 }), async () => { throw new Error('Disconnected'); }, async () => Response.json({})]) {
      const probe = createCanonicalActivityProbe({ service: { request } });
      expect(await probe.fetchRunningBackgroundJobs('ses-1')).toBeNull();
      expect(await probe.fetchActiveSessionStatuses('ses-1')).toBeNull();
    }
  });

  it('uses native running children and descendants, not persisted or unrelated rows', async () => {
    const probe = createCanonicalActivityProbe({ service: { request: async (pathname) => {
      expect(pathname).toBe('/api/agent/v1/sessions/ses-1/subagents');
      return Response.json({ subagents: [child()] });
    } } });
    const statuses = await probe.fetchActiveSessionStatuses('ses-1');
    expect(await probe.hasWorkingChildren('ses-1', statuses)).toBe(true);
    expect(await probe.hasWorkingChildren('ses-1', [])).toBe(false);
    for (const extra of [{ status: 'idle' }, { status: 'completed' }, { persisted: true }, { parentSessionId: 'other' }]) {
      expect(await probe.hasWorkingChildren('ses-1', [child(extra)])).toBe(false);
    }
    expect(await probe.hasWorkingChildren('ses-1', [child({ status: 'idle' }), child({ subagentId: 'sub-2', parentSessionId: 'ses-child', childSessionId: 'grandchild' })])).toBe(true);
  });
});
