import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNotificationTriggerRuntime } from './runtime.js';
import { createNotificationTemplateRuntime } from './template-runtime.js';
<<<<<<< HEAD
import { prepareNotificationLastMessage } from './message.js';
import { event, message, runtimeSession, scope, snapshot, turn } from '../event-stream/canonical-test-fixtures.js';

const disposers = [];
afterEach(() => { for (const stop of disposers.splice(0)) stop(); vi.useRealTimers(); vi.unstubAllEnvs?.(); });
const fixture = (settings = {}, overrides = {}) => {
  const web = []; const native = []; const ui = []; const desktop = [];
  const records = [message({ parts: [{ type: 'text', partId: 't', content: 'Final answer in /private/workspace; Authorization: Bearer secret' }] })];
  const sessionService = {
    open: async () => snapshot(records, [turn()], { title: 'Host session' }),
    history: async () => { throw new Error('not expected'); },
    list: async () => ({ items: [{ ...runtimeSession(), metadata: null, metadataRevision: '0', archiveRevision: '0' }], errors: {} }),
  };
  const readSettingsFromDisk = async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', projects: [], ...settings });
  const template = createNotificationTemplateRuntime({ sessionService, resolveSessionScope: async () => scope,
    readSettingsFromDisk, resolveGitBinaryForSpawn: () => 'git' });
  const runtime = createNotificationTriggerRuntime({ sessionService, resolveSessionScope: async () => scope,
    readSettingsFromDisk, ...template, prepareNotificationLastMessage,
    emitDesktopNotification: (payload) => { desktop.push(payload); return true; }, broadcastUiNotification: (payload) => ui.push(payload),
    sendPushToAllUiSessions: (payload) => web.push(payload), sendApnsToAllUiSessions: (payload) => native.push(payload), ...overrides });
  disposers.push(runtime.stop);
  return { runtime, sessionService, web, native, ui, desktop };
=======
import { translateWireEvent } from '../event-stream/translate-v2.js';

/**
 * The "ready" push is built from the translated `message.updated` events.
 * v2 splits a turn: the step start names agent and model, the step end
 * carries the finish. What is pinned here: the finish is announced with the
 * agent and model from the start, a user abort announces nothing, and an
 * active goal (which lives in OpenChamber's own metadata) silences the push.
 */
const makeRuntime = ({ metadata = {}, settings = {}, isInAutoReview } = {}) => {
  const emitDesktopNotification = vi.fn(() => true);
  const runtime = createNotificationTriggerRuntime({
    readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnCompletion: true, ...settings }),
    prepareNotificationLastMessage: async ({ message }) => message,
    buildTemplateVariables: async () => ({}),
    extractLastMessageText: () => 'done',
    fetchLastAssistantMessageText: async () => 'done',
    resolveNotificationTemplate: () => '',
    shouldApplyResolvedTemplateMessage: () => false,
    emitDesktopNotification,
    broadcastUiNotification: vi.fn(),
    sendPushToAllUiSessions: vi.fn(async () => undefined),
    sendApnsToAllUiSessions: vi.fn(async () => undefined),
    isAnyInteractiveClientVisible: () => true,
    buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    readSessionMetadata: async () => metadata,
    isInAutoReview,
  });
  return { runtime, emitDesktopNotification };
