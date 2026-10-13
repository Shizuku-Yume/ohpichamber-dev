import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNotificationTriggerRuntime } from './runtime.js';
import { createNotificationTemplateRuntime } from './template-runtime.js';
import { prepareNotificationLastMessage } from './message.js';
import { event, message, runtimeSession, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const disposers = [];
afterEach(() => { for (const stop of disposers.splice(0)) stop(); vi.useRealTimers(); vi.unstubAllEnvs(); });
const fixture = (settings = {}, overrides = {}) => {
  const web = []; const native = []; const ui = []; const desktop = [];
  const records = [message({ parts: [{ type: 'text', partId: 't', content: 'Final answer in /private/workspace; Authorization: Bearer secret' }] })];
  const sessionService = {
    open: async () => snapshot(records, [turn()]),
    history: async () => { throw new Error('not expected'); },
    list: async () => ({ items: [{ ...runtimeSession(), metadata: null, metadataRevision: '0', archiveRevision: '0' }], errors: {} }),
  };
  const readSettingsFromDisk = async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', projects: [], ...settings });
  const template = createNotificationTemplateRuntime({ sessionService, resolveSessionScope: async () => scope,
    readSessionMetadata: async () => ({ title: 'Host session' }), readSettingsFromDisk, resolveGitBinaryForSpawn: () => 'git' });
  const runtime = createNotificationTriggerRuntime({ sessionService, resolveSessionScope: async () => scope,
    readSettingsFromDisk, readSessionMetadata: async () => null, ...template, prepareNotificationLastMessage,
    emitDesktopNotification: (payload) => { desktop.push(payload); return true; }, broadcastUiNotification: (payload) => ui.push(payload),
    sendPushToAllUiSessions: (payload) => web.push(payload), sendApnsToAllUiSessions: (payload) => native.push(payload), ...overrides });
  disposers.push(runtime.stop);
  return { runtime, sessionService, web, native, ui, desktop };
};
const terminal = (sequence = 1, type = 'run.completed') => event(sequence, { type, runId: 'run', finishedAt: 2, ...(type === 'run.failed' ? { error: 'secret /private/error-path' } : {}) });
const approval = (sequence, type = 'approval.requested') => event(sequence, { type,
  approval: { approvalId: 'approval', sessionId: 'session', turnId: 'turn', toolCallId: 'call', epoch: 'epoch', workerGeneration: 'generation',
    version: type.endsWith('resolved') ? '2' : '1', toolName: 'bash', actionType: 'bash_command', commandSummary: 'Read /private/workspace/image.png', details: {},
    status: type.endsWith('resolved') ? 'approved' : 'pending', requestedAt: 1,
    ...(type.endsWith('resolved') ? { resolvedAt: 2, resolution: { decision: 'approve' } } : {}) } });

describe('canonical notification triggers', () => {
  it('announces only an outer run completion, not a cancelled run or historical records', async () => {
    const f = fixture();
    await f.runtime.processCanonicalEvent(event(1, { type: 'run.cancelled', runId: 'run', finishedAt: 2 }), scope);
    await f.runtime.processCanonicalEvent(event(2, { type: 'turn.completed', turnId: 'turn', runId: 'run' }), scope);
    expect(f.web).toEqual([]);
    await f.runtime.processCanonicalEvent(terminal(3), scope);
    expect(f.ui).toHaveLength(1); expect(f.web).toHaveLength(1); expect(f.native[0].badge).toBe(1);
    expect(f.ui[0]).toMatchObject({ sessionId: 'session', workspaceId: 'workspace', kind: 'ready' });
    expect(JSON.stringify([...f.ui, ...f.web])).not.toContain('/private/');
  });

  it('preserves template text, redacts credentials/private cwd and suppresses repeat terminal alerts', async () => {
    const f = fixture({ notificationTemplates: { completion: { title: '{session_name}', message: '{last_message} {worktree}' } } });
    await f.runtime.processCanonicalEvent(terminal(), scope); await f.runtime.processCanonicalEvent(terminal(2), scope);
    expect(f.web).toHaveLength(1); expect(f.web[0].title).toBe('Host session');
    expect(f.web[0].body).toContain('Final answer'); expect(f.web[0].body).not.toContain('secret');
    expect(f.web[0].body).not.toContain(scope.cwd); expect(f.web[0].body).toContain('[redacted]');
  });

  it('retains focused-client routing, badge reset and per-channel failure isolation', async () => {
    const f = fixture({}, { isAnyInteractiveClientVisible: () => true, sendPushToAllUiSessions: async () => { throw new Error('push failure'); } });
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.ui).toHaveLength(1); expect(f.native).toEqual([]);
    f.runtime.clearPendingPushBadge();
  });

  it('suppresses completion while a live child works or its activity is unavailable', async () => {
    const f = fixture();
    const child = { ...runtimeSession({ sessionId: 'child', parentSessionId: 'session', runtimeStatus: 'running', activeRunId: 'child-run' }), metadata: null, metadataRevision: '0', archiveRevision: '0' };
    f.sessionService.list = async () => ({ items: [child], errors: {} });
    await f.runtime.processCanonicalEvent(terminal(), scope); expect(f.web).toEqual([]);
    f.sessionService.list = async () => ({ items: [], errors: { child: 'SERVICE_UNAVAILABLE' } });
    await f.runtime.processCanonicalEvent(terminal(2), scope); expect(f.web).toEqual([]);
    f.sessionService.list = async () => ({ items: [{ ...runtimeSession(), metadata: null, metadataRevision: '0', archiveRevision: '0' }], errors: {} });
    await f.runtime.processCanonicalEvent(terminal(3), scope); expect(f.web).toHaveLength(1);
  });

  it('cancels approval debounce on authoritative resolution and suppresses auto-accepted approvals', async () => {
    vi.useFakeTimers(); const f = fixture();
    await f.runtime.processCanonicalEvent(approval(1), scope);
    await f.runtime.processCanonicalEvent(approval(2, 'approval.resolved'), scope);
    await vi.advanceTimersByTimeAsync(500); expect(f.web).toEqual([]);
    const auto = fixture({}, { getIsSessionAutoAccepting: async () => true });
    await auto.runtime.processCanonicalEvent(approval(1), scope); await vi.advanceTimersByTimeAsync(500);
    expect(auto.web).toEqual([]);
  });

  it('sends a canonical question once and clears pending timers on invalidation/stop', async () => {
    vi.useFakeTimers(); const f = fixture();
    const question = event(1, { type: 'question.requested', question: { questionId: 'question', sessionId: 'session', turnId: 'turn', prompt: 'Choose next action',
      status: 'pending', version: '1', epoch: 'epoch', workerGeneration: 'generation', requestedAt: 1 } });
    await f.runtime.processCanonicalEvent(question, scope); await f.runtime.processCanonicalEvent(question, scope);
    await vi.advanceTimersByTimeAsync(500); expect(f.web).toHaveLength(1); expect(f.web[0].body).toBe('Choose next action');
    await f.runtime.processCanonicalEvent(approval(2), scope); f.runtime.invalidateSession('session');
    await vi.advanceTimersByTimeAsync(500); expect(f.web).toHaveLength(1);
  });

  it('keeps failed-run private error details out of generic public alerts', async () => {
    const f = fixture(); await f.runtime.processCanonicalEvent(terminal(1, 'run.failed'), scope);
    expect(f.web[0].data.type).toBe('error'); expect(JSON.stringify(f.web)).not.toContain('/private/error-path');
    expect(JSON.stringify(f.web)).not.toContain('secret');
  });

  it('strips conversation names and text at enterprise push egress while retaining local notifications', async () => {
    vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', '1');
    const f = fixture({ notificationTemplates: { completion: { title: '{session_name}', message: '{last_message}' } } });
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.web[0].title).toBe('Agent response is ready'); expect(f.web[0].body).toBe('');
    expect(JSON.stringify(f.web)).not.toContain('Host session'); expect(f.native[0].body).toBe('');
    expect(f.ui[0].title).toBe('Host session');
  });
});
