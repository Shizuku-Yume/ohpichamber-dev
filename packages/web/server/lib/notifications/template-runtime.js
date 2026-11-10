import path from 'node:path';
import { HistoryPageSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';

const BODY_MAX_CHARS = 1000;
const textFromParts = (parts, maxLength = BODY_MAX_CHARS) => {
  const text = (parts ?? []).filter((part) => part.type === 'text').map((part) => part.content).filter(Boolean).join('\n').trim();
  return maxLength > 0 ? text.slice(0, maxLength) : text;
};

<<<<<<< HEAD
export const createNotificationTemplateRuntime = ({
  sessionService, resolveSessionScope, readSettingsFromDisk, resolveGitBinaryForSpawn,
}) => {
  if (typeof sessionService?.open !== 'function' || typeof sessionService?.history !== 'function'
    || typeof resolveSessionScope !== 'function') {
    throw new TypeError('Canonical session reader and Host scope reader are required');
  }
  const resolveNotificationTemplate = (template, variables) => typeof template === 'string'
    ? template.replace(/\{(\w+)\}/g, (_match, key) => String(variables[key] ?? '')) : '';
  const shouldApplyResolvedTemplateMessage = (template, resolved, variables) => Boolean(resolved)
    && (!template?.includes('{last_message}') || Boolean(variables?.last_message?.trim()));
  const extractLastMessageText = (message, maxLength = BODY_MAX_CHARS) => textFromParts(message?.parts, maxLength);
=======
export const createNotificationTemplateRuntime = (deps) => {
  const {
    readSettingsFromDisk,
    buildOpenCodeUrl,
    getOpenCodeAuthHeaders,
    resolveGitBinaryForSpawn,
    resolvePrimaryWorktreeRoot = async (directory) => ({ root: directory }),
    chatRoots = [],
  } = deps;

  const NOTIFICATION_BODY_MAX_CHARS = 1000;
  const GIT_TIMEOUT_MS = 3000;
  // The sidebar's name for standalone chats; a chat's folder name is a generated id.
  const CHATS_PROJECT_LABEL = 'Chats';

  // Where a session's record and messages are read: the host's OpenCode by default, the
  // OpenCode inside a space for a session of that space (`runtime.js` builds that source
  // and marks it `isSpace`).
  const hostSource = { buildOpenCodeUrl, getOpenCodeAuthHeaders, fetchImpl: (...args) => fetch(...args) };
  const isHostSource = (source) => !source?.isSpace;
  const SESSION_INFO_CACHE_TTL_MS = 60 * 1000;

  const cachedZenModels = { models: [] };

  const sessionTitleCache = new Map();
  const sessionInfoCache = new Map();

  const createTimeoutSignal = (timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    return {
      signal: controller.signal,
      cleanup: () => clearTimeout(timer),
    };
  };

  const formatProjectLabel = (label) => {
    if (!label || typeof label !== 'string') return '';
    // Folder names are shown exactly as they are on disk — no title-casing.
    return label.trim();
  };

  const resolveNotificationTemplate = (template, variables) => {
    if (!template || typeof template !== 'string') return '';
    return template.replace(/\{(\w+)\}/g, (_match, key) => {
      const value = variables[key];
      if (value === undefined || value === null) return '';
      return String(value);
    });
  };

  const shouldApplyResolvedTemplateMessage = (template, resolved, variables) => {
    if (!resolved) {
      return false;
    }

    if (typeof template !== 'string') {
      return true;
    }

    if (template.includes('{last_message}')) {
      return typeof variables?.last_message === 'string' && variables.last_message.trim().length > 0;
    }

    return true;
  };

  const fetchFreeZenModels = async () => [];

  const resolveZenModel = async (override) => {
    const overrideModel = typeof override === 'string' ? override.trim() : '';
    if (overrideModel) return overrideModel;
    const settings = await readSettingsFromDisk().catch(() => ({}));
    return typeof settings?.zenModel === 'string' && settings.zenModel.trim().length > 0
      ? settings.zenModel.trim()
      : '';
  };

  const validateZenModelAtStartup = async () => {};

  const summarizeText = async (text, targetLength, zenModel) => {
    if (!text || typeof text !== 'string' || text.trim().length === 0) return text;
    const result = await summarizeSharedText({
      text,
      threshold: 0,
      maxLength: targetLength,
        zenModel,
      mode: 'notification',
    });
    return typeof result?.summary === 'string' && result.summary.trim().length > 0
      ? result.summary
      : text;
  };

  const isNotificationTextPart = (part) => {
    if (!part || typeof part !== 'object') return false;
    if (part.type !== 'text') return false;
    return typeof part.text === 'string' || typeof part.content === 'string';
  };

  const extractTextFromParts = (parts, maxLength = NOTIFICATION_BODY_MAX_CHARS) => {
    if (!Array.isArray(parts) || parts.length === 0) return '';

    const textParts = parts
      .filter(isNotificationTextPart)
      .map((part) => part.text || part.content || '')
      .filter(Boolean);

    let text = textParts.length > 0 ? textParts.join('\n').trim() : '';

    if (maxLength > 0 && text.length > maxLength) {
      text = text.slice(0, maxLength);
    }

    return text;
  };

  const extractLastMessageText = (payload, maxLength = NOTIFICATION_BODY_MAX_CHARS) => {
    const info = payload?.properties?.info;
    if (!info) return '';

    const parts = info.parts || payload?.properties?.parts;
    const text = extractTextFromParts(parts, maxLength);
    if (text) return text;

    const content = info.content;
    if (Array.isArray(content)) {
      const textContent = content
        .filter(isNotificationTextPart)
        .map((entry) => entry.text || '')
        .filter(Boolean);
      if (textContent.length > 0) {
        let result = textContent.join('\n').trim();
        if (maxLength > 0 && result.length > maxLength) {
          result = result.slice(0, maxLength);
        }
        return result;
      }
    }
>>>>>>> bc50ba56a

  const fetchLastAssistantMessageText = async (sessionId, messageId, maxLength = BODY_MAX_CHARS) => {
    await resolveSessionScope(sessionId);
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    if (snapshot.session.sessionId !== sessionId) throw new Error('Canonical snapshot scope mismatch');
    const settled = new Set(snapshot.turns.filter((turn) => ['completed', 'failed', 'cancelled'].includes(turn.status)).map((turn) => turn.turnId));
    const target = messageId
      ? snapshot.messages.find((message) => message.messageId === messageId && message.role === 'assistant' && settled.has(message.turnId))
      : snapshot.messages.findLast((message) => message.role === 'assistant' && settled.has(message.turnId));
    if (target) return textFromParts(target.parts, maxLength);
    if (!messageId) return '';
    let cursor;
    do {
      const query = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
      const page = HistoryPageSchema.parse(await sessionService.history(sessionId, query.toString()));
      const turnStatus = new Map(page.turns.map((turn) => [turn.turnId, turn.status]));
      const message = page.messages.find((record) => record.messageId === messageId && record.role === 'assistant'
        && ['completed', 'failed', 'cancelled'].includes(turnStatus.get(record.turnId)));
      if (message) return textFromParts(message.parts, maxLength);
      cursor = page.nextCursor;
    } while (cursor);
    return '';
  };

  const buildTemplateVariables = async (event, sessionId, scope) => {
    const resolved = await resolveSessionScope(sessionId);
    if (!resolved?.cwd || (scope && (scope.workspaceId !== resolved.workspaceId || scope.rootSessionId !== resolved.rootSessionId))) {
      throw new Error('Host session scope is unavailable');
    }
<<<<<<< HEAD
    // OMP owns the session title; the canonical snapshot carries it.
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    if (snapshot.session.sessionId !== sessionId || snapshot.session.workspaceId !== resolved.workspaceId
      || snapshot.session.rootSessionId !== resolved.rootSessionId) throw new Error('Canonical snapshot scope mismatch');
    const settings = await readSettingsFromDisk();
    const project = settings.projects?.find((entry) => entry.id === resolved.projectId);
=======
  };

  const cacheSessionTitle = (sessionId, title) => {
    if (typeof sessionId === 'string' && sessionId.length > 0 && typeof title === 'string' && title.length > 0) {
      sessionTitleCache.set(sessionId, title);
    }
  };

  const getCachedSessionTitle = (sessionId) => {
    return sessionTitleCache.get(sessionId) ?? null;
  };

  // The caches hold the host's sessions only. A space's chat is read inside the space every
  // time: an id a space names is its claim, and must never become a host chat's title.
  const maybeCacheSessionInfoFromEvent = (payload, { spaceId = null } = {}) => {
    if (!payload || typeof payload !== 'object' || spaceId) return;
    const type = payload.type;
    if (type !== 'session.updated' && type !== 'session.created') return;
    const info = payload.properties?.info;
    if (!info || typeof info !== 'object') return;
    cacheSessionTitle(info.id, info.title);
  };

  const fetchSessionInfo = async (sessionId, source) => {
    if (!sessionId) return null;

    const isHost = isHostSource(source);
    const cached = isHost ? sessionInfoCache.get(sessionId) : undefined;
    if (cached && Date.now() - cached.at < SESSION_INFO_CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const url = source.buildOpenCodeUrl(`/api/session/${encodeURIComponent(sessionId)}`, '');
      const response = await source.fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          ...source.getOpenCodeAuthHeaders(),
        },
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) {
        console.warn(`[Notification] fetchSessionInfo: ${response.status} for session ${sessionId}`);
        return null;
      }
      const data = unwrapOpenCodeResponse(await response.json().catch(() => null));
      if (data && typeof data === 'object') {
        if (isHost) sessionInfoCache.set(sessionId, { data, at: Date.now() });
        return data;
      }
      return null;
    } catch (error) {
      console.warn(`[Notification] fetchSessionInfo failed for ${sessionId}:`, error?.message || error);
      return null;
    }
  };

  const resolvedChatRoots = chatRoots.filter(Boolean).map((root) => path.resolve(root));
  const isChatDirectory = (directory) => {
    const resolved = path.resolve(directory);
    return resolvedChatRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  };

  const withGitTimeout = (promise) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('git timeout')), GIT_TIMEOUT_MS)),
  ]);

  const folderName = (directory) => directory.replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';

  const findProjectByPath = (projects, directory) => {
    const normalized = directory.replace(/\/+$/, '');
    return projects.find((project) => typeof project?.path === 'string' && project.path.replace(/\/+$/, '') === normalized) ?? null;
  };

  // A session in a worktree is named after the project the sidebar files it under: a directory
  // registered as a project wins, else its repository's primary worktree is looked up.
  const resolveProjectNameForDirectory = async (projects, directory) => {
    if (isChatDirectory(directory)) return CHATS_PROJECT_LABEL;
    let project = findProjectByPath(projects, directory);
    if (!project) {
      const primaryRoot = await withGitTimeout(resolvePrimaryWorktreeRoot(directory)).then((result) => result.root, () => '');
      if (primaryRoot) project = findProjectByPath(projects, primaryRoot);
    }
    const label = typeof project?.label === 'string' ? project.label.trim() : '';
    return label || (project ? folderName(project.path) : folderName(directory));
  };

  const buildTemplateVariables = async (payload, sessionId, source = hostSource) => {
    const info = payload?.properties?.info || {};

    let sessionTitle = payload?.properties?.sessionTitle || payload?.properties?.session?.title || (typeof info.sessionTitle === 'string' ? info.sessionTitle : '') || '';

    const isHost = isHostSource(source);
    if (!sessionTitle && sessionId && isHost) {
      const cached = getCachedSessionTitle(sessionId);
      if (cached) {
        sessionTitle = cached;
      }
    }

    let sessionInfo = null;
    if (!sessionTitle && sessionId) {
      sessionInfo = await fetchSessionInfo(sessionId, source);
      if (sessionInfo && typeof sessionInfo.title === 'string') {
        sessionTitle = sessionInfo.title;
        if (isHost) cacheSessionTitle(sessionId, sessionTitle);
      }
    }

    const agentName = (() => {
      const mode = typeof info.agent === 'string' && info.agent.trim().length > 0
        ? info.agent.trim()
        : (typeof info.mode === 'string' ? info.mode.trim() : '');
      if (!mode) return 'Agent';
      return mode.split(/[-_\s]+/).filter(Boolean)
        .map((token) => token.charAt(0).toUpperCase() + token.slice(1)).join(' ');
    })();

    const modelName = (() => {
      const raw = typeof info.modelID === 'string' ? info.modelID.trim()
        : (typeof info.model?.modelID === 'string' ? info.model.modelID.trim() : '');
      if (!raw) return 'Assistant';
      return raw.split(/[-_]+/).filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
    })();

    let projectName = '';
>>>>>>> bc50ba56a
    let branch = '';
    try {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit({ baseDir: resolved.cwd, spawnOptions: { windowsHide: true }, binary: resolveGitBinaryForSpawn(), timeout: { block: 3000 } });
      branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    } catch { /* A workspace need not be a Git repository. */ }
    return {
      project_name: project?.label?.trim() || path.basename(resolved.cwd),
      // Templates are public notification content; never expose the private cwd.
      worktree: snapshot.session.displayPath,
      branch,
      session_name: snapshot.session.title ?? 'Session',
      agent_name: 'Agent',
      model_name: 'Assistant',
      last_message: '',
      session_id: sessionId,
    };
  };
  return { resolveNotificationTemplate, shouldApplyResolvedTemplateMessage, extractLastMessageText, fetchLastAssistantMessageText, buildTemplateVariables };
};