>>>>>>> bc50ba56a
};
const terminal = (sequence = 1, type = 'run.completed') => event(sequence, { type, runId: 'run', finishedAt: 2, ...(type === 'run.failed' ? { error: 'Authorization: Bearer secret /private/workspace/error-path' } : {}) });
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
  it('suppresses active-goal turn alerts and sends one OMP completion alert', async () => {
    const f = fixture();
    const snapshotWithMode = (currentMode) => snapshot([], [], { mode: currentMode });
    let mode = { kind: 'goal', status: 'active', objective: 'Ship it', tokenBudget: null, tokensUsed: 0 };
    f.sessionService.open = async () => snapshotWithMode(mode);
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.web).toEqual([]);
    mode = { ...mode, status: 'complete' };
    await f.runtime.processCanonicalEvent({ type: 'session.updated', sessionId: 'session', epoch: 'epoch', sequence: '2', timestamp: 2, mode }, scope);
    await f.runtime.processCanonicalEvent(terminal(3), scope);
    expect(f.web).toHaveLength(1);
    expect(f.web[0].data.type).toBe('goal_complete');
    await f.runtime.processCanonicalEvent(terminal(4), scope);
    expect(f.web).toHaveLength(2);
    expect(f.web[1].data.type).toBe('ready');
    expect(f.ui).toHaveLength(2);
    expect(f.native).toHaveLength(2);
    expect(f.desktop).toHaveLength(2);
  });
  it('announces a budget-limited goal once without an ordinary ready alert', async () => {
    const f = fixture();
    let mode = { kind: 'goal', status: 'active', objective: 'Ship it', tokenBudget: 12000, tokensUsed: 12000 };
    f.sessionService.open = async () => snapshot([], [], { mode });
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.web).toEqual([]);
    mode = { ...mode, status: 'budget-limited' };
    await f.runtime.processCanonicalEvent(terminal(2), scope);
    expect(f.web).toHaveLength(1);
    expect(f.web[0].data.type).toBe('goal_budget');
    await f.runtime.processCanonicalEvent(terminal(3), scope);
    expect(f.web).toHaveLength(2);
    expect(f.web[1].data.type).toBe('ready');
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

<<<<<<< HEAD
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
    expect(f.web[0].data.type).toBe('error');
    expect(JSON.stringify(f.web)).not.toContain('/private/workspace/error-path');
    expect(f.web[0].body).toContain('[redacted]/error-path');
    expect(f.native[0].sealed.body).toContain('Error: ');
    expect(f.native[0].sealed.body).toContain('[redacted]/error-path');
    expect(JSON.stringify(f.web)).not.toContain('secret');
  });

  it('writes localized default text and seals the detail for a phone', async () => {
    const f = fixture({ locale: 'de' });
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.web[0].title).toBe('Agent ist bereit');
    expect(f.web[0].body).toBe('Assistant hat die Aufgabe abgeschlossen');
    expect(f.native[0].sealed).toEqual({ title: 'Host session', body: 'Final answer in [redacted]; Authorization=[redacted] [redacted]' });
    expect(f.native[0].body).toBe('Host session');
  });

  it('completes an empty custom template field with the language default', async () => {
    const f = fixture({ locale: 'de', notificationTemplates: { completion: { title: '', message: '' } } });
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.web[0].title).toBe('Agent ist bereit');
    expect(f.web[0].body).toBe('Assistant hat die Aufgabe abgeschlossen');
  });

  it('prefixes what a permission wants to do, redacted, in the sealed phone text', async () => {
    vi.useFakeTimers(); const f = fixture();
    await f.runtime.processCanonicalEvent(approval(1), scope);
    await vi.advanceTimersByTimeAsync(500);
    expect(f.native[0].sealed.body).toBe('Wants to run: Read [redacted]/image.png');
    expect(f.native[0].sealed.body).not.toContain('/private/workspace');
  });

  it('strips conversation names and text at enterprise push egress while retaining local notifications', async () => {
    vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', '1');
    const f = fixture({ notificationTemplates: { completion: { title: '{session_name}', message: '{last_message}' } } });
    await f.runtime.processCanonicalEvent(terminal(), scope);
    expect(f.web[0].title).toBe('Agent response is ready'); expect(f.web[0].body).toBe('');
    expect(JSON.stringify(f.web)).not.toContain('Host session'); expect(f.native[0].body).toBe('');
    expect(f.native[0].sealed).toBeUndefined();
    expect(f.ui[0].title).toBe('Host session');
=======
    expect(emitDesktopNotification).not.toHaveBeenCalled();
  });

  it('stays quiet for a step of an auto-review and announces the review once when it ends', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, emitDesktopNotification } = makeRuntime({
      settings: { locale: 'uk' },
      isInAutoReview: (sessionId) => sessionId === 'ses_reviewed',
    });

    await runtime.maybeSendPushForTrigger(stepStarted('ses_reviewed', 'msg_4'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_reviewed'));
    expect(emitDesktopNotification).not.toHaveBeenCalled();

    await runtime.notifyAutoReviewEnded({ sessionId: 'ses_reviewed', directory: '/repo', status: 'disputed' });
    await runtime.notifyAutoReviewEnded({ sessionId: 'ses_reviewed', directory: '/repo', status: 'failed', error: 'The reviewer session is gone.' });
    expect(emitDesktopNotification.mock.calls.map(([payload]) => payload)).toMatchObject([
      { kind: 'review', sessionId: 'ses_reviewed', title: 'Ревʼю чекає твого рішення', body: 'Щодо деяких зауважень досі суперечка' },
      { kind: 'review', title: 'Ревʼю не вдалося', body: 'The reviewer session is gone.' },
    ]);
  });

  it('announces no review end where a ready notification would not show', async () => {
    for (const settings of [{ notifyOnCompletion: false }, { nativeNotificationsEnabled: false }]) {
      const { runtime, emitDesktopNotification } = makeRuntime({ settings });
      await runtime.notifyAutoReviewEnded({ sessionId: 'ses_reviewed', directory: '/repo', status: 'clean' });
      expect(emitDesktopNotification).not.toHaveBeenCalled();
    }
    const focused = makeRuntime({ settings: { notificationMode: 'hidden-only' } });
    focused.runtime.setGetIsWindowFocused(() => true);
    await focused.runtime.notifyAutoReviewEnded({ sessionId: 'ses_reviewed', directory: '/repo', status: 'clean' });
    expect(focused.emitDesktopNotification).not.toHaveBeenCalled();
  });
});

