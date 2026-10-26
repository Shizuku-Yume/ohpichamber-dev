import { CanonicalEventSchema, SessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { redactGitText } from '../git/redaction.js';

const TITLES = {
  ready: 'Agent response is ready', error: 'Agent hit an error', question: 'Agent needs your input', permission: 'Agent needs permission',
  goal_complete: 'Goal complete', goal_budget: 'Goal reached its token budget',
};

export const createNotificationTriggerRuntime = (deps) => {
  const {
    sessionService, resolveSessionScope, readSettingsFromDisk, readSessionMetadata,
    prepareNotificationLastMessage, buildTemplateVariables, fetchLastAssistantMessageText,
    resolveNotificationTemplate, shouldApplyResolvedTemplateMessage,
    emitDesktopNotification, broadcastUiNotification, sendPushToAllUiSessions, sendApnsToAllUiSessions,
    isAnyInteractiveClientVisible, now = Date.now,
  } = deps;
  if (typeof sessionService?.open !== 'function' || typeof sessionService?.list !== 'function' || typeof resolveSessionScope !== 'function') {
    throw new TypeError('Canonical session reader and Host scope resolver are required');
  }
  let getIsWindowFocused = deps.getIsWindowFocused;
  let getIsSessionAutoAccepting = deps.getIsSessionAutoAccepting;
  let stopped = false;
  const autoAcceptingSessions = new Set();
  const pendingPushTags = new Set();
  const pending = new Map();
  const notified = new Set();
  const lastTerminalAt = new Map();
  const goalNotified = new Set();
  const deepLink = (id) => `/?session=${encodeURIComponent(id)}`;
  const safeText = (text, scope) => redactGitText(text, {
    secrets: [scope.cwd, scope.agentDirectory, ...Object.values(scope.env ?? {})].filter(Boolean), maxChars: 1000,
  });
  const clearPending = (sessionId) => {
    for (const [key, entry] of pending) {
      if (entry.sessionId !== sessionId) continue;
      clearTimeout(entry.timer); pending.delete(key);
    }
  };
  const fanoutPush = async (payload) => {
    const type = payload.data.type;
    const generic = TITLES[type] ?? 'Agent update';
    const web = isEnterpriseMode() ? { ...payload, title: generic, body: '', data: { url: payload.data.url, sessionId: payload.data.sessionId, type } } : payload;
    const visible = isAnyInteractiveClientVisible?.() === true;
    if (!visible) pendingPushTags.add(payload.tag);
    await Promise.all([
      Promise.resolve().then(() => sendPushToAllUiSessions?.(web, { requireNoSse: true })).catch(() => console.warn('Web push delivery failed')),
      visible ? Promise.resolve() : Promise.resolve().then(() => sendApnsToAllUiSessions?.({
        title: generic, body: isEnterpriseMode() ? '' : payload.data.sessionName || 'Session', badge: pendingPushTags.size,
        tag: payload.tag, data: { sessionId: payload.data.sessionId },
      }, { requireNoSse: true })).catch(() => console.warn('Native push delivery failed')),
    ]);
  };
  const autoAccepts = async (sessionId, scope, approvalId) => {
    if (await getIsSessionAutoAccepting?.(sessionId, scope, approvalId)) return true;
    let current = sessionId;
    const seen = new Set();
    while (current && !seen.has(current) && autoAcceptingSessions.size > 0) {
      if (autoAcceptingSessions.has(current)) return true;
      seen.add(current);
      const snapshot = SessionSnapshotSchema.parse(await sessionService.open(current));
      current = snapshot.session.parentSessionId;
    }
    return false;
  };
  const send = async (event, scope, kind, requestKey) => {
    if (stopped) return;
    const resolved = await resolveSessionScope(event.sessionId);
    if (resolved.workspaceId !== scope.workspaceId || resolved.rootSessionId !== scope.rootSessionId || resolved.cwd !== scope.cwd) return;
    const settings = await readSettingsFromDisk();
    if ((['ready', 'goal_complete', 'goal_budget'].includes(kind) && settings.notifyOnCompletion === false) || (kind === 'error' && settings.notifyOnError === false)
      || ((kind === 'question' || kind === 'permission') && settings.notifyOnQuestion === false)) return;
    if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
    if (kind === 'permission' && await autoAccepts(event.sessionId, resolved, event.approval.approvalId)) return;
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
      while (lastTerminalAt.size > 500) lastTerminalAt.delete(lastTerminalAt.keys().next().value);
    }
    let title = kind === 'permission' ? 'Permission required' : kind === 'question' ? 'Input needed' : kind === 'error' ? 'Tool error'
      : kind === 'goal_complete' ? TITLES.goal_complete : kind === 'goal_budget' ? TITLES.goal_budget : 'Agent is ready';
    let body = kind === 'permission' ? 'Agent is waiting for your approval' : kind === 'question' ? 'Agent is waiting for your response'
      : kind === 'error' ? 'An error occurred' : kind === 'goal_complete' ? 'The goal is complete'
        : kind === 'goal_budget' ? 'The goal reached its token budget' : 'Assistant completed the task';
    let sessionName = '';
    try {
      const variables = await buildTemplateVariables(event, event.sessionId, resolved);
      sessionName = safeText(variables.session_name, resolved);
      const text = kind === 'ready' || kind === 'goal_complete' || kind === 'goal_budget' ? await fetchLastAssistantMessageText(event.sessionId)
        : kind === 'question' ? event.question.prompt : kind === 'permission' ? event.approval.commandSummary : '';
      variables.last_message = await prepareNotificationLastMessage({ message: safeText(text, resolved), settings });
      for (const key of Object.keys(variables)) variables[key] = safeText(variables[key], resolved);
      const templates = settings.notificationTemplates ?? {};
      const template = kind === 'ready' ? (subtask ? templates.subtask ?? templates.completion : templates.completion)
        : kind === 'goal_complete' ? templates.goalComplete : kind === 'goal_budget' ? templates.goalBudget
          : kind === 'error' ? templates.error : templates.question;
      if (template) {
        const resolvedTitle = resolveNotificationTemplate(template.title, variables);
        const resolvedBody = resolveNotificationTemplate(template.message, variables);
        if (resolvedTitle) title = resolvedTitle;
        if (shouldApplyResolvedTemplateMessage(template.message, resolvedBody, variables)) body = resolvedBody;
      } else if ((kind === 'question' || kind === 'permission') && variables.last_message) body = variables.last_message;
    } catch { console.warn('Notification enrichment unavailable; using generic notification'); }
    if (stopped || (requestKey && !pending.has(requestKey))) return;
    title = safeText(title, resolved); body = safeText(body, resolved);
    const tag = kind === 'permission' ? `permission-${requestKey}` : `${kind}-${event.sessionId}`;
    if (settings.nativeNotificationsEnabled) {
      const notification = { title, body, tag, kind, sessionId: event.sessionId, workspaceId: resolved.workspaceId,
        projectId: resolved.projectId, requireHidden: settings.notificationMode !== 'always' };
      const delivered = emitDesktopNotification(notification);
      broadcastUiNotification(notification, { desktopNotificationDelivered: delivered });
    }
    if (requestKey) {
      notified.add(requestKey);
      while (notified.size > 500) notified.delete(notified.values().next().value);
    }
    await fanoutPush({ title, body, tag, data: { url: deepLink(event.sessionId), sessionId: event.sessionId, sessionName, type: kind } });
  };
  const processCanonicalEvent = async (input, scope) => {
    if (stopped) return;
    const event = CanonicalEventSchema.parse(input);
    if (!scope?.workspaceId || !scope?.rootSessionId) throw new Error('Host event scope is required');
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
          while (goalNotified.size > 500) goalNotified.delete(goalNotified.values().next().value);
          return send(event, scope, mode.status === 'complete' ? 'goal_complete' : 'goal_budget');
        }
      }
      return send(event, scope, event.type === 'run.completed' ? 'ready' : 'error');
    }
    const permission = event.type.startsWith('approval.');
    const question = event.type.startsWith('question.');
    if (!permission && !question) return;
    const id = permission ? event.approval.approvalId : event.question.questionId;
    const key = `${event.sessionId}:${event.epoch}:${id}`;
    if (event.type.endsWith('.resolved')) {
      clearTimeout(pending.get(key)?.timer); pending.delete(key); return;
    }
    if (notified.has(key) || pending.has(key)) return;
    const entry = { sessionId: event.sessionId, timer: null };
    pending.set(key, entry);
    entry.timer = setTimeout(() => {
      void send(event, scope, permission ? 'permission' : 'question', key)
        .catch(() => console.warn('Canonical notification trigger failed'))
        .finally(() => { if (pending.get(key) === entry) pending.delete(key); });
    }, 500);
  };
  return {
    processCanonicalEvent,
    setAutoAcceptSession(sessionId, enabled) { if (enabled) autoAcceptingSessions.add(sessionId); else autoAcceptingSessions.delete(sessionId); },
    setGetIsWindowFocused(resolver) { getIsWindowFocused = resolver; },
    setGetIsSessionAutoAccepting(resolver) { getIsSessionAutoAccepting = resolver; },
    clearPendingPushBadge() { pendingPushTags.clear(); },
    invalidateSession(sessionId) { clearPending(sessionId); goalNotified.delete(sessionId); },
    stop() { stopped = true; for (const entry of pending.values()) clearTimeout(entry.timer); pending.clear(); },
  };
};
