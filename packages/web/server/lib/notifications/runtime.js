import { createHash } from 'node:crypto';
<<<<<<< HEAD
import { CanonicalEventSchema, SessionSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import { isEnterpriseMode } from '../enterprise-mode.js';
import { redactGitText } from '../git/redaction.js';
=======
import { unwrapOpenCodeResponse } from '../opencode/response-envelope.js';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import { isEnterpriseMode } from '../enterprise-mode.js';
>>>>>>> bc50ba56a
import { genericNotificationTitle, truncateNotificationText } from './message.js';
import { pullRequestNotificationTitle } from './pull-request-locales.js';
import {
  defaultNotificationTemplates,
  notificationTexts,
  renderNotificationText,
  withTemplateDefaults,
} from './template-locales.js';

const TITLES = {
  ready: 'Agent response is ready', error: 'Agent hit an error', question: 'Agent needs your input', permission: 'Agent needs permission',
  goal_complete: 'Goal complete', goal_budget: 'Goal reached its token budget',
};

export const createNotificationTriggerRuntime = (deps) => {
  const {
<<<<<<< HEAD
    sessionService, resolveSessionScope, readSettingsFromDisk,
    prepareNotificationLastMessage, buildTemplateVariables, fetchLastAssistantMessageText,
    resolveNotificationTemplate, shouldApplyResolvedTemplateMessage,
    emitDesktopNotification, broadcastUiNotification, sendPushToAllUiSessions, sendApnsToAllUiSessions,
    isAnyInteractiveClientVisible, now = Date.now, deliverToExtensionChannels = null,
=======
    readSettingsFromDisk,
    prepareNotificationLastMessage,
    buildTemplateVariables,
    extractLastMessageText,
    fetchLastAssistantMessageText,
    resolveNotificationTemplate,
    shouldApplyResolvedTemplateMessage,
    emitDesktopNotification,
    broadcastUiNotification,
    sendPushToAllUiSessions,
    sendApnsToAllUiSessions,
    isAnyInteractiveClientVisible,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    // OpenChamber's own session metadata (the goal lives there, not on the
    // OpenCode record). Optional: without it no goal can suppress a push.
    readSessionMetadata = null,
    // `(spaceId) => fetch` for a session of an isolated space, whose record and messages only
    // the OpenCode inside that space has; null while the feature is off.
    spaceFetchFor = () => null,
    // `(sessionId, turnEndedAt)`: whether that turn was a step of an
    // auto-review loop; the loop's end notifies once (`notifyAutoReviewEnded`).
    isInAutoReview = () => false,
    // `({ notification, requireHidden })`: extension notification channels
    // (`extension-channels.js`), called where push is, with the text push gets.
    deliverToExtensionChannels = null,
>>>>>>> bc50ba56a
  } = deps;
  if (typeof sessionService?.open !== 'function' || typeof sessionService?.list !== 'function' || typeof resolveSessionScope !== 'function') {
    throw new TypeError('Canonical session reader and Host scope resolver are required');
  }
  let getIsWindowFocused = deps.getIsWindowFocused;
  let getIsSessionAutoAccepting = deps.getIsSessionAutoAccepting;
<<<<<<< HEAD
  let stopped = false;
  const autoAcceptingSessions = new Set();
=======
  // Where a session is read: the host's OpenCode for its own sessions, the OpenCode inside the
  // space for a session of a space. The host's OpenCode does not know a space's session, so it
  // is never asked about one; a space that cannot be asked answers nothing.
  const hostSource = { buildOpenCodeUrl, getOpenCodeAuthHeaders, fetchImpl: (...args) => fetch(...args) };
  const unreachableSpaceFetch = async () => { throw new Error('isolated spaces are off'); };
  const sourceFor = (spaceId) => (spaceId
    ? {
        buildOpenCodeUrl: (fetchPath) => `http://space${fetchPath}`,
        getOpenCodeAuthHeaders: () => ({}),
        fetchImpl: spaceFetchFor(spaceId) ?? unreachableSpaceFetch,
        isSpace: true,
      }
    : hostSource);
  const hostActivityProbe = createSessionActivityProbe({ ...hostSource, timeoutMs: 2000 });

  // A parent goes idle while a background subagent still works; OpenCode then
  // hands the result back and the parent runs again. That first idle is a
  // pause, so it announces nothing. OpenCode 2.2.6+ also lists background
  // subagents deeper in the tree and background images; shell commands do not
  // hold the announcement, since a dev server never ends. Running direct
  // children are asked for in any case: OpenChamber's own child sessions
  // (workflow agents) are no OpenCode jobs, and a space reaches only session
  // routes. When the check cannot be made, the idle is announced as before: a
  // missed "ready" is worse than an early one.
  const isPausedForSubagents = async (sessionId, spaceId) => {
    const activityProbe = spaceId ? createSessionActivityProbe({ ...sourceFor(spaceId), timeoutMs: 2000 }) : hostActivityProbe;
    const backgroundJobs = await activityProbe.fetchRunningBackgroundJobs(sessionId);
    if (backgroundJobs?.some((job) => job.kind !== 'shell')) return true;
    const statuses = await activityProbe.fetchActiveSessionStatuses();
    if (!statuses) return false;
    return (await activityProbe.hasWorkingChildren(sessionId, statuses)) === true;
  };
  const setGetIsSessionAutoAccepting = (resolver) => {
    getIsSessionAutoAccepting = typeof resolver === 'function' ? resolver : undefined;
  };

  // App-icon badge for native push: the set of DISTINCT collapse-ids (the push
  // `tag`, e.g. `ready-<sessionId>` / `permission-<requestKey>`) we've sent since
  // the app was last foregrounded. The badge is the absolute APNs `aps.badge`.
  //
  // We key by `tag`, not sessionId, because the tag IS the banner identity: iOS
  // uses it as `apns-collapse-id`, so same-tag pushes REPLACE one banner while
  // different tags are distinct banners. One session can raise several banners
  // (ready + question + permission are different tags), so counting sessionIds
  // both over- and under-counts the lock-screen stack; counting tags mirrors it.
  //
  // We deliberately do NOT derive this from the in-app unread marks (OpenCode's
  // `time.viewed`): a backgrounded client can still be on the session, and the
  // mark changes on a separate event that races the push trigger. The
  // set is cleared when a UI client reports visible (`clearPendingPushBadge`),
  // the same moment the device zeroes its icon badge on becomeActive.
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
=======

  // Generic notification for native push (per the mobile design): a fixed, scenario-based
  // title + the session name as the body. No model/project/message content crosses the relay
  // in the clear; a phone with a push key gets what happened sealed (`sealed` below).
  const genericTitleOf = (payload) => genericNotificationTitle(payload?.data?.type);

  const toApnsGenericPayload = (payload) => {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const knownSessionName = typeof data.sessionName === 'string' ? data.sessionName.trim() : '';
    const sessionName = knownSessionName || (data.type === 'pull-request' ? '' : 'Session');
    const phoneBody = payload?.phoneBody ?? '';
    return {
      title: genericTitleOf(payload),
      // A session name is derived from the conversation.
      body: isEnterpriseMode() ? '' : sessionName,
      // A phone with a push key opens this on the device; the relay and the
      // push service see only the title above. Enterprise mode keeps the
      // generic text even sealed: the push service is outside its boundary.
      sealed: phoneBody && !isEnterpriseMode()
        ? { title: knownSessionName || genericTitleOf(payload), body: phoneBody }
        : undefined,
      badge: trackPushAndCountBadge(typeof payload?.tag === 'string' ? payload.tag : undefined),
      tag: payload?.tag,
      // sessionId is forwarded so a tapped push can deep-link; it is an opaque id, not content.
      data: typeof data.sessionId === 'string' ? { sessionId: data.sessionId } : undefined,
    };
  };

>>>>>>> bc50ba56a
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

  const fanoutPush = async ({ phoneBody, ...payload }) => {
    const type = payload.data.type;
    const generic = TITLES[type] ?? 'Agent update';
    const enterprise = isEnterpriseMode();
    const web = enterprise ? { ...payload, title: generic, body: '', data: { url: payload.data.url, sessionId: payload.data.sessionId, type } } : payload;
    const visible = isAnyInteractiveClientVisible?.() === true;
    if (!visible) pendingPushTags.add(payload.tag);
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
        title: generic, body: enterprise ? '' : (knownSessionName || 'Session'), sealed, badge: pendingPushTags.size,
        tag: payload.tag, data: { sessionId: payload.data.sessionId },
      }, { requireNoSse: true })).catch(() => console.warn('Native push delivery failed')),
    ]);
  };