describe('error notification on v2 step failures', () => {
  const stepFailed = (sessionID, id, error) => translateWireEvent({
    type: 'session.step.failed',
    id: `evt_${id}`,
    created: 3,
    data: { sessionID, assistantMessageID: id, error },
  })[0];

  it('announces a failed turn, but not one the user interrupted', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, emitDesktopNotification } = makeRuntime();

    await runtime.maybeSendPushForTrigger(stepFailed('ses_4', 'msg_4', { type: 'aborted', message: 'Step interrupted' }));
    expect(emitDesktopNotification).not.toHaveBeenCalled();

    await runtime.maybeSendPushForTrigger(stepFailed('ses_5', 'msg_5', {
      type: 'provider.transport',
      message: 'Timed out waiting for response data',
    }));
    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(emitDesktopNotification.mock.calls[0][0]).toMatchObject({ kind: 'error' });
  });

  it('announces exhausted auto-resume attempts and provider execution failures', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, emitDesktopNotification } = makeRuntime();
    const execution = (sessionID, error) => translateWireEvent({
      type: 'session.execution.failed',
      id: `evt_${sessionID}`,
      created: 4,
      data: { sessionID, error },
    });

    for (const event of execution('ses_6', {
      type: 'aborted',
      message: 'Execution was interrupted repeatedly and will not be resumed automatically.',
    })) {
      await runtime.maybeSendPushForTrigger(event);
    }
    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(emitDesktopNotification.mock.calls[0][0]).toMatchObject({ kind: 'error', sessionId: 'ses_6' });

    for (const event of execution('ses_7', { type: 'provider.transport', message: 'Connection reset' })) {
      await runtime.maybeSendPushForTrigger(event);
    }
    expect(emitDesktopNotification).toHaveBeenCalledTimes(2);
    expect(emitDesktopNotification.mock.calls[1][0]).toMatchObject({ kind: 'error', sessionId: 'ses_7' });
  });
});

