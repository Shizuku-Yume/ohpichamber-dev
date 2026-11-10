import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOutboundHandles } from '../source-control/outbound-handles.js';
import { createExtensionNotificationChannels } from './extension-channels.js';
import { createNotificationTriggerRuntime } from './runtime.js';

const validSnapshot = (id) => ({
  session: {
    sessionId: id, workspaceId: "ws_test", projectId: "p_1", displayPath: "repo", rootSessionId: id,
    title: "Private session", createdAt: 1000, updatedAt: 1000, runtimeStatus: "idle", activeRunId: null,
    epoch: "1", headSequence: "1", mode: { kind: "main" },
  },
  cursor: "1:1", activeRun: null, branch: { branchId: "b_1", branchVersion: "1", leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [],
  requestRecovery: { pendingSet: "replace", priorEpochs: "expired" },
});

const genericTitles = {
  ready: 'Agent response is ready',
  error: 'Agent hit an error',
  question: 'Agent needs your input',
  permission: 'Agent needs permission',
  review: 'Review finished',
  goal_complete: 'Goal complete',
  goal_blocked: 'Goal blocked',
  goal_budget: 'Goal reached its token budget',
};

const harness = async ({ settings = {}, visible = false } = {}) => {
  const delivered = [];
  const channels = createExtensionNotificationChannels({
    listGuests: async () => [{
      id: 'receiver', name: 'Receiver', packageRoot: '/receiver', capabilityGrants: ['service'],
      service: { runtime: 'host', entry: 'main.js', provides: ['notifications'] },
      notifications: { label: 'Receiver', instances: { kind: 'fixed', origin: 'https://receiver.example' }, token: { header: 'authorization', scheme: 'bearer' } },
    }],
    proxyServiceRequest: async ({ body }) => {
      delivered.push(JSON.parse(body).input.notification);
      return { status: 200, body: '{"ok":true,"data":{"delivered":true}}' };
    },
    persistPath: '/extensions.json',
    accounts: { read: async () => ({ instance: 'https://receiver.example', account: { id: '1', login: null, token: 'test-token', status: 'valid' } }) },
    handles: createOutboundHandles(),
    isAnyUiVisible: () => visible,
  });
  await channels.reconcile();
  const runtime = createNotificationTriggerRuntime({
    readSettingsFromDisk: async () => ({ nativeNotificationsEnabled: true, notificationMode: 'always', ...settings }),
    prepareNotificationLastMessage: async ({ message }) => message,
    buildTemplateVariables: async () => ({ session_name: 'Private session', last_message: 'Private reply' }),
    extractLastMessageText: () => 'Private reply',
    fetchLastAssistantMessageText: async () => 'Private reply',
    resolveNotificationTemplate: () => 'Private template',
    shouldApplyResolvedTemplateMessage: () => true,
    emitDesktopNotification: () => true,
    broadcastUiNotification: () => {},
    sendPushToAllUiSessions: async () => {},
    sendApnsToAllUiSessions: async () => {},
    isAnyInteractiveClientVisible: () => visible,
    buildOpenCodeUrl: (path) => `http://opencode.test${path}`,
    getOpenCodeAuthHeaders: () => ({}),
    getIsSessionAutoAccepting: async () => false,
    deliverToExtensionChannels: channels.deliver,
    sessionService: {
      open: async (id) => validSnapshot(id),
      list: async () => ({ items: [], errors: {} }),
    },
    resolveSessionScope: async (id) => ({ workspaceId: "ws_test", rootSessionId: id, cwd: "/private/repo" }),
  });
  const trigger = async (kind) => {
    const sessionId = `ses_${kind}`;
    const directory = '/private/repo';
    const scope = { workspaceId: 'ws_test', rootSessionId: sessionId, cwd: directory };
    const now = Date.now();
    if (kind === 'ready') {
      await runtime.processCanonicalEvent({ type: 'run.completed', sessionId, epoch: '1', sequence: '1', timestamp: now, runId: 'run_ready', finishedAt: now }, scope);
    }
    if (kind === 'error') {
      await runtime.processCanonicalEvent({ type: 'run.failed', sessionId, epoch: '1', sequence: '2', timestamp: now, runId: 'run_error', finishedAt: now, error: 'Private error' }, scope);
    }
    if (kind === 'question') {
      await runtime.processCanonicalEvent({
        type: 'question.requested', sessionId, epoch: '1', sequence: '3', timestamp: now,
        question: { version: '1', epoch: '1', workerGeneration: 'gen_1', questionId: 'q_1', sessionId, turnId: 'turn_1', prompt: 'Private question', status: 'pending', requestedAt: now }
      }, scope);
    }
    if (kind === 'permission') {
      await runtime.processCanonicalEvent({
        type: 'approval.requested', sessionId, epoch: '1', sequence: '4', timestamp: now,
        approval: { version: '1', epoch: '1', workerGeneration: 'gen_1', approvalId: 'app_1', sessionId, turnId: 'turn_1', toolCallId: 'tc_1', toolName: 'bash', actionType: 'bash_command', commandSummary: 'private command', details: {}, status: 'pending', requestedAt: now }
      }, scope);
    }
    if (kind === 'review') {
      await runtime.notifyAutoReviewEnded({ sessionId, directory, status: 'clean' });
    }
    if (kind.startsWith('goal_')) {
      await runtime.sendGoalSettlePush({ sessionId, directory, status: { goal_complete: 'complete', goal_blocked: 'blocked', goal_budget: 'budgetLimited' }[kind], title: 'Private goal', body: 'Private body' });
    }
    await vi.advanceTimersByTimeAsync(600);
  };
  return { delivered, trigger };
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('extension channel notification boundary', () => {
  const setup = () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (input) => Response.json({ data: String(input).includes('/active') ? {} : { id: 'ses_1', title: 'Private session' } })));
  };

  it('strips content for ready, error, question, permission and every settle kind in enterprise mode', async () => {
    setup();
    vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', 'true');
    const h = await harness();
    for (const kind of Object.keys(genericTitles)) await h.trigger(kind);
    expect(h.delivered.map(({ kind }) => kind)).toEqual(Object.keys(genericTitles));
    for (const notice of h.delivered) {
      expect(notice).toMatchObject({ title: genericTitles[notice.kind], body: '', sessionName: null, directory: null });
      expect(notice.sessionId).toBe(`ses_${notice.kind}`);
      expect(notice.url).toBe(`/?session=ses_${notice.kind}`);
    }
    expect(JSON.stringify(h.delivered)).not.toMatch(/Private|private/);
  });

  it('keeps content outside enterprise mode', async () => {
    setup();
    vi.stubEnv('OPENCHAMBER_ENTERPRISE_MODE', 'false');
    const h = await harness();
    for (const kind of Object.keys(genericTitles)) await h.trigger(kind);
    expect(h.delivered).toHaveLength(8);
    for (const notice of h.delivered) expect(notice).toMatchObject({ sessionName: 'Private session', directory: '/private/repo' });
    expect(h.delivered.some(({ body }) => body.includes('Private'))).toBe(true);
  });

  it('obeys kind toggles and suppresses delivery while a client is visible unless always', async () => {
    setup();
    const disabled = await harness({ settings: { notifyOnCompletion: false, notifyOnError: false, notifyOnQuestion: false } });
    for (const kind of ['ready', 'error', 'question', 'permission', 'review']) await disabled.trigger(kind);
    expect(disabled.delivered).toEqual([]);
    const visible = await harness({ visible: true, settings: { notificationMode: 'hidden-only' } });
    for (const kind of Object.keys(genericTitles)) await visible.trigger(kind);
    expect(visible.delivered).toEqual([]);
    const always = await harness({ visible: true });
    await always.trigger('ready');
    expect(always.delivered).toHaveLength(1);
  });
});
