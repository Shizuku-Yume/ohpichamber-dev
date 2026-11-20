import { createHash, randomUUID } from 'node:crypto';
import { CanonicalEventSchema, SessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { redactGitText } from '../git/redaction.js';
import { genericNotificationTitle, truncateNotificationText } from './message.js';
import { pullRequestNotificationTitle } from './pull-request-locales.js';
import { createPushTagTracker } from './push-tags-store.js';
import {
  defaultNotificationTemplates,
  notificationTexts,
  renderNotificationText,
  withTemplateDefaults,
} from './template-locales.js';

const TITLES = {
  ready: 'Agent response is ready', error: 'Agent hit an error', question: 'Agent needs your input', permission: 'Agent needs permission',
  goal_complete: 'Goal complete', goal_budget: 'Goal reached its token budget',
  'share-answer': 'A shared page was answered',
};

export const createNotificationTriggerRuntime = (deps) => {
  const {
    sessionService, resolveSessionScope, readSettingsFromDisk,
    prepareNotificationLastMessage, buildTemplateVariables, fetchLastAssistantMessageText,
    resolveNotificationTemplate, shouldApplyResolvedTemplateMessage,
    emitDesktopNotification, broadcastUiNotification, sendPushToAllUiSessions, sendApnsToAllUiSessions,
    isAnyInteractiveClientVisible, now = Date.now, deliverToExtensionChannels = null,
  } = deps;
  if (typeof sessionService?.open !== 'function' || typeof sessionService?.list !== 'function' || typeof resolveSessionScope !== 'function') {
    throw new TypeError('Canonical session reader and Host scope resolver are required');
  }
  let getIsWindowFocused = deps.getIsWindowFocused;
  let getIsSessionAutoAccepting = deps.getIsSessionAutoAccepting;
  let stopped = false;
  const autoAcceptingSessions = new Set();
  const pushTags = createPushTagTracker({ store: deps.openPushTagsStore, now });
  const pending = new Map();
  const notified = new Set();
  const lastTerminalAt = new Map();
  const goalNotified = new Set();
  let shareAnswerBatch = null;
  const shareClaims = new Map();
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
  // The body a phone shows: what happened, after a word that says which kind
  // of event it is. A finished turn needs no word, its reply says it.
  const phoneBodyOf = (prefix, text) => {
    const detail = truncateNotificationText((text ?? '').trim());
    if (!detail) return '';
    return prefix ? `${prefix}: ${detail}` : detail;
  };

  const PERMISSION_PREFIX_BY_ACTION = {
    bash_command: 'Wants to run',
    file_write: 'Wants to edit',
  };

  const fanoutPush = async ({ phoneBody, apnsTag, ...payload }) => {
    const type = payload.data.type;
    const generic = TITLES[type] ?? 'Agent update';
    const enterprise = isEnterpriseMode();
    const web = enterprise ? { ...payload, title: generic, body: '', data: { url: payload.data.url, sessionId: payload.data.sessionId, type } } : payload;
    const visible = isAnyInteractiveClientVisible?.() === true;
    const badge = visible ? undefined : await pushTags.add(payload.tag, apnsTag ?? payload.tag, payload.data.sessionId ?? null);
    const knownSessionName = typeof payload.data.sessionName === 'string' ? payload.data.sessionName.trim() : '';
    // A phone with a push key opens the sealed text on the device; the relay
    // and the push service see only the generic title. Enterprise mode keeps
    // the generic text even sealed: the push service is outside its boundary.
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
    const texts = notificationTexts(settings.locale);
    let title = kind === 'permission' ? texts.permissionTitle : kind === 'question' ? texts.questionTitle
      : kind === 'error' ? texts.errorTitle
      : kind === 'goal_complete' ? TITLES.goal_complete : kind === 'goal_budget' ? TITLES.goal_budget
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
        : kind === 'error' ? event.error
          : kind === 'question' ? event.question.prompt : kind === 'permission' ? event.approval.commandSummary : '';
      variables.last_message = await prepareNotificationLastMessage({ message: safeText(text, resolved), settings });
      for (const key of Object.keys(variables)) variables[key] = safeText(variables[key], resolved);
      const templates = settings.notificationTemplates ?? {};
      const defaults = defaultNotificationTemplates(settings.locale);
      // A permission reuses the question template, but its empty title is the
      // permission wording, not "Input needed".
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
          : kind === 'question' ? phoneBodyOf('Question', safeText(event.question.prompt, resolved))
            : phoneBodyOf(PERMISSION_PREFIX_BY_ACTION[event.approval.actionType] ?? 'Wants permission', safeText(event.approval.commandSummary, resolved));
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
    await fanoutPush({ title, body, phoneBody, tag, data: { url: deepLink(event.sessionId), sessionId: event.sessionId, sessionName, type: kind } });
    sendToChannels({ kind, title, body, tag, sessionId: event.sessionId, directory: resolved.cwd, sessionName }, settings);
  };
  const processCanonicalEvent = async (input, scope) => {
    if (stopped) return;
    const event = CanonicalEventSchema.parse(input);
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
  const sendToChannels = ({ kind, title, body, tag, sessionId, directory, sessionName }, settings) => {
    if (typeof deliverToExtensionChannels !== 'function') return;
    const enterprise = isEnterpriseMode();
    const notification = {
      kind,
      title: enterprise ? genericNotificationTitle(kind) : title,
      body: enterprise ? '' : body,
      tag,
      at: Date.now(),
      sessionId: sessionId || null,
      sessionName: enterprise ? null : (typeof sessionName === 'string' && sessionName.trim() ? sessionName.trim() : null),
      directory: enterprise ? null : (typeof directory === 'string' && directory ? directory : null),
      url: sessionId ? deepLink(sessionId) : null,
    };
    Promise.resolve(deliverToExtensionChannels({ notification, requireHidden: settings?.notificationMode !== 'always' })).catch((error) => {
      console.warn('[Notification] extension channel delivery failed:', error?.message ?? error);
    });
  };

  const notifyPullRequest = async ({ item, event }) => {
    const settings = await readSettingsFromDisk();
    if (settings.notifyOnPullRequests === false) return;
    if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
    const title = pullRequestNotificationTitle(settings.locale, event);
    if (!title) return;
    const body = `${item.owner}/${item.repo}#${item.number}`;
    const tag = `pull-request-${createHash('sha256').update(`${item.instance}\n${body}`).digest('hex').slice(0, 16)}-${event}`;
    const payload = { title, body, tag, kind: 'pull-request', requireHidden: settings.notificationMode !== 'always' };
    if (settings.nativeNotificationsEnabled) {
      const desktopNotificationDelivered = emitDesktopNotification(payload);
      broadcastUiNotification(payload, { desktopNotificationDelivered });
    }
    await fanoutPush({ title, body, phoneBody: `${title}: ${body}`, tag, data: { url: '/', type: 'pull-request' } }, { requireNoSse: true });
    sendToChannels({ kind: 'pull-request', title, body, tag }, settings);
  };

  const clearShareClaim = async (sessionId) => {
    const claim = shareClaims.get(sessionId);
    if (!claim) return;
    shareClaims.delete(sessionId);
    await pushTags.remove(`share-${sessionId}`);
    await deps.clearApnsNotifications?.({ tags: [claim.tag] });
  };
  const pruneShareBatch = (keep) => {
    if (!shareAnswerBatch) return;
    shareAnswerBatch.answers = shareAnswerBatch.answers.filter(keep);
    if (shareAnswerBatch.answers.length === 0) {
      clearTimeout(shareAnswerBatch.timer);
      shareAnswerBatch = null;
    }
  };
  const advanceShareRun = async (sessionId, runId) => {
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
  const announceShareAnswers = async (answers) => {
    const settings = await readSettingsFromDisk();
    if (stopped || settings.notifyOnCompletion === false || answers.length === 0) return;
    const newest = answers.at(-1);
    const { sessionId } = newest;
    const scope = await resolveSessionScope(sessionId);
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
    const claim = { tag: `${tag}@${randomUUID()}`, skipTurnStart: !answers.some((answer) => answer.sessionId === sessionId && answer.woken), lastRunId: newest.lastRunId };
    shareClaims.delete(sessionId);
    shareClaims.set(sessionId, claim);
    while (shareClaims.size > 500) shareClaims.delete(shareClaims.keys().next().value);
    const awayOnly = settings.notificationMode !== 'always';
    const osAllowed = settings.nativeNotificationsEnabled === true
      && !(awayOnly && ((deps.isAnyUiVisible?.() ?? isAnyInteractiveClientVisible?.()) || getIsWindowFocused?.() === true));
    const payload = { title, body, tag, kind: 'share-answer', sessionId, directory: scope.cwd, requireHidden: awayOnly };
    const desktopNotificationDelivered = osAllowed ? emitDesktopNotification(payload) : false;
    broadcastUiNotification({ ...payload, showWhenFocused: true, toastOnly: !osAllowed }, { desktopNotificationDelivered });
    await fanoutPush({ title, body, phoneBody: phoneBodyOf(title, body) || title, tag, apnsTag: claim.tag,
      data: { url: deepLink(sessionId), sessionId, sessionName, type: 'share-answer' } });
    sendToChannels({ ...payload, sessionName }, settings);
  };
  const notifyShareAnswer = (answer) => {
    if (stopped) return;
    const batch = shareAnswerBatch ?? { answers: [], firstAt: now(), timer: null };
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
    async clearSessionPushNotifications(sessionId) {
      pruneShareBatch((answer) => answer.sessionId !== sessionId);
      const claim = shareClaims.get(sessionId);
      shareClaims.delete(sessionId);
      const cleared = await pushTags.clearSession(sessionId);
      if (claim && !cleared.tags.includes(claim.tag)) cleared.tags.push(claim.tag);
      if (cleared.tags.length > 0) await deps.clearApnsNotifications?.(cleared);
    },
    processCanonicalEvent,
    setAutoAcceptSession(sessionId, enabled) { if (enabled) autoAcceptingSessions.add(sessionId); else autoAcceptingSessions.delete(sessionId); },
    setGetIsWindowFocused(resolver) { getIsWindowFocused = resolver; },
    setGetIsSessionAutoAccepting(resolver) { getIsSessionAutoAccepting = resolver; },
    clearPendingPushBadge() { return pushTags.clearAll(); },
    async sendGoalSettlePush({ sessionId, directory, status, title, body }) {
      const scope = await resolveSessionScope(sessionId).catch(() => ({ cwd: directory }));
      let sessionName = "";
      try { sessionName = safeText((await buildTemplateVariables(null, sessionId, scope)).session_name, scope); } catch { /* Generic push remains useful. */ }
      const type = status === "complete" ? "goal_complete" : status === "budgetLimited" ? "goal_budget" : "goal_blocked";
      const tag = `goal-${sessionId}`;
      await fanoutPush({ title: safeText(title, scope), body: safeText(body, scope),
        phoneBody: phoneBodyOf(safeText(title, scope), safeText(body, scope)) || safeText(title, scope), tag,
        data: { url: deepLink(sessionId), sessionId, sessionName, type } });
      const settings = await readSettingsFromDisk();
      sendToChannels({ kind: type, title: safeText(title, scope), body: safeText(body, scope), tag, sessionId, directory: directory ?? scope?.cwd, sessionName }, settings);
    },
    async notifyAutoReviewEnded({ sessionId, directory, status, error }) {
      const settings = await readSettingsFromDisk();
      if (settings.notifyOnCompletion === false) return;
      if (settings.notificationMode !== "always" && getIsWindowFocused?.()) return;
      const texts = notificationTexts(settings.locale);
      const { title, body } = {
        clean: { title: texts.reviewCleanTitle, body: texts.reviewCleanBody },
        disputed: { title: texts.reviewDisputedTitle, body: texts.reviewDisputedBody },
        limit: { title: texts.reviewLimitTitle, body: texts.reviewLimitBody },
        failed: { title: texts.reviewFailedTitle, body: truncateNotificationText(error ?? "", 240) },
      }[status] ?? {};
      if (!title) return;
      const tag = `review-${sessionId}`;
      if (settings.nativeNotificationsEnabled) {
        const payload = { title, body, tag, kind: "review", sessionId, directory, requireHidden: settings.notificationMode !== "always" };
        const desktopNotificationDelivered = emitDesktopNotification(payload);
        broadcastUiNotification(payload, { desktopNotificationDelivered });
      }
      const scope = await resolveSessionScope(sessionId).catch(() => ({ cwd: directory }));
      let sessionName = "";
      try { sessionName = safeText((await buildTemplateVariables(null, sessionId, scope)).session_name, scope); } catch {}
      await fanoutPush({ title, body, phoneBody: phoneBodyOf(title, body) || title, tag, data: { url: deepLink(sessionId), sessionId, sessionName, type: "review" } });
      sendToChannels({ kind: "review", title, body, tag, sessionId, directory: directory ?? scope?.cwd, sessionName }, settings);
    },
    notifyPullRequest,
    invalidateSession(sessionId) { clearPending(sessionId); goalNotified.delete(sessionId); },
    stop() { stopped = true; clearTimeout(shareAnswerBatch?.timer); shareAnswerBatch = null; shareClaims.clear(); for (const entry of pending.values()) clearTimeout(entry.timer); pending.clear(); },
  };
};