describe('ready notification while background subagents run', () => {
  // Without `jobs` it is an OpenCode before 2.2.6, which has no job list.
  const stubOpenCode = ({ active, children, jobs }) => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/experimental/job') {
        return jobs ? Response.json({ data: jobs() }) : new Response(null, { status: 404 });
      }
      if (url.pathname === '/api/session/active') return Response.json({ data: active() });
      if (url.pathname === '/api/session') return Response.json({ data: children, cursor: {} });
      return Response.json({});
    }));
  };

  it('stays silent while the job list shows a subagent, and ignores a running command', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const job = (kind, sessionID) => ({ kind, sessionID, status: 'running', time: { started: 1 } });
    let jobs = [job('subagent', 'ses_1'), job('shell', 'ses_child')];
    stubOpenCode({ active: () => ({}), children: [], jobs: () => jobs });
    const { runtime, emitDesktopNotification } = makeRuntime();

    await runtime.maybeSendPushForTrigger(stepStarted('ses_1', 'msg_1'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_1'));
    expect(emitDesktopNotification).not.toHaveBeenCalled();

    // A dev server the subagent left running must not hold "ready" forever.
    jobs = [job('shell', 'ses_child')];
    await runtime.maybeSendPushForTrigger(turnEnded('ses_1'));
    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('stays silent while a child session that is no OpenCode job runs', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubOpenCode({ active: () => ({ ses_workflow: { type: 'running' } }), children: [{ id: 'ses_workflow', parentID: 'ses_1' }], jobs: () => [] });
    const { runtime, emitDesktopNotification } = makeRuntime();

    await runtime.maybeSendPushForTrigger(stepStarted('ses_1', 'msg_1'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_1'));
    expect(emitDesktopNotification).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('stays silent on the pause and announces the real turn end', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let active = { ses_child: { type: 'running' } };
    stubOpenCode({ active: () => active, children: [{ id: 'ses_child', parentID: 'ses_1' }] });
    const { runtime, emitDesktopNotification } = makeRuntime();

    await runtime.maybeSendPushForTrigger(stepStarted('ses_1', 'msg_1'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_1'));
    expect(emitDesktopNotification).not.toHaveBeenCalled();

    // The subagent finished and OpenCode ran the parent again with its result.
    active = {};
    await runtime.maybeSendPushForTrigger(turnEnded('ses_1'));
    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('announces the idle when the subagent check cannot be made', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const { runtime, emitDesktopNotification } = makeRuntime();

    await runtime.maybeSendPushForTrigger(stepStarted('ses_1', 'msg_1'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_1'));
    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('push content in enterprise mode', () => {
  const makePushRuntime = () => {
    const sendPushToAllUiSessions = vi.fn(async () => undefined);
    const sendApnsToAllUiSessions = vi.fn(async () => undefined);
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnCompletion: true }),
      prepareNotificationLastMessage: async ({ message }) => message,
      buildTemplateVariables: async () => ({ session_name: 'Fix the billing export' }),
      extractLastMessageText: () => 'The customer table is migrated',
      fetchLastAssistantMessageText: async () => 'The customer table is migrated',
      resolveNotificationTemplate: (template, variables) => template.replace('{last_message}', variables.last_message ?? ''),
      shouldApplyResolvedTemplateMessage: () => true,
      emitDesktopNotification: vi.fn(() => true),
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions,
      sendApnsToAllUiSessions,
      isAnyInteractiveClientVisible: () => false,
      buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      readSessionMetadata: async () => ({}),
    });
    return { runtime, sendPushToAllUiSessions, sendApnsToAllUiSessions };
  };

  it('sends only the scenario title and the deep link, on both channels', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: {} })));
    process.env.OPENCHAMBER_ENTERPRISE_MODE = 'true';
    try {
      const { runtime, sendPushToAllUiSessions, sendApnsToAllUiSessions } = makePushRuntime();
      await runtime.maybeSendPushForTrigger(stepStarted('ses_e', 'msg_e'));
      await runtime.maybeSendPushForTrigger(turnEnded('ses_e'));

      const web = sendPushToAllUiSessions.mock.calls[0][0];
      expect(web).toMatchObject({ title: 'Agent response is ready', body: '', data: { sessionId: 'ses_e', type: 'ready' } });
      expect(web.data.sessionName).toBeUndefined();
      expect(sendApnsToAllUiSessions.mock.calls[0][0]).toMatchObject({ title: 'Agent response is ready', body: '' });
      expect(sendApnsToAllUiSessions.mock.calls[0][0].sealed).toBeUndefined();
      expect(JSON.stringify([web, sendApnsToAllUiSessions.mock.calls[0][0]])).not.toMatch(/billing|customer/);
    } finally {
      delete process.env.OPENCHAMBER_ENTERPRISE_MODE;
      vi.unstubAllGlobals();
    }
  });

  it('gives a phone with a push key the session name and the reply', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: {} })));
    try {
      const { runtime, sendPushToAllUiSessions, sendApnsToAllUiSessions } = makePushRuntime();
      await runtime.maybeSendPushForTrigger(stepStarted('ses_p', 'msg_p'));
      await runtime.maybeSendPushForTrigger(turnEnded('ses_p'));

      const apns = sendApnsToAllUiSessions.mock.calls[0][0];
      // The clear text stays generic; the reply rides only in `sealed`.
      expect(apns).toMatchObject({ title: 'Agent response is ready', body: 'Fix the billing export' });
      expect(apns.sealed).toEqual({ title: 'Fix the billing export', body: 'The customer table is migrated' });
      expect(sendPushToAllUiSessions.mock.calls[0][0].phoneBody).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('phone text for permissions and questions', () => {
  const makeAskRuntime = () => {
    const sendApnsToAllUiSessions = vi.fn(async () => undefined);
    const emitDesktopNotification = vi.fn(() => true);
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnQuestion: true }),
      buildTemplateVariables: async () => ({ session_name: 'Fix login redirect loop' }),
      resolveNotificationTemplate: (template, variables) => template.replace('{last_message}', variables.last_message ?? ''),
      shouldApplyResolvedTemplateMessage: () => true,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions: vi.fn(async () => undefined),
      sendApnsToAllUiSessions,
      isAnyInteractiveClientVisible: () => false,
      getIsSessionAutoAccepting: async () => false,
    });
    return { runtime, sendApnsToAllUiSessions, emitDesktopNotification };
  };

  const permissionAsked = (id, action, resources) => ({
    type: 'permission.asked',
    properties: { sessionID: 'ses_1', id, action, resources },
  });

  it('names the command or file the agent wants, on the phone and on desktop', async () => {
    vi.useFakeTimers();
    const { runtime, sendApnsToAllUiSessions, emitDesktopNotification } = makeAskRuntime();

    await runtime.maybeSendPushForTrigger(permissionAsked('per_1', 'bash', ['git push origin bohdan/dev']));
    await vi.advanceTimersByTimeAsync(600);
    await runtime.maybeSendPushForTrigger(permissionAsked('per_2', 'edit', ['~/.ssh/config']));
    await vi.advanceTimersByTimeAsync(600);
    await runtime.maybeSendPushForTrigger(permissionAsked('per_3', 'webfetch', ['https://example.com']));
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(sendApnsToAllUiSessions.mock.calls.map(([payload]) => payload.sealed)).toEqual([
      { title: 'Fix login redirect loop', body: 'Wants to run: git push origin bohdan/dev' },
      { title: 'Fix login redirect loop', body: 'Wants to edit: ~/.ssh/config' },
      { title: 'Fix login redirect loop', body: 'Wants permission: webfetch: https://example.com' },
    ]);
    expect(emitDesktopNotification.mock.calls[0][0].body).toBe('bash: git push origin bohdan/dev');
  });

  it('puts the question on the phone', async () => {
    vi.useFakeTimers();
    const { runtime, sendApnsToAllUiSessions } = makeAskRuntime();

    await runtime.maybeSendPushForTrigger({
      type: 'form.created',
      properties: {
        sessionID: 'ses_1',
        form: { id: 'frm_1', sessionID: 'ses_1', title: 'Logout', fields: [{ key: 'q', type: 'string', title: 'Should logout also forget the remembered device?' }] },
      },
    });
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(sendApnsToAllUiSessions.mock.calls[0][0].sealed).toEqual({
      title: 'Fix login redirect loop',
      body: 'Question: Should logout also forget the remembered device?',
    });
  });
});

