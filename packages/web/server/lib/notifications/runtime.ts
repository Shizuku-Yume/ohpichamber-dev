import { createHash, randomUUID } from 'node:crypto';
import { SessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import type { CanonicalEvent, SessionSnapshot } from '@openchamber/agent-contract';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { parseCanonicalEvent } from '../event-stream/validated-event.js';
import { redactGitText } from '../git/redaction.js';
import type { JsonValue, NotificationPayload } from './contracts.js';
import type { ExtensionNotificationDelivery } from './extension-channels.js';
import { hasErrorMessage, isString } from './inputs.js';
import { genericNotificationTitle, truncateNotificationText } from './message.js';
import { pullRequestNotificationTitle } from './pull-request-locales.js';
import type { PullRequestNotificationEvent } from './pull-request-locales.js';
import { createPushTagTracker } from './push-tags-store.js';
import type { PushTagsStore } from './push-tags-store.js';
import type { createNotificationTemplateRuntime } from './template-runtime.js';
import {
  defaultNotificationTemplates,
  notificationTexts,
  renderNotificationText,
  withTemplateDefaults,
} from './template-locales.js';

type TemplateRuntime = ReturnType<typeof createNotificationTemplateRuntime>;

export interface NotificationScope {
  sessionId?: string;
  projectId?: string;
  workspaceId: string;
  rootSessionId: string;
  cwd: string;
  agentDirectory?: string;
  env?: Record<string, string | undefined>;
}

export interface NotificationSettings {
  notifyOnCompletion?: boolean;
  notifyOnError?: boolean;
  notifyOnQuestion?: boolean;
  notifyOnSubtasks?: boolean;
  notifyOnPullRequests?: boolean;
  notificationMode?: string;
  nativeNotificationsEnabled?: boolean;
  locale?: string;
  maxLastMessageLength?: number;
  notificationTemplates?: {
    completion?: { title?: string; message?: string };
    subtask?: { title?: string; message?: string };
    goalComplete?: { title?: string; message?: string };
    goalBudget?: { title?: string; message?: string };
    error?: { title?: string; message?: string };
    question?: { title?: string; message?: string };
  };
}

export interface NotificationTriggerDependencies {
  openPushTagsStore: PushTagsStore;
  clearApnsNotifications?: (request: { tags?: string[]; badge?: number | undefined }) => Promise<void>;
  isAnyUiVisible?: () => boolean;
  sessionService: {
    open: (sessionId: string) => Promise<SessionSnapshot | { session: SessionSnapshot['session']; turns: SessionSnapshot['turns']; messages: SessionSnapshot['messages'] }>;
    list: (workspaceId: string) => Promise<{ items: unknown[]; errors: Record<string, string> }>;
  };
  resolveSessionScope: (sessionId: string) => Promise<NotificationScope | null>;
  readSettingsFromDisk: () => Promise<NotificationSettings>;
  prepareNotificationLastMessage: (input: { message: string; settings: NotificationSettings }) => Promise<string> | string;
  buildTemplateVariables: TemplateRuntime['buildTemplateVariables'];
  fetchLastAssistantMessageText: TemplateRuntime['fetchLastAssistantMessageText'];
  resolveNotificationTemplate: TemplateRuntime['resolveNotificationTemplate'];
  shouldApplyResolvedTemplateMessage: TemplateRuntime['shouldApplyResolvedTemplateMessage'];
  emitDesktopNotification: (payload: NotificationPayload & { workspaceId?: string | undefined; projectId?: string | undefined }) => boolean;
  broadcastUiNotification: (payload: NotificationPayload & { workspaceId?: string | undefined; projectId?: string | undefined }, options: { desktopNotificationDelivered: boolean }) => void;
  sendPushToAllUiSessions?: (payload: WebPushPayload, options?: { requireNoSse?: boolean }) => Promise<void>;
  sendApnsToAllUiSessions?: (payload: {
    title: string;
    body: string;
    sealed?: { title: string; body: string } | undefined;
    badge?: number | undefined;
    tag: string;
    data: { sessionId?: string | undefined };
  }, options?: { requireNoSse?: boolean }) => Promise<void>;
  isAnyInteractiveClientVisible?: () => boolean;
  now?: () => number;
  getIsWindowFocused?: (() => boolean) | undefined;
  getIsSessionAutoAccepting?: ((sessionId: string, scope: NotificationScope, approvalId: string) => Promise<boolean> | boolean) | undefined;
  deliverToExtensionChannels?: ((delivery: ExtensionNotificationDelivery) => Promise<void> | void) | null;
}

interface WebPushPayload {
  title: string;
  body: string;
  tag: string;
  data: {
    url: string;
    sessionId?: string | undefined;
    sessionName?: string;
    type: string;
  };
}

interface FanoutPushInput extends WebPushPayload {
  phoneBody: string;
  apnsTag?: string;
}

interface PendingTriggerEntry {
  sessionId: string;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface ShareAnswerNotice {
  sessionId: string;
  label: string;
  title: string;
  summary: string;
  lastRunId?: string | null;
}

interface QueuedShareAnswer extends ShareAnswerNotice {
  woken: boolean;
  lastRunId: string | null;
}

interface ShareAnswerBatch {
  answers: QueuedShareAnswer[];
  firstAt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

interface ShareClaim {
  tag: string;
  skipTurnStart: boolean;
  lastRunId: string | null;
}

export interface PullRequestNotificationInput {
  item: {
    instance: string;
    owner: string;
    repo: string;
    number: number;
  };
  event: PullRequestNotificationEvent;
}

export interface GoalSettlePushInput {
  sessionId: string;
  directory?: string;
  status: string;
  title: string;
  body: string;
}

export interface AutoReviewEndedInput {
  sessionId: string;
  directory?: string | undefined;
  status: 'clean' | 'disputed' | 'limit' | 'failed';
  error?: string | undefined;
}

type TriggerKind = 'ready' | 'error' | 'question' | 'permission' | 'goal_complete' | 'goal_budget';

const isCallable = (value: unknown): value is (...args: never[]) => void => typeof value === 'function';

const TITLE_BY_TYPE = new Map<string, string>([
  ['ready', 'Agent response is ready'],
  ['error', 'Agent hit an error'],
  ['question', 'Agent needs your input'],
  ['permission', 'Agent needs permission'],
  ['goal_complete', 'Goal complete'],
  ['goal_budget', 'Goal reached its token budget'],
  ['share-answer', 'A shared page was answered'],
]);
const TEMPLATE_VARIABLE_KEYS = ['project_name', 'worktree', 'branch', 'session_name', 'agent_name', 'model_name', 'last_message', 'session_id'] as const;

export const createNotificationTriggerRuntime = (deps: NotificationTriggerDependencies) => {
  const {
    sessionService, resolveSessionScope, readSettingsFromDisk,
    prepareNotificationLastMessage, buildTemplateVariables, fetchLastAssistantMessageText,
    resolveNotificationTemplate, shouldApplyResolvedTemplateMessage,
    emitDesktopNotification, broadcastUiNotification, sendPushToAllUiSessions, sendApnsToAllUiSessions,
    isAnyInteractiveClientVisible, now = Date.now, deliverToExtensionChannels = null,
  } = deps;
  if (!isCallable(sessionService?.open) || !isCallable(sessionService?.list) || !isCallable(resolveSessionScope)) {
    throw new TypeError('Canonical session reader and Host scope resolver are required');
  }
  let getIsWindowFocused = deps.getIsWindowFocused;
  let getIsSessionAutoAccepting = deps.getIsSessionAutoAccepting;
  let stopped = false;
  const autoAcceptingSessions = new Set<string>();
  const pushTags = createPushTagTracker({ store: deps.openPushTagsStore, now });
  const pending = new Map<string, PendingTriggerEntry>();
  const notified = new Set<string>();
  const lastTerminalAt = new Map<string, number>();
  const goalNotified = new Set<string>();
  let shareAnswerBatch: ShareAnswerBatch | null = null;
  const shareClaims = new Map<string, ShareClaim>();
  const deepLink = (id: string) => `/?session=${encodeURIComponent(id)}`;
  const safeText = (text: string, scope: { cwd?: string; agentDirectory?: string; env?: Record<string, string | undefined> }) => redactGitText(text, {
    secrets: [scope.cwd, scope.agentDirectory, ...Object.values(scope.env ?? {})].filter((entry): entry is string => Boolean(entry)), maxChars: 1000,
  });
  const clearPending = (sessionId: string) => {
    for (const [key, entry] of pending) {
      if (entry.sessionId !== sessionId) continue;
      if (entry.timer !== null) clearTimeout(entry.timer);
      pending.delete(key);
    }
  };
  const phoneBodyOf = (prefix: string, text: string | undefined) => {
    const detail = truncateNotificationText((text ?? '').trim());
    if (!detail) return '';
    return prefix ? `${prefix}: ${detail}` : detail;
  };

  const PERMISSION_PREFIX_BY_ACTION = new Map<string, string>([
    ['bash_command', 'Wants to run'],
    ['file_write', 'Wants to edit'],
  ]);

  const fanoutPush = async ({ phoneBody, apnsTag, ...payload }: FanoutPushInput) => {
    const type = payload.data.type;
    const generic = TITLE_BY_TYPE.get(type) ?? 'Agent update';
    const enterprise = isEnterpriseMode();
    const web: WebPushPayload = enterprise ? { ...payload, title: generic, body: '', data: { url: payload.data.url, sessionId: payload.data.sessionId, type } } : payload;
    const visible = isAnyInteractiveClientVisible?.() === true;
    const badge = visible ? undefined : await pushTags.add(payload.tag, apnsTag ?? payload.tag, payload.data.sessionId ?? null);
    const knownSessionName = isString(payload.data.sessionName) ? payload.data.sessionName.trim() : '';
    const sealed = phoneBody && !enterprise
      ? { title: knownSessionName || generic, body: phoneBody }
      : undefined;
    await Promise.all([
      Promise.resolve().then(() => sendPushToAllUiSessions?.(web, { requireNoSse: true })).catch(() => console.warn('Web push delivery failed')),
      visible ? Promise.resolve() : Promise.resolve().then(() => sendApnsToAllUiSessions?.({
        title: generic, body: enterprise ? '' : (knownSessionName || 'Session'), sealed, badge,
        tag: apnsTag ?? payload.tag, data: { sessionId: payload.data.sessionId },
      }, { requireNoSse: true })).catch(() => console.warn('Native push delivery failed')),
    ]);
  };
  const autoAccepts = async (sessionId: string, scope: NotificationScope, approvalId: string) => {
    if (await getIsSessionAutoAccepting?.(sessionId, scope, approvalId)) return true;
    let current: string | null | undefined = sessionId;
    const seen = new Set<string>();
    while (current && !seen.has(current) && autoAcceptingSessions.size > 0) {
      if (autoAcceptingSessions.has(current)) return true;
      seen.add(current);
      const snapshot = SessionSnapshotSchema.parse(await sessionService.open(current));
      current = snapshot.session.parentSessionId;
    }
    return false;
  };
  const send = async (event: CanonicalEvent, scope: NotificationScope, kind: TriggerKind, requestKey?: string) => {
    if (stopped) return;
    const resolved = await resolveSessionScope(event.sessionId);
    if (!resolved || resolved.workspaceId !== scope.workspaceId || resolved.rootSessionId !== scope.rootSessionId || resolved.cwd !== scope.cwd) return;
    const settings = await readSettingsFromDisk();
    if ((['ready', 'goal_complete', 'goal_budget'].includes(kind) && settings.notifyOnCompletion === false) || (kind === 'error' && settings.notifyOnError === false)
      || ((kind === 'question' || kind === 'permission') && settings.notifyOnQuestion === false)) return;
    if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
    if (kind === 'permission' && event.type === 'approval.requested' && await autoAccepts(event.sessionId, resolved, event.approval.approvalId)) return;
    let subtask = false;
    if (kind === 'ready') {
      const snapshot = SessionSnapshotSchema.parse(await sessionService.open(event.sessionId));
      subtask = Boolean(snapshot.session.parentSessionId);
      if (subtask && settings.notifyOnSubtasks === false) return;
      const page = await sessionService.list(resolved.workspaceId);
      const sessions = SessionSchema.array().parse(page.items);
      if (Object.keys(page.errors).length > 0) return;
      if (sessions.some((session) => session.rootSessionId === resolved.rootSessionId && session.sessionId !== event.sessionId
        && ['running', 'awaiting_approval', 'awaiting_input'].includes(session.runtimeStatus))) return;
    }
    if (['ready', 'error'].includes(kind)) {
      const key = `${kind}:${event.sessionId}`;
      const previous = lastTerminalAt.get(key);
      if (previous !== undefined && now() - previous < 5000) return;
      lastTerminalAt.delete(key); lastTerminalAt.set(key, now());
      while (lastTerminalAt.size > 500) {
        const oldest = lastTerminalAt.keys().next().value;
        if (oldest === undefined) break;
        lastTerminalAt.delete(oldest);
      }
    }
    const texts = notificationTexts(settings.locale);
    let title = kind === 'permission' ? texts.permissionTitle : kind === 'question' ? texts.questionTitle
      : kind === 'error' ? texts.errorTitle
        : kind === 'goal_complete' ? (TITLE_BY_TYPE.get('goal_complete') ?? 'Goal complete')
          : kind === 'goal_budget' ? (TITLE_BY_TYPE.get('goal_budget') ?? 'Goal reached its token budget')
            : renderNotificationText(texts.readyTitle, { agent_name: 'Agent' });
    let body = kind === 'permission' ? texts.permissionBody : kind === 'question' ? texts.questionBody
      : kind === 'error' ? texts.errorBody
        : kind === 'goal_complete' ? 'The goal is complete'
          : kind === 'goal_budget' ? 'The goal reached its token budget'
            : renderNotificationText(texts.readyMessage, { model_name: 'Assistant' });
    let sessionName = '';
    let phoneBody = '';
    try {
      const variables = await buildTemplateVariables(event, event.sessionId, resolved);
      sessionName = safeText(variables.session_name, resolved);
      const text = kind === 'ready' || kind === 'goal_complete' || kind === 'goal_budget' ? await fetchLastAssistantMessageText(event.sessionId)
        : kind === 'error' && event.type === 'run.failed' ? event.error
          : kind === 'question' && event.type === 'question.requested' ? event.question.prompt
            : kind === 'permission' && event.type === 'approval.requested' ? event.approval.commandSummary : '';
      variables.last_message = await prepareNotificationLastMessage({ message: safeText(text, resolved), settings });
      for (const key of TEMPLATE_VARIABLE_KEYS) variables[key] = safeText(variables[key], resolved);
      const templates = settings.notificationTemplates ?? {};
      const defaults = defaultNotificationTemplates(settings.locale);
      const template = withTemplateDefaults(
        kind === 'ready' ? (subtask ? templates.subtask ?? templates.completion : templates.completion)
          : kind === 'goal_complete' ? templates.goalComplete
            : kind === 'goal_budget' ? templates.goalBudget
              : kind === 'error' ? templates.error : templates.question,
        kind === 'ready' ? (subtask ? defaults.subtask : defaults.completion)
          : kind === 'error' ? defaults.error
            : kind === 'permission' ? { ...defaults.question, title: texts.permissionTitle } : defaults.question,
      );
      const resolvedTitle = resolveNotificationTemplate(template.title, variables);
      const resolvedBody = resolveNotificationTemplate(template.message, variables);
      if (resolvedTitle) title = resolvedTitle;
      if (shouldApplyResolvedTemplateMessage(template.message, resolvedBody, variables)) body = resolvedBody;
      phoneBody = kind === 'ready' ? phoneBodyOf('', variables.last_message)
        : kind === 'error' ? phoneBodyOf('Error', variables.last_message)
          : kind === 'question' && event.type === 'question.requested' ? phoneBodyOf('Question', safeText(event.question.prompt, resolved))
            : event.type === 'approval.requested'
              ? phoneBodyOf(PERMISSION_PREFIX_BY_ACTION.get(event.approval.actionType) ?? 'Wants permission', safeText(event.approval.commandSummary, resolved))
              : '';
    } catch { console.warn('Notification enrichment unavailable; using generic notification'); }
    if (stopped || (requestKey && !pending.has(requestKey))) return;
    title = safeText(title, resolved); body = safeText(body, resolved);
    const tag = kind === 'permission' ? `permission-${requestKey}` : `${kind}-${event.sessionId}`;
    if (settings.nativeNotificationsEnabled) {
      const notification = {
        title, body, tag, kind, sessionId: event.sessionId, workspaceId: resolved.workspaceId,
        projectId: resolved.projectId, requireHidden: settings.notificationMode !== 'always',
      };
      const delivered = emitDesktopNotification(notification);
      broadcastUiNotification(notification, { desktopNotificationDelivered: delivered });
    }
    if (requestKey) {
      notified.add(requestKey);
      while (notified.size > 500) {
        const oldest = notified.values().next().value;
        if (oldest === undefined) break;
        notified.delete(oldest);
      }
    }
    await fanoutPush({ title, body, phoneBody, tag, data: { url: deepLink(event.sessionId), sessionId: event.sessionId, sessionName, type: kind } });
    sendToChannels({ kind, title, body, tag, sessionId: event.sessionId, directory: resolved.cwd, sessionName }, settings);
  };
  const processCanonicalEvent = async (input: CanonicalEvent | JsonValue | undefined, scope: NotificationScope | null | undefined) => {
    if (stopped) return;
    const event = parseCanonicalEvent(input);
    if (!scope?.workspaceId || !scope?.rootSessionId) throw new Error('Host event scope is required');
    if (event.type === 'run.started') await advanceShareRun(event.sessionId, event.runId);
    if (event.type === 'session.updated' && event.mode?.kind === 'goal' && event.mode.status === 'active') goalNotified.delete(event.sessionId);
    if (event.type === 'session.deleted') { for (const id of event.deletedSessionIds) clearPending(id); return; }
    if (event.type === 'run.cancelled') { clearPending(event.sessionId); return; }
    if (event.type === 'run.completed' || event.type === 'run.failed') {
      if (event.type === 'run.completed') {
        let mode;
        try { mode = SessionSnapshotSchema.parse(await sessionService.open(event.sessionId)).session.mode; }
        catch { return; }
        if (mode.kind === 'goal' && mode.status === 'active') return;
        if (mode.kind === 'goal' && (mode.status === 'complete' || mode.status === 'budget-limited')) {
          if (goalNotified.has(event.sessionId)) return send(event, scope, 'ready');
          goalNotified.add(event.sessionId);
          while (goalNotified.size > 500) {
            const oldest = goalNotified.values().next().value;
            if (oldest === undefined) break;
            goalNotified.delete(oldest);
          }
          return send(event, scope, mode.status === 'complete' ? 'goal_complete' : 'goal_budget');
        }
      }
      return send(event, scope, event.type === 'run.completed' ? 'ready' : 'error');
    }
    let permission = false;
    let id: string;
    if (event.type === 'approval.requested' || event.type === 'approval.resolved') {
      permission = true;
      id = event.approval.approvalId;
    } else if (event.type === 'question.requested' || event.type === 'question.resolved') {
      id = event.question.questionId;
    } else {
      return;
    }
    const key = `${event.sessionId}:${event.epoch}:${id}`;
    if (event.type.endsWith('.resolved')) {
      const timer = pending.get(key)?.timer;
      if (timer != null) clearTimeout(timer);
      pending.delete(key);
      return;
    }
    if (notified.has(key) || pending.has(key)) return;
    const entry: PendingTriggerEntry = { sessionId: event.sessionId, timer: null };
    pending.set(key, entry);
    entry.timer = setTimeout(() => {
      void send(event, scope, permission ? 'permission' : 'question', key)
        .catch(() => console.warn('Canonical notification trigger failed'))
        .finally(() => { if (pending.get(key) === entry) pending.delete(key); });
    }, 500);
  };
  const sendToChannels = (
    { kind, title, body, tag, sessionId, directory, sessionName }: {
      kind: ExtensionNotificationDelivery['notification']['kind'];
      title: string;
      body: string;
      tag: string;
      sessionId?: string | undefined;
      directory?: string | undefined;
      sessionName?: string | undefined;
    },
    settings: NotificationSettings | undefined,
  ) => {
    if (!isCallable(deliverToExtensionChannels)) return;
    const enterprise = isEnterpriseMode();
    const notification: ExtensionNotificationDelivery['notification'] = {
      kind,
      title: enterprise ? genericNotificationTitle(kind) : title,
      body: enterprise ? '' : body,
      tag,
      at: Date.now(),
      sessionId: sessionId || null,
      sessionName: enterprise ? null : (isString(sessionName) && sessionName.trim() ? sessionName.trim() : null),
      directory: enterprise ? null : (isString(directory) && directory ? directory : null),
      url: sessionId ? deepLink(sessionId) : null,
    };
    Promise.resolve(deliverToExtensionChannels({ notification, requireHidden: settings?.notificationMode !== 'always' })).catch((error) => {
      console.warn('[Notification] extension channel delivery failed:', (hasErrorMessage(error) ? error.message : undefined) ?? error);
    });
  };

  const notifyPullRequest = async ({ item, event }: PullRequestNotificationInput) => {
    const settings = await readSettingsFromDisk();
    if (settings.notifyOnPullRequests === false) return;
    if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
    const title = pullRequestNotificationTitle(settings.locale ?? 'en', event);
    if (!title) return;
    const body = `${item.owner}/${item.repo}#${item.number}`;
    const tag = `pull-request-${createHash('sha256').update(`${item.instance}\n${body}`).digest('hex').slice(0, 16)}-${event}`;
    const payload: NotificationPayload = { title, body, tag, kind: 'pull-request', requireHidden: settings.notificationMode !== 'always' };
    if (settings.nativeNotificationsEnabled) {
      const desktopNotificationDelivered = emitDesktopNotification(payload);
      broadcastUiNotification(payload, { desktopNotificationDelivered });
    }
    await fanoutPush({ title, body, phoneBody: `${title}: ${body}`, tag, data: { url: '/', type: 'pull-request' } });
    sendToChannels({ kind: 'pull-request', title, body, tag }, settings);
  };

  const clearShareClaim = async (sessionId: string) => {
    const claim = shareClaims.get(sessionId);
    if (!claim) return;
    shareClaims.delete(sessionId);
    await pushTags.remove(`share-${sessionId}`);
    await deps.clearApnsNotifications?.({ tags: [claim.tag] });
  };
  const pruneShareBatch = (keep: (answer: QueuedShareAnswer) => boolean) => {
    if (!shareAnswerBatch) return;
    shareAnswerBatch.answers = shareAnswerBatch.answers.filter(keep);
    if (shareAnswerBatch.answers.length === 0) {
      if (shareAnswerBatch.timer !== null) clearTimeout(shareAnswerBatch.timer);
      shareAnswerBatch = null;
    }
  };
  const advanceShareRun = async (sessionId: string, runId: string) => {
    pruneShareBatch((answer) => {
      if (answer.sessionId !== sessionId || answer.lastRunId === runId) return true;
      if (answer.woken) return false;
      answer.woken = true;
      answer.lastRunId = runId;
      return true;
    });
    const claim = shareClaims.get(sessionId);
    if (!claim || claim.lastRunId === runId) return;
    claim.lastRunId = runId;
    if (claim.skipTurnStart) claim.skipTurnStart = false;
    else await clearShareClaim(sessionId);
  };
  const announceShareAnswers = async (answers: QueuedShareAnswer[]) => {
    const settings = await readSettingsFromDisk();
    const newest = answers.at(-1);
    if (stopped || settings.notifyOnCompletion === false || !newest) return;
    const { sessionId } = newest;
    const scope = await resolveSessionScope(sessionId);
    if (!scope) throw new Error('Host session scope is unavailable');
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    if (snapshot.session.sessionId !== sessionId || snapshot.session.workspaceId !== scope.workspaceId
      || snapshot.session.rootSessionId !== scope.rootSessionId) throw new Error('Host session scope mismatch');
    const texts = notificationTexts(settings.locale);
    const title = safeText(answers.length === 1
      ? texts.shareAnswerTitle.replace('{label}', () => newest.label).replace('{title}', () => newest.title)
      : texts.shareAnswersTitle.replace('{count}', () => String(answers.length)), scope);
    const body = safeText(truncateNotificationText(answers.length === 1 ? newest.summary
      : [...new Set(answers.map((answer) => answer.label))].join(', '), 240), scope);
    const sessionName = safeText(snapshot.session.title ?? '', scope);
    const tag = `share-${sessionId}`;
    const claim: ShareClaim = { tag: `${tag}@${randomUUID()}`, skipTurnStart: !answers.some((answer) => answer.sessionId === sessionId && answer.woken), lastRunId: newest.lastRunId };
    shareClaims.delete(sessionId);
    shareClaims.set(sessionId, claim);
    while (shareClaims.size > 500) {
      const oldest = shareClaims.keys().next().value;
      if (oldest === undefined) break;
      shareClaims.delete(oldest);
    }
    const awayOnly = settings.notificationMode !== 'always';
    const osAllowed = settings.nativeNotificationsEnabled === true
      && !(awayOnly && ((deps.isAnyUiVisible?.() ?? isAnyInteractiveClientVisible?.()) || getIsWindowFocused?.() === true));
    const payload: NotificationPayload = { title, body, tag, kind: 'share-answer', sessionId, directory: scope.cwd, requireHidden: awayOnly };
    const desktopNotificationDelivered = osAllowed ? emitDesktopNotification(payload) : false;
    broadcastUiNotification({ ...payload, showWhenFocused: true, toastOnly: !osAllowed }, { desktopNotificationDelivered });
    await fanoutPush({
      title, body, phoneBody: phoneBodyOf(title, body) || title, tag, apnsTag: claim.tag,
      data: { url: deepLink(sessionId), sessionId, sessionName, type: 'share-answer' },
    });
    sendToChannels({ ...payload, kind: 'share-answer', title, body, tag, sessionName }, settings);
  };
  const notifyShareAnswer = (answer: ShareAnswerNotice) => {
    if (stopped) return;
    const batch: ShareAnswerBatch = shareAnswerBatch ?? { answers: [], firstAt: now(), timer: null };
    shareAnswerBatch = batch;
    batch.answers.push({ ...answer, woken: false, lastRunId: null });
    if (batch.timer !== null) clearTimeout(batch.timer);
    const wait = Math.max(0, Math.min(2000, batch.firstAt + 10000 - now()));
    batch.timer = setTimeout(() => {
      if (shareAnswerBatch === batch) shareAnswerBatch = null;
      announceShareAnswers(batch.answers).catch(() => console.warn('[Notification] shared page answer notification failed'));
    }, wait);
    batch.timer.unref?.();
  };

  return {
    notifyShareAnswer,
    async clearSessionPushNotifications(sessionId: string) {
      pruneShareBatch((answer) => answer.sessionId !== sessionId);
      const claim = shareClaims.get(sessionId);
      shareClaims.delete(sessionId);
      const cleared = await pushTags.clearSession(sessionId);
      if (claim && !cleared.tags.includes(claim.tag)) cleared.tags.push(claim.tag);
      if (cleared.tags.length > 0) await deps.clearApnsNotifications?.(cleared);
    },
    processCanonicalEvent,
    setAutoAcceptSession(sessionId: string, enabled: boolean) { if (enabled) autoAcceptingSessions.add(sessionId); else autoAcceptingSessions.delete(sessionId); },
    setGetIsWindowFocused(resolver: NotificationTriggerDependencies['getIsWindowFocused']) { getIsWindowFocused = resolver; },
    setGetIsSessionAutoAccepting(resolver: NotificationTriggerDependencies['getIsSessionAutoAccepting']) { getIsSessionAutoAccepting = resolver; },
    clearPendingPushBadge() { return pushTags.clearAll(); },
    async sendGoalSettlePush({ sessionId, directory, status, title, body }: GoalSettlePushInput) {
      const scope = await resolveSessionScope(sessionId).catch(() => null);
      const safeScope = scope ?? (directory ? { cwd: directory } : {});
      let sessionName = '';
      try { sessionName = safeText((await buildTemplateVariables(null, sessionId, safeScope)).session_name, safeScope); } catch { void 0; }
      const type = status === 'complete' ? 'goal_complete' : status === 'budgetLimited' ? 'goal_budget' : 'goal_blocked';
      const tag = `goal-${sessionId}`;
      await fanoutPush({
        title: safeText(title, safeScope), body: safeText(body, safeScope),
        phoneBody: phoneBodyOf(safeText(title, safeScope), safeText(body, safeScope)) || safeText(title, safeScope), tag,
        data: { url: deepLink(sessionId), sessionId, sessionName, type },
      });
      const settings = await readSettingsFromDisk();
      sendToChannels({ kind: type, title: safeText(title, safeScope), body: safeText(body, safeScope), tag, sessionId, directory: directory ?? scope?.cwd, sessionName }, settings);
    },
    async notifyAutoReviewEnded({ sessionId, directory, status, error }: AutoReviewEndedInput) {
      const settings = await readSettingsFromDisk();
      if (settings.notifyOnCompletion === false) return;
      if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
      const texts = notificationTexts(settings.locale);
      const copyByStatus = {
        clean: { title: texts.reviewCleanTitle, body: texts.reviewCleanBody },
        disputed: { title: texts.reviewDisputedTitle, body: texts.reviewDisputedBody },
        limit: { title: texts.reviewLimitTitle, body: texts.reviewLimitBody },
        failed: { title: texts.reviewFailedTitle, body: truncateNotificationText(error ?? '', 240) },
      };
      const { title, body } = copyByStatus[status] ?? { title: '', body: '' };
      if (!title) return;
      const tag = `review-${sessionId}`;
      if (settings.nativeNotificationsEnabled) {
        const payload: NotificationPayload = { title, body, tag, kind: 'review', sessionId, directory, requireHidden: settings.notificationMode !== 'always' };
        const desktopNotificationDelivered = emitDesktopNotification(payload);
        broadcastUiNotification(payload, { desktopNotificationDelivered });
      }
      const scope = await resolveSessionScope(sessionId).catch(() => null);
      const safeScope = scope ?? (directory ? { cwd: directory } : {});
      let sessionName = '';
      try { sessionName = safeText((await buildTemplateVariables(null, sessionId, safeScope)).session_name, safeScope); } catch { void 0; }
      await fanoutPush({ title, body, phoneBody: phoneBodyOf(title, body) || title, tag, data: { url: deepLink(sessionId), sessionId, sessionName, type: 'review' } });
      sendToChannels({ kind: 'review', title, body, tag, sessionId, directory: directory ?? scope?.cwd, sessionName }, settings);
    },
    notifyPullRequest,
    invalidateSession(sessionId: string) { clearPending(sessionId); goalNotified.delete(sessionId); },
    stop() {
      stopped = true;
      if (shareAnswerBatch?.timer != null) clearTimeout(shareAnswerBatch.timer);
      shareAnswerBatch = null;
      shareClaims.clear();
      for (const entry of pending.values()) {
        if (entry.timer !== null) clearTimeout(entry.timer);
      }
      pending.clear();
    },
  };
};
