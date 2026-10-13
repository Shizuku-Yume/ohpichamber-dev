import path from 'node:path';
import { HistoryPageSchema, SessionMetadataSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';

const BODY_MAX_CHARS = 1000;
const textFromParts = (parts, maxLength = BODY_MAX_CHARS) => {
  const text = (parts ?? []).filter((part) => part.type === 'text').map((part) => part.content).filter(Boolean).join('\n').trim();
  return maxLength > 0 ? text.slice(0, maxLength) : text;
};

export const createNotificationTemplateRuntime = ({
  sessionService, resolveSessionScope, readSessionMetadata, readSettingsFromDisk, resolveGitBinaryForSpawn,
}) => {
  if (typeof sessionService?.open !== 'function' || typeof sessionService?.history !== 'function'
    || typeof resolveSessionScope !== 'function' || typeof readSessionMetadata !== 'function') {
    throw new TypeError('Canonical session reader and Host scope/metadata readers are required');
  }
  const resolveNotificationTemplate = (template, variables) => typeof template === 'string'
    ? template.replace(/\{(\w+)\}/g, (_match, key) => String(variables[key] ?? '')) : '';
  const shouldApplyResolvedTemplateMessage = (template, resolved, variables) => Boolean(resolved)
    && (!template?.includes('{last_message}') || Boolean(variables?.last_message?.trim()));
  const extractLastMessageText = (message, maxLength = BODY_MAX_CHARS) => textFromParts(message?.parts, maxLength);

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
    // The Host custom title is read at use time. A failed read never substitutes
    // another owner's title or clears the existing authoritative metadata.
    const metadata = SessionMetadataSchema.nullable().parse(await readSessionMetadata(sessionId));
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    if (snapshot.session.sessionId !== sessionId || snapshot.session.workspaceId !== resolved.workspaceId
      || snapshot.session.rootSessionId !== resolved.rootSessionId) throw new Error('Canonical snapshot scope mismatch');
    const settings = await readSettingsFromDisk();
    const project = settings.projects?.find((entry) => entry.id === resolved.projectId);
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
      session_name: metadata?.title ?? 'Session',
      agent_name: 'Agent',
      model_name: 'Assistant',
      last_message: '',
      session_id: sessionId,
    };
  };
  return { resolveNotificationTemplate, shouldApplyResolvedTemplateMessage, extractLastMessageText, fetchLastAssistantMessageText, buildTemplateVariables };
};