describe('subagent finish with subagent notifications off', () => {
  const makeSubtaskRuntime = () => {
    const emitDesktopNotification = vi.fn(() => true);
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnCompletion: true, notifyOnSubtasks: false }),
      prepareNotificationLastMessage: async ({ message }) => message,
      buildTemplateVariables: async () => ({}),
      extractLastMessageText: () => 'done',
      fetchLastAssistantMessageText: async () => 'done',
      resolveNotificationTemplate: () => '',
      shouldApplyResolvedTemplateMessage: () => false,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions: vi.fn(async () => undefined),
      sendApnsToAllUiSessions: vi.fn(async () => undefined),
      isAnyInteractiveClientVisible: () => true,
      buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      readSessionMetadata: async () => ({}),
    });
    return { runtime, emitDesktopNotification };
  };

  // OpenCode answers `GET /api/session/:id` as `{ data }` with no `location`.
  const stubSessionRecord = () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/session/active') return Response.json({ data: {} });
      if (url.pathname === '/api/session/ses_child') return Response.json({ data: { id: 'ses_child', parentID: 'ses_parent' } });
      return Response.json({ data: [], cursor: {} });
    }));
  };

  it('reads the parent from the session record envelope', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubSessionRecord();
    const { runtime, emitDesktopNotification } = makeSubtaskRuntime();

    await runtime.maybeSendPushForTrigger(stepStarted('ses_child', 'msg_c'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_child'));
    expect(emitDesktopNotification).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('a partial session update does not erase a known parent', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => new Response('down', { status: 503 })));
    const { runtime, emitDesktopNotification } = makeSubtaskRuntime();

    await runtime.maybeSendPushForTrigger({ type: 'session.created', properties: { sessionID: 'ses_child', info: { id: 'ses_child', parentID: 'ses_parent' } } });
    // Usage updates arrive as `session.updated` with a partial record.
    await runtime.maybeSendPushForTrigger({ type: 'session.updated', properties: { sessionID: 'ses_child', info: { id: 'ses_child', cost: 1 } } });
    await runtime.maybeSendPushForTrigger(stepStarted('ses_child', 'msg_c'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_child'));
    expect(emitDesktopNotification).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('input-needed notification for a page that waits for an answer', () => {
  it('notifies like a form, with the page title as the ask, and opens its session', async () => {
    vi.useFakeTimers();
    const emitDesktopNotification = vi.fn(() => true);
    const sendApnsToAllUiSessions = vi.fn(async () => undefined);
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnQuestion: true }),
      buildTemplateVariables: async () => ({ session_name: 'Sidebar cleanup' }),
      resolveNotificationTemplate: (template, variables) => template.replace('{last_message}', variables.last_message ?? ''),
      shouldApplyResolvedTemplateMessage: () => true,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions: vi.fn(async () => undefined),
      sendApnsToAllUiSessions,
      isAnyInteractiveClientVisible: () => false,
    });

    await runtime.maybeSendPushForTrigger({
      type: 'openchamber:page-waiting',
      properties: { sessionID: 'ses_1', directory: '/repo', page: { id: 'call_1', title: 'Pick a session row layout' } },
    });
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(emitDesktopNotification.mock.calls[0][0]).toMatchObject({
      kind: 'question', title: 'Input needed', body: 'Pick a session row layout', sessionId: 'ses_1', directory: '/repo', tag: 'question-ses_1',
    });
    expect(sendApnsToAllUiSessions.mock.calls[0][0].sealed).toEqual({ title: 'Sidebar cleanup', body: 'Question: Pick a session row layout' });
  });

  it('stays quiet when question notifications are off', async () => {
    vi.useFakeTimers();
    const emitDesktopNotification = vi.fn(() => true);
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnQuestion: false }),
      buildTemplateVariables: async () => ({}),
      resolveNotificationTemplate: () => '',
      shouldApplyResolvedTemplateMessage: () => false,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions: vi.fn(async () => undefined),
      sendApnsToAllUiSessions: vi.fn(async () => undefined),
      isAnyInteractiveClientVisible: () => false,
    });

    await runtime.maybeSendPushForTrigger({ type: 'openchamber:page-waiting', properties: { sessionID: 'ses_1', page: { id: 'call_1', title: 'Pick' } } });
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(emitDesktopNotification).not.toHaveBeenCalled();
  });
});