<<<<<<< HEAD
  const autoAccepts = async (sessionId, scope, approvalId) => {
    if (await getIsSessionAutoAccepting?.(sessionId, scope, approvalId)) return true;
=======

  /**
   * What an extension channel receives: the same text as web push, after the
   * user's templates, and in enterprise mode the same generic title with no
   * body, session name or directory, since the channel's server is outside
   * the boundary. Sent beside `fanoutPush`, after the same toggles and
   * suppressions; the channel module applies the visibility gate itself.
   */
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
      url: sessionId ? buildSessionDeepLinkUrl(sessionId) : null,
    };
    Promise.resolve(deliverToExtensionChannels({ notification, requireHidden: settings?.notificationMode !== 'always' })).catch((error) => {
      console.warn('[Notification] extension channel delivery failed:', error?.message ?? error);
    });
  };

  let getIsWindowFocused = typeof deps.getIsWindowFocused === 'function'
    ? deps.getIsWindowFocused
    : null;

  const setGetIsWindowFocused = (cb) => {
    getIsWindowFocused = typeof cb === 'function' ? cb : null;
  };

  const PUSH_READY_COOLDOWN_MS = 5000;
  const PUSH_QUESTION_DEBOUNCE_MS = 500;
  const PUSH_PERMISSION_DEBOUNCE_MS = 500;
  const pushQuestionDebounceTimers = new Map();
  const pushPermissionDebounceTimers = new Map();
  const notifiedPermissionRequests = new Set();
  const lastReadyNotificationAt = new Map();
  const lastErrorNotificationAt = new Map();

  const sessionParentIdCache = new Map();
  const SESSION_PARENT_CACHE_TTL_MS = 60 * 1000;

  // Sessions where the client has enabled Permission Auto-Accept. Mirrored
  // from the client-side permissionStore via POST /api/notifications/auto-accept
  // so the server can suppress permission notifications BEFORE dispatch (the
  // 500ms debounce race otherwise leaks notifications for auto-accepted
  // permissions when the replied round-trip is slower than the debounce).
  const autoAcceptingSessions = new Set();
  const setAutoAcceptSession = (sessionId, enabled) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) return;
    if (enabled) {
      autoAcceptingSessions.add(sessionId);
    } else {
      autoAcceptingSessions.delete(sessionId);
    }
  };

  const buildSessionDeepLinkUrl = (sessionId) => {
    if (!sessionId || typeof sessionId !== 'string') {
      return '/';
    }
    return `/?session=${encodeURIComponent(sessionId)}`;
  };

  const getSessionParentCacheKey = (sessionId, directory, spaceId) => `${spaceId || ''}\0${directory || ''}\0${sessionId}`;

  const getCachedSessionParentId = (sessionId, directory, spaceId) => {
    const cacheKey = getSessionParentCacheKey(sessionId, directory, spaceId);
    const entry = sessionParentIdCache.get(cacheKey);
    if (!entry) return undefined;
    if (Date.now() - entry.at > SESSION_PARENT_CACHE_TTL_MS) {
      sessionParentIdCache.delete(cacheKey);
      return undefined;
    }
    return entry.parentID;
  };

  const setCachedSessionParentId = (sessionId, directory, spaceId, parentID) => {
    sessionParentIdCache.set(getSessionParentCacheKey(sessionId, directory, spaceId), { parentID: parentID ?? null, at: Date.now() });
  };

  const getParentIdFromPayload = (payload) => {
    if (!payload || typeof payload !== 'object') return undefined;
    if (payload.type !== 'session.created' && payload.type !== 'session.updated') return undefined;
    const parentID = payload.properties?.info?.parentID;
    if (typeof parentID === 'string' && parentID.length > 0) return parentID;
    // Only the full record from `session.created` proves a session has no
    // parent. `session.updated` also carries partial records (usage, title)
    // without `parentID`, and reading those as "no parent" turned a subagent
    // into a main session, so its finish announced "ready" with subagent
    // notifications turned off.
    return payload.type === 'session.created' ? null : undefined;
  };

  // v2 splits one assistant turn over two events: `session.step.started`
  // names the agent and model, `session.step.ended` carries the finish. The
  // translator hands both over as `message.updated` on the same message id,
  // so the start is remembered here and folded into the finish, which is the
  // event the "ready" push is built from. Bounded: a session emits a handful
  // of steps and the map is per process.
  const ASSISTANT_STEP_CACHE_LIMIT = 500;
  const assistantStepMeta = new Map();
  // The reply a turn ended on: the idle event names only the session, so the
  // ready notification borrows this step's id for its agent, model and text.
  const lastAssistantStepBySession = new Map();
  const rememberAssistantStep = (info) => {
    if (!info || info.role !== 'assistant') return;
    const id = String(info.id ?? '');
    const agent = String(info.agent ?? info.mode ?? '');
    const modelID = String(info.modelID ?? '');
    if (!id || (!agent && !modelID)) return;
    assistantStepMeta.delete(id);
    assistantStepMeta.set(id, { agent, modelID });
    const sessionId = String(info.sessionID ?? '');
    if (sessionId) {
      lastAssistantStepBySession.delete(sessionId);
      lastAssistantStepBySession.set(sessionId, id);
      while (lastAssistantStepBySession.size > ASSISTANT_STEP_CACHE_LIMIT) {
        lastAssistantStepBySession.delete(lastAssistantStepBySession.keys().next().value);
      }
    }
    while (assistantStepMeta.size > ASSISTANT_STEP_CACHE_LIMIT) {
      assistantStepMeta.delete(assistantStepMeta.keys().next().value);
    }
  };
  const withRememberedStep = (info) => {
    const remembered = info ? assistantStepMeta.get(String(info.id ?? '')) : undefined;
    if (!remembered) return info;
    const merged = { ...info };
    if (!merged.agent && !merged.mode) {
      merged.agent = remembered.agent;
      merged.mode = remembered.agent;
    }
    if (!merged.modelID) merged.modelID = remembered.modelID;
    return merged;
  };

  const maybeCacheSessionParentFromPayload = (payload, spaceId) => {
    const sessionId = extractSessionIdFromPayload(payload);
    if (typeof sessionId !== 'string' || sessionId.length === 0) return;
    const directory = extractDirectoryFromPayload(payload);
    const parentID = getParentIdFromPayload(payload);
    if (parentID === undefined) return;
    setCachedSessionParentId(sessionId, directory, spaceId, parentID);
  };

  /** The session's own record, or null when it could not be read. */
  const fetchSessionRecord = async (sessionId, directory, spaceId) => {
    try {
      const source = sourceFor(spaceId);
      const base = source.buildOpenCodeUrl(`/api/session/${encodeURIComponent(sessionId)}`, '');
      // The space's own OpenCode finds its session by id; a directory names the host's instance.
      const url = directory && !spaceId ? `${base}?directory=${encodeURIComponent(directory)}` : base;
      const response = await source.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...source.getOpenCodeAuthHeaders(),
        },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return null;
      const session = unwrapOpenCodeResponse(await response.json().catch(() => null));
      return session && typeof session === 'object' ? session : null;
    } catch {
      return null;
    }
  };

  const fetchSessionParentId = async (sessionId, directory, spaceId = null) => {
    if (!sessionId) return undefined;

    const cached = getCachedSessionParentId(sessionId, directory, spaceId);
    if (cached !== undefined) return cached;

    const session = await fetchSessionRecord(sessionId, directory, spaceId);
    if (!session) return undefined;
    const parentID = typeof session.parentID === 'string' && session.parentID.length > 0
      ? session.parentID
      : null;
    setCachedSessionParentId(sessionId, directory, spaceId, parentID);
    return parentID;
  };

  // Mirrors client-side autoRespondsPermission: a session auto-accepts if it
  // OR any ancestor is flagged. Walks the parent chain via fetchSessionParentId.
  const isSessionAutoAccepting = async (sessionId, directory) => {
    if (!sessionId || autoAcceptingSessions.size === 0) return false;
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
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
=======

    return result
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  // A session with an ACTIVE goal suppresses per-turn ready notifications;
  // the session-goal runtime sends its own notification when the goal
  // settles. Fetch failures fall through to normal notification behavior.
  // A space's session keeps its metadata in its record inside the space.
  const hasActiveSessionGoal = async (sessionId, spaceId) => {
    if (!sessionId || (!spaceId && typeof readSessionMetadata !== 'function')) return false;
    try {
      const metadata = spaceId
        ? (await fetchSessionRecord(sessionId, undefined, spaceId))?.metadata
        : await readSessionMetadata(sessionId);
      const goal = metadata?.openchamber?.goal;
      return Boolean(goal && typeof goal === 'object' && goal.status === 'active');
    } catch {
      return false;
    }
  };

  /** `spaceId` marks an event of an isolated space: its session is read inside that space. */
  const maybeSendPushForTrigger = async (payload, { spaceId = null } = {}) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    maybeCacheSessionParentFromPayload(payload, spaceId);
    const source = sourceFor(spaceId);

    const sessionId = extractSessionIdFromPayload(payload);
    const notificationDirectory = extractDirectoryFromPayload(payload);
    // A user abort arrives as `session.idle` with `aborted: true`: the turn
    // did not finish, so there is nothing to announce as ready.
    if (payload.type === 'session.idle' && payload.properties?.aborted === true) {
      return;
    }

    if ((payload.type === 'session.idle' || payload.type === 'session.error') && sessionId) {
      // Taken before any wait: an auto-review may settle meanwhile, and its
      // last step is told apart from a later turn by this time.
      const turnEndedAt = Date.now();
      if (payload.type === 'session.idle' && await isPausedForSubagents(sessionId, spaceId)) {
        return;
      }
      const error = payload.properties?.error;
      const errorText = typeof error?.message === 'string'
        ? error.message
        : typeof error === 'string' ? error : '';
      await maybeSendPushForTrigger({
        ...payload,
        type: 'message.updated',
        properties: {
          ...payload.properties,
          // Only a turn end announces readiness; a step's `stop` does not.
          turnEnded: true,
          turnEndedAt,
          info: {
            id: lastAssistantStepBySession.get(sessionId),
            sessionID: sessionId,
            role: 'assistant',
            finish: payload.type === 'session.error' ? 'error' : 'stop',
            ...(errorText ? { parts: [{ type: 'text', text: errorText }] } : {}),
          },
        },
      }, { spaceId });
      return;
    }

    if (payload.type === 'message.updated') {
      rememberAssistantStep(payload.properties?.info);
      const info = withRememberedStep(payload.properties?.info);
      // v2 ends every step with a `message.updated`; the last one says `stop`,
      // but the execution can still drain steering input after it. Readiness
      // is announced from the execution's terminal `session.idle` instead.
      if (info?.role === 'assistant' && info?.finish === 'stop' && sessionId && payload.properties?.turnEnded === true) {
        payload = { ...payload, properties: { ...payload.properties, info } };
        const settings = await readSettingsFromDisk();

        if (settings.notifyOnSubtasks === false) {
          const parentIDFromPayload = getParentIdFromPayload(payload);
          const parentID = parentIDFromPayload
            ? parentIDFromPayload
            : await fetchSessionParentId(sessionId, notificationDirectory, spaceId);

          if (parentID !== null) {
            return;
          }
        }

        if (settings.notifyOnCompletion === false) {
          return;
        }

        // While a goal drives the session, per-turn "ready" notifications are
        // noise produced by the goal loop itself — the goal's own settle
        // notification (complete/blocked/budget) is the final word instead.
        if (await hasActiveSessionGoal(sessionId, spaceId)) {
          return;
        }

        // The same for an auto-review: each step ends a turn of one of its
        // two sessions. A space's run lives in the space, so its steps notify.
        if (!spaceId && isInAutoReview(sessionId, payload.properties?.turnEndedAt ?? Date.now())) {
          return;
        }

        if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) {
          return;
        }

        const now = Date.now();
        const lastAt = lastReadyNotificationAt.get(sessionId) ?? 0;
        if (now - lastAt < PUSH_READY_COOLDOWN_MS) {
          return;
        }
        lastReadyNotificationAt.set(sessionId, now);

        const texts = notificationTexts(settings.locale);
        let title = renderNotificationText(texts.readyTitle, {
          agent_name: formatMode(info?.mode),
        });
        let body = renderNotificationText(texts.readyMessage, {
          model_name: formatModelId(info?.modelID),
        });
        let sessionName = '';
        let reply = '';

        try {
          const templates = settings.notificationTemplates || {};
          const defaults = defaultNotificationTemplates(settings.locale);
          const isSubtask = await fetchSessionParentId(sessionId, notificationDirectory, spaceId);
          const usesSubtaskTemplate = Boolean(isSubtask) && settings.notifyOnSubtasks !== false;
          const completionTemplate = withTemplateDefaults(
            usesSubtaskTemplate ? (templates.subtask ?? templates.completion) : templates.completion,
            usesSubtaskTemplate ? defaults.subtask : defaults.completion,
          );

          const variables = await buildTemplateVariables(payload, sessionId, source);
          sessionName = typeof variables.session_name === 'string' ? variables.session_name : sessionName;

          const messageId = info?.id;
          let lastMessage = extractLastMessageText(payload);
          if (!lastMessage) {
            lastMessage = await fetchLastAssistantMessageText(sessionId, messageId, undefined, source);
          }

          variables.last_message = await prepareNotificationLastMessage({
            message: lastMessage,
            settings,
          });
          reply = variables.last_message;

          const resolvedTitle = resolveNotificationTemplate(completionTemplate.title, variables);
          const resolvedBody = resolveNotificationTemplate(completionTemplate.message, variables);
          if (resolvedTitle) title = resolvedTitle;
          if (shouldApplyResolvedTemplateMessage(completionTemplate.message, resolvedBody, variables)) body = resolvedBody;
        } catch (error) {
          console.warn('[Notification] Template resolution failed, using defaults:', error?.message || error);
        }

        if (settings.nativeNotificationsEnabled) {
          const notificationPayload = {
            title,
            body,
            tag: `ready-${sessionId}`,
            kind: 'ready',
            sessionId,
            directory: notificationDirectory,
            requireHidden: settings.notificationMode !== 'always',
          };
          const desktopNotificationDelivered = emitDesktopNotification(notificationPayload);
          broadcastUiNotification(notificationPayload, { desktopNotificationDelivered });
        }

        await fanoutPush(
          {
            title,
            body,
            phoneBody: phoneBodyOf('', reply),
            tag: `ready-${sessionId}`,
            data: {
              url: buildSessionDeepLinkUrl(sessionId),
              sessionId,
              sessionName,
              type: 'ready',
            },
          },
          { requireNoSse: true },
        );
        sendToChannels({ kind: 'ready', title, body, tag: `ready-${sessionId}`, sessionId, directory: notificationDirectory, sessionName }, settings);
      }

      if (info?.role === 'assistant' && info?.finish === 'error' && sessionId) {
        // Interrupted steps carry `aborted`; terminal execution failures still
        // notify through session.error, including exhausted auto-resume attempts.
        if (info?.error?.type === 'aborted') {
          return;
        }

        const settings = await readSettingsFromDisk();
        if (settings.notifyOnError === false) return;

        const now = Date.now();
        const lastAt = lastErrorNotificationAt.get(sessionId) ?? 0;
        if (now - lastAt < PUSH_READY_COOLDOWN_MS) return;
        lastErrorNotificationAt.set(sessionId, now);

        if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) {
          return;
        }

        const texts = notificationTexts(settings.locale);
        let title = texts.errorTitle;
        let body = texts.errorBody;
        let sessionName = '';
        let errorText = '';

        try {
          const variables = await buildTemplateVariables(payload, sessionId, source);
          sessionName = typeof variables.session_name === 'string' ? variables.session_name : sessionName;
          const errorMessageId = info?.id;
          let lastMessage = extractLastMessageText(payload);
          if (!lastMessage) {
            lastMessage = await fetchLastAssistantMessageText(sessionId, errorMessageId, undefined, source);
          }

          variables.last_message = await prepareNotificationLastMessage({
            message: lastMessage,
            settings,
          });
          errorText = variables.last_message;

          const errorTemplate = withTemplateDefaults(
            (settings.notificationTemplates || {}).error,
            defaultNotificationTemplates(settings.locale).error,
          );
          const resolvedTitle = resolveNotificationTemplate(errorTemplate.title, variables);
          const resolvedBody = resolveNotificationTemplate(errorTemplate.message, variables);
          if (resolvedTitle) title = resolvedTitle;
          if (shouldApplyResolvedTemplateMessage(errorTemplate.message, resolvedBody, variables)) body = resolvedBody;
        } catch (error) {
          console.warn('[Notification] Error template resolution failed, using defaults:', error?.message || error);
        }

        if (settings.nativeNotificationsEnabled) {
          const notificationPayload = {
            title,
            body,
            tag: `error-${sessionId}`,
            kind: 'error',
            sessionId,
            directory: notificationDirectory,
            requireHidden: settings.notificationMode !== 'always',
          };
          const desktopNotificationDelivered = emitDesktopNotification(notificationPayload);
          broadcastUiNotification(notificationPayload, { desktopNotificationDelivered });
        }

        await fanoutPush(
          {
            title,
            body,
            phoneBody: phoneBodyOf('Error', errorText),
            tag: `error-${sessionId}`,
            data: {
              url: buildSessionDeepLinkUrl(sessionId),
              sessionId,
              sessionName,
              type: 'error',
            },
          },
          { requireNoSse: true },
        );
        sendToChannels({ kind: 'error', title, body, tag: `error-${sessionId}`, sessionId, directory: notificationDirectory, sessionName }, settings);
      }

      return;
    }

    // A form, and a page an agent shows that waits for the user's answer
    // (render.page with awaitAnswer, announced by this server), both mean the
    // agent waits for the user, so they notify the same way.
    const ask = payload.type === 'form.created' ? readFormAsk(payload)
      : payload.type === 'openchamber:page-waiting' ? readPageAsk(payload)
        : null;
    if (ask && sessionId) {
      const existingTimer = pushQuestionDebounceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(async () => {
        pushQuestionDebounceTimers.delete(sessionId);

        const settings = await readSettingsFromDisk();
        if (settings.notifyOnQuestion === false) {
          return;
        }

        if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) {
          return;
        }

        const { header, questionText } = ask;
        // An MCP elicitation belongs to the whole directory: OpenCode files it
        // under the `global` sentinel, which no session record carries, so the
        // notification opens the app instead of a session that cannot load.
        const formSessionId = sessionId === LOCATION_SCOPED_FORM_SESSION_ID ? undefined : sessionId;

        const texts = notificationTexts(settings.locale);
        let title = /plan\s*mode/i.test(header)
          ? texts.planModeTitle
          : /build\s*agent/i.test(header)
            ? texts.buildModeTitle
            : header || texts.questionTitle;
        let body = questionText || texts.questionBody;
        let sessionName = '';

        try {
          const variables = await buildTemplateVariables(payload, formSessionId, source);
          sessionName = typeof variables.session_name === 'string' ? variables.session_name : sessionName;
          variables.last_message = questionText || header || '';

          const templates = settings.notificationTemplates || {};
          const questionTemplate = withTemplateDefaults(
            templates.question,
            defaultNotificationTemplates(settings.locale).question,
          );

          const resolvedTitle = resolveNotificationTemplate(questionTemplate.title, variables);
          const resolvedBody = resolveNotificationTemplate(questionTemplate.message, variables);
          if (resolvedTitle) title = resolvedTitle;
          if (shouldApplyResolvedTemplateMessage(questionTemplate.message, resolvedBody, variables)) body = resolvedBody;
        } catch (error) {
          console.warn('[Notification] Question template resolution failed, using defaults:', error?.message || error);
        }

        if (settings.nativeNotificationsEnabled) {
          const notificationPayload = {
            kind: 'question',
            title,
            body,
            tag: `question-${sessionId}`,
            sessionId: formSessionId,
            directory: notificationDirectory,
            requireHidden: settings.notificationMode !== 'always',
          };
          const desktopNotificationDelivered = emitDesktopNotification(notificationPayload);
          broadcastUiNotification(notificationPayload, { desktopNotificationDelivered });
        }

        void fanoutPush(
          {
            title,
            body,
            phoneBody: phoneBodyOf('Question', questionText || header),
            tag: `question-${sessionId}`,
            data: {
              url: buildSessionDeepLinkUrl(formSessionId),
              sessionId: formSessionId,
              sessionName,
              type: 'question',
            },
          },
          { requireNoSse: true },
        );
        sendToChannels({ kind: 'question', title, body, tag: `question-${sessionId}`, sessionId: formSessionId, directory: notificationDirectory, sessionName }, settings);
      }, PUSH_QUESTION_DEBOUNCE_MS);

      pushQuestionDebounceTimers.set(sessionId, timer);
      return;
    }

    if (payload.type === 'permission.replied' && sessionId) {
      const requestId = payload.properties?.requestID ?? payload.properties?.requestId ?? payload.properties?.id;
      const requestKey = typeof requestId === 'string' ? `${sessionId}:${requestId}` : null;
      const pendingNotification = pushPermissionDebounceTimers.get(sessionId);
      if (!pendingNotification) {
        return;
      }

      // Some runtimes may omit requestID on permission.replied.
      // When request ID is missing, clear session debounce to avoid
      // showing stale permission notifications for auto-approved prompts.
      if (!requestKey || !pendingNotification.requestKey || pendingNotification.requestKey === requestKey) {
        clearTimeout(pendingNotification.timer);
        pushPermissionDebounceTimers.delete(sessionId);
      }
      return;
    }

    if (payload.type === 'permission.asked' && sessionId) {
      const requestId = payload.properties?.id ?? payload.properties?.requestID ?? payload.properties?.requestId;
      // v2 describes a permission request as an action plus the resources it
      // touches; the v1 single `permission` string is gone.
      const permissionAction = typeof payload.properties?.action === 'string' ? payload.properties.action.trim() : '';
      const permissionResource = Array.isArray(payload.properties?.resources)
        ? String(payload.properties.resources[0] ?? '').trim()
        : '';
      const permissionMessage = typeof payload.properties?.message === 'string' ? payload.properties.message.trim() : '';
      const permission = permissionMessage
        || (permissionAction && permissionResource ? `${permissionAction}: ${permissionResource}` : permissionAction);
      const permissionPhoneBody = PERMISSION_PREFIX_BY_ACTION[permissionAction] && permissionResource
        ? phoneBodyOf(PERMISSION_PREFIX_BY_ACTION[permissionAction], permissionResource)
        : phoneBodyOf('Wants permission', permission);
      const requestKey = typeof requestId === 'string' ? `${sessionId}:${requestId}` : null;
      if (requestKey && notifiedPermissionRequests.has(requestKey)) {
        return;
      }

      // The session (or an ancestor) answers permissions by itself. Skip the
      // notification when this request was answered automatically; one the
      // safety net held for the user still notifies. The host's permission
      // policy knows nothing of a space's session, so it is not asked about one.
      const isAutoAnswered = async () => !spaceId && await (getIsSessionAutoAccepting?.(sessionId, notificationDirectory, requestId)
        ?? isSessionAutoAccepting(sessionId, notificationDirectory));
      if (await isAutoAnswered()) {
        if (requestKey) notifiedPermissionRequests.add(requestKey);
        return;
      }

      const existingTimer = pushPermissionDebounceTimers.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer.timer);
      }

      const timer = setTimeout(async () => {
        pushPermissionDebounceTimers.delete(sessionId);

        if (await isAutoAnswered()) {
          if (requestKey) notifiedPermissionRequests.add(requestKey);
          return;
        }

        const settings = await readSettingsFromDisk();

        if (settings.notifyOnQuestion === false) {
          return;
        }

        if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) {
          return;
        }

        const sessionTitle = payload.properties?.sessionTitle;
        const permissionText = typeof permission === 'string' && permission.length > 0 ? permission : '';
        const texts = notificationTexts(settings.locale);
        // What the agent wants to do decides the answer, so it comes before the session name.
        const fallbackMessage = permissionText
          || (typeof sessionTitle === 'string' && sessionTitle.trim().length > 0 ? sessionTitle.trim() : '')
          || texts.permissionBody;

        let title = texts.permissionTitle;
        let body = fallbackMessage;
        let sessionName = '';

        try {
          const variables = await buildTemplateVariables(payload, sessionId, source);
          sessionName = typeof variables.session_name === 'string' ? variables.session_name : sessionName;
          variables.last_message = fallbackMessage;

          const templates = settings.notificationTemplates || {};
          // Permissions reuse the question template (as they always have), but
          // an empty field falls back to the permission wording, not to "input".
          const questionDefaults = defaultNotificationTemplates(settings.locale).question;
          const questionTemplate = withTemplateDefaults(
            templates.question,
            { ...questionDefaults, title: texts.permissionTitle },
          );

          const resolvedTitle = resolveNotificationTemplate(questionTemplate.title, variables);
          const resolvedBody = resolveNotificationTemplate(questionTemplate.message, variables);
          if (resolvedTitle) title = resolvedTitle;
          if (shouldApplyResolvedTemplateMessage(questionTemplate.message, resolvedBody, variables)) body = resolvedBody;
        } catch (error) {
          console.warn('[Notification] Permission template resolution failed, using defaults:', error?.message || error);
        }

        if (settings.nativeNotificationsEnabled) {
          const notificationPayload = {
            kind: 'permission',
            title,
            body,
            tag: requestKey ? `permission-${requestKey}` : `permission-${sessionId}`,
            sessionId,
            directory: notificationDirectory,
            requireHidden: settings.notificationMode !== 'always',
          };
          const desktopNotificationDelivered = emitDesktopNotification(notificationPayload);
          broadcastUiNotification(notificationPayload, { desktopNotificationDelivered });
        }

        if (requestKey) {
          notifiedPermissionRequests.add(requestKey);
        }

        void fanoutPush(
          {
            title,
            body,
            phoneBody: permissionPhoneBody,
            tag: `permission-${sessionId}`,
            data: {
              url: buildSessionDeepLinkUrl(sessionId),
              sessionId,
              sessionName,
              type: 'permission',
            },
          },
          { requireNoSse: true },
        );
        sendToChannels({ kind: 'permission', title, body, tag: `permission-${sessionId}`, sessionId, directory: notificationDirectory, sessionName }, settings);
      }, PUSH_PERMISSION_DEBOUNCE_MS);

      pushPermissionDebounceTimers.set(sessionId, { timer, requestKey });
    }
  };

  // Goal and review settle push: same fanout as the trigger paths (web-push
  // with the full text; APNs with the generic per-type title and the session
  // name as body, so the relay never sees content).
  const sendSettlePush = async ({ sessionId, directory, type, tag, title, body }) => {
>>>>>>> bc50ba56a
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
<<<<<<< HEAD
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
=======
    await fanoutPush(
      {
        title,
        body,
        phoneBody: phoneBodyOf(title, body) || title,
        tag,
        data: {
          url: buildSessionDeepLinkUrl(sessionId),
          sessionId,
          sessionName,
          type,
        },
      },
      { requireNoSse: true },
    );
    if (typeof deliverToExtensionChannels === 'function') {
      sendToChannels({ kind: type, title, body, tag, sessionId, directory, sessionName }, await readSettingsFromDisk());
    }
  };

  const sendGoalSettlePush = ({ sessionId, directory, status, title, body }) => sendSettlePush({
    sessionId,
    directory,
    type: status === 'complete' ? 'goal_complete' : (status === 'budgetLimited' ? 'goal_budget' : 'goal_blocked'),
    tag: `goal-${sessionId}`,
    title,
    body,
  });

  /**
   * One notification when an auto-review ends on its own, for the reviewed
   * session: its steps notified nothing. It obeys the completion toggle, as
   * the "ready" notifications it replaces do. A stop by the user (the row's
   * Stop, an aborted turn) announces nothing: the user was there.
   */
  const notifyAutoReviewEnded = async ({ sessionId, directory, status, error }) => {
    const settings = await readSettingsFromDisk();
    if (settings.notifyOnCompletion === false) return;
    if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
    const texts = notificationTexts(settings.locale);
    const { title, body } = {
      clean: { title: texts.reviewCleanTitle, body: texts.reviewCleanBody },
      disputed: { title: texts.reviewDisputedTitle, body: texts.reviewDisputedBody },
      limit: { title: texts.reviewLimitTitle, body: texts.reviewLimitBody },
      failed: { title: texts.reviewFailedTitle, body: truncateNotificationText(error ?? '', 240) },
    }[status] ?? {};
    if (!title) return;
    const tag = `review-${sessionId}`;
    if (settings.nativeNotificationsEnabled) {
      const payload = { title, body, tag, kind: 'review', sessionId, directory, requireHidden: settings.notificationMode !== 'always' };
      const desktopNotificationDelivered = emitDesktopNotification(payload);
      broadcastUiNotification(payload, { desktopNotificationDelivered });
    }
    await sendSettlePush({ sessionId, directory, type: 'review', tag, title, body });
>>>>>>> bc50ba56a
  };

  const notifyPullRequest = async ({ item, event }) => {
    const settings = await readSettingsFromDisk();
    if (settings.notifyOnPullRequests === false) return;
    if (settings.notificationMode !== 'always' && getIsWindowFocused?.()) return;
    const title = pullRequestNotificationTitle(settings.locale, event);
    if (!title) return;
    const body = `${item.owner}/${item.repo}#${item.number}`;
<<<<<<< HEAD
=======
    // The tag reaches every channel even when enterprise mode strips the body,
    // so it names the pull request only through a digest.
>>>>>>> bc50ba56a
    const tag = `pull-request-${createHash('sha256').update(`${item.instance}\n${body}`).digest('hex').slice(0, 16)}-${event}`;
    const payload = { title, body, tag, kind: 'pull-request', requireHidden: settings.notificationMode !== 'always' };
    if (settings.nativeNotificationsEnabled) {
      const desktopNotificationDelivered = emitDesktopNotification(payload);
      broadcastUiNotification(payload, { desktopNotificationDelivered });
    }
    await fanoutPush({ title, body, phoneBody: `${title}: ${body}`, tag, data: { url: '/', type: 'pull-request' } }, { requireNoSse: true });
    sendToChannels({ kind: 'pull-request', title, body, tag }, settings);
  };

  return {
<<<<<<< HEAD
    processCanonicalEvent,
    setAutoAcceptSession(sessionId, enabled) { if (enabled) autoAcceptingSessions.add(sessionId); else autoAcceptingSessions.delete(sessionId); },
    setGetIsWindowFocused(resolver) { getIsWindowFocused = resolver; },
    setGetIsSessionAutoAccepting(resolver) { getIsSessionAutoAccepting = resolver; },
    clearPendingPushBadge() { pendingPushTags.clear(); },
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
    stop() { stopped = true; for (const entry of pending.values()) clearTimeout(entry.timer); pending.clear(); },
=======
    maybeSendPushForTrigger,
    setAutoAcceptSession,
    setGetIsWindowFocused,
    setGetIsSessionAutoAccepting,
    clearPendingPushBadge,
    sendGoalSettlePush,
    notifyAutoReviewEnded,
    notifyPullRequest,
>>>>>>> bc50ba56a
  };
};
