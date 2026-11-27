import path from 'node:path';
import { HistoryPageSchema, SessionSnapshotSchema } from '@openchamber/agent-contract';
import type { CanonicalEvent, HistoryPage, SessionSnapshot } from '@openchamber/agent-contract';
import { isString } from './inputs.js';

const BODY_MAX_CHARS = 1000;

export interface TemplateScope {
  projectId?: string;
  workspaceId: string;
  rootSessionId: string;
  cwd: string;
}

export interface TemplateVariables {
  project_name: string;
  worktree: string;
  branch: string;
  session_name: string;
  agent_name: string;
  model_name: string;
  last_message: string;
  session_id: string;
}

export interface TemplateMessagePart {
  type: string;
  content?: string | undefined;
}

export interface TemplateMessageInput {
  parts?: readonly TemplateMessagePart[] | undefined;
}

export interface NotificationTemplateDependencies {
  sessionService: {
    open: (sessionId: string) => Promise<SessionSnapshot | { session: SessionSnapshot['session']; turns: SessionSnapshot['turns']; messages: SessionSnapshot['messages'] }>;
    history: (sessionId: string, query?: string) => Promise<HistoryPage>;
  };
  resolveSessionScope: (sessionId: string) => Promise<TemplateScope | null>;
  readSettingsFromDisk: () => Promise<{ projects?: Array<{ id?: string; label?: string }> }>;
  resolveGitBinaryForSpawn?: () => string;
}

const isCallable = (value: unknown): value is (...args: never[]) => void => typeof value === 'function';

const textFromParts = (parts: readonly TemplateMessagePart[] | undefined, maxLength = BODY_MAX_CHARS) => {
  const text = (parts ?? []).filter((part) => part.type === 'text').map((part) => part.content).filter(Boolean).join('\n').trim();
  return maxLength > 0 ? text.slice(0, maxLength) : text;
};

export const createNotificationTemplateRuntime = ({
  sessionService, resolveSessionScope, readSettingsFromDisk, resolveGitBinaryForSpawn,
}: NotificationTemplateDependencies) => {
  if (!isCallable(sessionService?.open) || !isCallable(sessionService?.history)
    || !isCallable(resolveSessionScope)) {
    throw new TypeError('Canonical session reader and Host scope reader are required');
  }
  const resolveNotificationTemplate = (template: string | undefined, variables: TemplateVariables) => {
    if (!isString(template)) return '';
    const values = new Map(Object.entries(variables));
    return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values.get(key) ?? ''));
  };
  const shouldApplyResolvedTemplateMessage = (template: string | undefined, resolved: string, variables: TemplateVariables | undefined) => Boolean(resolved)
    && (!template?.includes('{last_message}') || Boolean(variables?.last_message?.trim()));
  const extractLastMessageText = (message: TemplateMessageInput | null | undefined, maxLength = BODY_MAX_CHARS) => textFromParts(message?.parts, maxLength);

  const fetchLastAssistantMessageText = async (sessionId: string, messageId?: string, maxLength = BODY_MAX_CHARS) => {
    await resolveSessionScope(sessionId);
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    if (snapshot.session.sessionId !== sessionId) throw new Error('Canonical snapshot scope mismatch');
    const settled = new Set(snapshot.turns.filter((turn) => ['completed', 'failed', 'cancelled'].includes(turn.status)).map((turn) => turn.turnId));
    const target = messageId
      ? snapshot.messages.find((message) => message.messageId === messageId && message.role === 'assistant' && settled.has(message.turnId))
      : snapshot.messages.findLast((message) => message.role === 'assistant' && settled.has(message.turnId));
    if (target) return textFromParts(target.parts, maxLength);
    if (!messageId) return '';
    let cursor: string | null | undefined;
    do {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const page = HistoryPageSchema.parse(await sessionService.history(sessionId, params.toString()));
      const turnStatus = new Map(page.turns.map((turn) => [turn.turnId, turn.status]));
      const message = page.messages.find((record) => {
        const status = turnStatus.get(record.turnId);
        return record.messageId === messageId && record.role === 'assistant'
          && (status === 'completed' || status === 'failed' || status === 'cancelled');
      });
      if (message) return textFromParts(message.parts, maxLength);
      cursor = page.nextCursor;
    } while (cursor);
    return '';
  };

  const buildTemplateVariables = async (_event: CanonicalEvent | null, sessionId: string, scope?: Partial<TemplateScope> | null): Promise<TemplateVariables> => {
    const resolved = await resolveSessionScope(sessionId);
    if (!resolved?.cwd || (scope && scope.workspaceId && scope.rootSessionId && (scope.workspaceId !== resolved.workspaceId || scope.rootSessionId !== resolved.rootSessionId))) {
      throw new Error('Host session scope is unavailable');
    }
    const snapshot = SessionSnapshotSchema.parse(await sessionService.open(sessionId));
    if (snapshot.session.sessionId !== sessionId || snapshot.session.workspaceId !== resolved.workspaceId
      || snapshot.session.rootSessionId !== resolved.rootSessionId) throw new Error('Canonical snapshot scope mismatch');
    const settings = await readSettingsFromDisk();
    const project = settings.projects?.find((entry) => entry.id === resolved.projectId);
    let branch = '';
    try {
      const { simpleGit } = await import('simple-git');
      const git = simpleGit({ baseDir: resolved.cwd, spawnOptions: { windowsHide: true }, binary: resolveGitBinaryForSpawn?.() ?? 'git', timeout: { block: 3000 } });
      branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
    } catch { void 0; }
    return {
      project_name: project?.label?.trim() || path.basename(resolved.cwd),
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