describe('input-needed notification for an MCP elicitation', () => {
  it('opens the app, since the form belongs to no session', async () => {
    vi.useFakeTimers();
    const emitDesktopNotification = vi.fn(() => true);
    const sendPushToAllUiSessions = vi.fn(async () => undefined);
    const buildTemplateVariables = vi.fn(async () => ({}));
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnQuestion: true }),
      buildTemplateVariables,
      resolveNotificationTemplate: () => '',
      shouldApplyResolvedTemplateMessage: () => false,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions,
      sendApnsToAllUiSessions: vi.fn(async () => undefined),
      isAnyInteractiveClientVisible: () => false,
    });

    await runtime.maybeSendPushForTrigger({
      type: 'form.created',
      properties: {
        sessionID: 'global',
        form: {
          id: 'frm_1',
          sessionID: 'global',
          title: 'azure-devops is requesting input',
          fields: [{ key: 'project', type: 'string', title: 'Project', description: 'The Azure DevOps project.' }],
        },
      },
    });
    await vi.advanceTimersByTimeAsync(600);
    vi.useRealTimers();

    expect(buildTemplateVariables.mock.calls[0][1]).toBeUndefined();
    expect(emitDesktopNotification.mock.calls[0][0]).toMatchObject({ kind: 'question', title: 'azure-devops is requesting input' });
    expect(emitDesktopNotification.mock.calls[0][0].sessionId).toBeUndefined();
    const push = sendPushToAllUiSessions.mock.calls[0][0];
    expect(push.data.url).toBe('/');
    expect(push.data.sessionId).toBeUndefined();
  });
});

describe('notification project through the trigger runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the project of the session record, not the active project', async () => {
    const settings = {
      nativeNotificationsEnabled: true,
      notificationMode: 'always',
      notifyOnCompletion: true,
      locale: 'en',
      activeProjectId: 'project-a',
      projects: [
        { id: 'project-a', label: 'Project A', path: '/work/project-a' },
        { id: 'project-b', label: 'Project B', path: '/work/project-b' },
      ],
      notificationTemplates: {
        completion: { title: '{project_name} · {session_name}', message: '{last_message}' },
      },
    };
    const readSettingsFromDisk = async () => settings;
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/session/active') return Response.json({ data: {} });
      if (url.pathname === '/api/session') return Response.json({ data: [], cursor: {} });
      if (url.pathname === '/api/session/ses_b') {
        return Response.json({ data: { id: 'ses_b', title: 'Session B', parentID: null, location: { directory: '/work/project-b' } } });
      }
      return new Response(null, { status: 404 });
    }));

    const templates = createNotificationTemplateRuntime({
      readSettingsFromDisk,
      buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
      getOpenCodeAuthHeaders: () => ({}),
      resolveGitBinaryForSpawn: () => 'git',
    });
    const emitDesktopNotification = vi.fn(() => true);
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk,
      readSessionMetadata: async () => ({}),
      prepareNotificationLastMessage: async ({ message }) => message,
      buildTemplateVariables: templates.buildTemplateVariables,
      extractLastMessageText: () => 'done',
      fetchLastAssistantMessageText: async () => 'done',
      resolveNotificationTemplate: templates.resolveNotificationTemplate,
      shouldApplyResolvedTemplateMessage: templates.shouldApplyResolvedTemplateMessage,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions: vi.fn(async () => undefined),
      sendApnsToAllUiSessions: vi.fn(async () => undefined),
      isAnyInteractiveClientVisible: () => true,
      buildOpenCodeUrl: (fetchPath) => `http://opencode.test${fetchPath}`,
      getOpenCodeAuthHeaders: () => ({}),
    });

    await runtime.maybeSendPushForTrigger(stepStarted('ses_b', 'msg_b'));
    await runtime.maybeSendPushForTrigger(turnEnded('ses_b'));

    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(emitDesktopNotification.mock.calls[0][0]).toMatchObject({
      kind: 'ready',
      title: 'Project B · Session B',
    });
  });
});

describe('notifications for a chat of an isolated space', () => {
  // The chat lives in the OpenCode inside the space; the host's OpenCode answers 404 for it.
  const SPACE = '32aa0c80b805';
  const SESSION = 'ses_space_1';
  const insideAnswers = ({ parentID = null, metadata = {} } = {}) => vi.fn(async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/session/active') return Response.json({ data: {} });
    if (url.pathname === '/api/session') return Response.json({ data: [], cursor: {} });
    if (url.pathname === `/api/session/${SESSION}`) return Response.json({ data: { id: SESSION, title: '2+2 answer', parentID, metadata } });
    if (url.pathname === `/api/session/${SESSION}/message`) {
      return Response.json({ data: [{ id: 'msg_1', type: 'assistant', finish: 'stop', content: [{ type: 'text', text: '2+2 is 4.' }] }], cursor: {} });
    }
    return new Response(null, { status: 404 });
  });

  const makeSpaceRuntime = ({ settings = {}, inside = insideAnswers(), isAutoAnswered = vi.fn(async () => false) } = {}) => {
    const hostFetch = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', hostFetch);
    const readSettingsFromDisk = async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', notifyOnCompletion: true, notifyOnQuestion: true, ...settings });
    const templates = createNotificationTemplateRuntime({
      readSettingsFromDisk,
      buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      resolveGitBinaryForSpawn: () => 'git',
    });
    const emitDesktopNotification = vi.fn(() => true);
    const sendApnsToAllUiSessions = vi.fn(async () => undefined);
    // The host's own metadata store reads the host's OpenCode.
    const readSessionMetadata = vi.fn(async () => ({}));
    const runtime = createNotificationTriggerRuntime({
      readSettingsFromDisk,
      readSessionMetadata,
      prepareNotificationLastMessage: async ({ message }) => message,
      buildTemplateVariables: templates.buildTemplateVariables,
      extractLastMessageText: templates.extractLastMessageText,
      fetchLastAssistantMessageText: templates.fetchLastAssistantMessageText,
      resolveNotificationTemplate: templates.resolveNotificationTemplate,
      shouldApplyResolvedTemplateMessage: templates.shouldApplyResolvedTemplateMessage,
      emitDesktopNotification,
      broadcastUiNotification: vi.fn(),
      sendPushToAllUiSessions: vi.fn(async () => undefined),
      sendApnsToAllUiSessions,
      isAnyInteractiveClientVisible: () => false,
      buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
      getOpenCodeAuthHeaders: () => ({}),
      spaceFetchFor: (spaceId) => (spaceId === SPACE ? inside : null),
    });
    runtime.setGetIsSessionAutoAccepting(isAutoAnswered);
    return { runtime, hostFetch, inside, emitDesktopNotification, sendApnsToAllUiSessions, isAutoAnswered, readSessionMetadata };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('gives the phone the chat name and the reply, read inside the space', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, hostFetch, inside, emitDesktopNotification, sendApnsToAllUiSessions, readSessionMetadata } = makeSpaceRuntime();

    await runtime.maybeSendPushForTrigger(stepStarted(SESSION, 'msg_1'), { spaceId: SPACE });
    await runtime.maybeSendPushForTrigger(turnEnded(SESSION), { spaceId: SPACE });

    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(readSessionMetadata).not.toHaveBeenCalled();
    expect(sendApnsToAllUiSessions.mock.calls[0][0]).toMatchObject({
      body: '2+2 answer',
      sealed: { title: '2+2 answer', body: '2+2 is 4.' },
    });
    expect(inside).toHaveBeenCalled();
    expect(hostFetch).not.toHaveBeenCalled();
  });

  it('announces a main chat of a space with subagent notifications off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, hostFetch, emitDesktopNotification } = makeSpaceRuntime({ settings: { notifyOnSubtasks: false } });

    await runtime.maybeSendPushForTrigger(stepStarted(SESSION, 'msg_1'), { spaceId: SPACE });
    await runtime.maybeSendPushForTrigger(turnEnded(SESSION), { spaceId: SPACE });

    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(hostFetch).not.toHaveBeenCalled();
  });

  it('stays quiet while a goal in the space\'s own record is active', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, emitDesktopNotification } = makeSpaceRuntime({
      inside: insideAnswers({ metadata: { openchamber: { goal: { id: 'g', status: 'active', objective: 'x' } } } }),
    });

    await runtime.maybeSendPushForTrigger(stepStarted(SESSION, 'msg_1'), { spaceId: SPACE });
    await runtime.maybeSendPushForTrigger(turnEnded(SESSION), { spaceId: SPACE });

    expect(emitDesktopNotification).not.toHaveBeenCalled();
  });

  it('still stays quiet for a subagent of a space with subagent notifications off', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, emitDesktopNotification } = makeSpaceRuntime({ settings: { notifyOnSubtasks: false }, inside: insideAnswers({ parentID: 'ses_parent' }) });

    await runtime.maybeSendPushForTrigger(stepStarted(SESSION, 'msg_1'), { spaceId: SPACE });
    await runtime.maybeSendPushForTrigger(turnEnded(SESSION), { spaceId: SPACE });

    expect(emitDesktopNotification).not.toHaveBeenCalled();
  });

  it('asks neither the host\'s OpenCode nor its permission policy about a space\'s request', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, hostFetch, isAutoAnswered, emitDesktopNotification, sendApnsToAllUiSessions } = makeSpaceRuntime();

    await runtime.maybeSendPushForTrigger({
      type: 'permission.asked',
      properties: { id: 'per_1', sessionID: SESSION, directory: `/spaces/${SPACE}/project`, action: 'read', resources: ['/etc/hostname'] },
    }, { spaceId: SPACE });
    await vi.advanceTimersByTimeAsync(600);

    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(sendApnsToAllUiSessions.mock.calls[0][0]).toMatchObject({ body: '2+2 answer' });
    expect(isAutoAnswered).not.toHaveBeenCalled();
    expect(hostFetch).not.toHaveBeenCalled();
  });

  it('falls back to the generic text, without the host\'s OpenCode, when the space cannot be asked', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { runtime, hostFetch, emitDesktopNotification, sendApnsToAllUiSessions } = makeSpaceRuntime({
      inside: vi.fn(async () => { throw new Error('space_not_running'); }),
    });

    await runtime.maybeSendPushForTrigger(stepStarted(SESSION, 'msg_1'), { spaceId: SPACE });
    await runtime.maybeSendPushForTrigger(turnEnded(SESSION), { spaceId: SPACE });

    expect(emitDesktopNotification).toHaveBeenCalledTimes(1);
    expect(sendApnsToAllUiSessions.mock.calls[0][0]).toMatchObject({ body: 'Session', sealed: undefined });
    expect(hostFetch).not.toHaveBeenCalled();
>>>>>>> bc50ba56a
  });
});
