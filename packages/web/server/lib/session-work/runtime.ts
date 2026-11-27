import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CanonicalEvent, HistoryPage, RuntimeSession } from '@openchamber/agent-contract';
import { z } from 'zod';
import { readMergedSettingsSync } from '../host/settings-files.js';
import { loadAssistContext, loadSettledTurns } from '../session-assist/context.js';
import { turnsToHistory, excerptHead, excerptHeadTail } from '../routing/history.js';
import type { ClassifierEndpoint } from '../routing/classifier.js';
import type { JevAnswers, JevRequest } from '../routing/jev.js';
import { isRecord, isString } from '../shared/guards.js';
import type { JsonValue } from '../shared/json-values.js';
import type { SessionLineage } from '../session-lineage.js';
import type { SessionMetadata } from '../openchamber-sessions/session-metadata-store.js';
import type { SessionActivityProbe } from './activity-probe.js';
import {
  buildSendRequest,
  buildTurnEndRequest,
  decideAssist,
  decideOpen,
  decideReviewReady,
  decideWrapUp,
} from './questions.js';
import type { AssistGateDecision } from './questions.js';
import { clearSuggestionPatch, offerReviewPatch, openByJevPatch, readWork, suggestDonePatch } from './state.js';

const OPENCHAMBER_SETTINGS_FILE = path.join(
  process.env.OPENCHAMBER_DATA_DIR
    ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
    : path.join(os.homedir(), '.config', 'ohpichamber'),
  'settings.json',
);

export interface SessionWorkSettings {
  enabled: boolean;
  autoOpen: boolean;
  reviewOffer: boolean;
}

const readSessionWorkSettings = (): SessionWorkSettings => {
  const settings = readMergedSettingsSync({ fs, path, settingsFilePath: OPENCHAMBER_SETTINGS_FILE });
  return {
    enabled: settings.sessionWorkEnabled !== false,
    autoOpen: settings.sessionWorkAutoOpen !== false,
    reviewOffer: settings.sessionReviewOfferEnabled === true,
  };
};

const REQUEST_CHARS = 1_500;
const ANSWER_EDGE_CHARS = 500;
const SEEN_MESSAGES_LIMIT = 500;
const BACKGROUND_SHELL_WAIT_MS = 30 * 60_000;

const LegacyUserEventFieldsSchema = z.object({
  parts: z.array(z.object({ type: z.string(), content: z.string().optional() })).optional(),
  createdAt: z.number().optional(),
});

export interface SessionWorkScope {
  sessionId: string;
  rootSessionId?: string;
  projectId?: string;
  workspaceId: string;
  cwd: string;
}

export interface SessionWorkSessionService {
  open: (sessionId: string) => Promise<{ session?: RuntimeSession | null } | null>;
  history: (sessionId: string, query?: string) => Promise<HistoryPage>;
}

export interface SessionWorkJevClient {
  ask: (request: JevRequest, endpoint: ClassifierEndpoint) => Promise<{ answers: JevAnswers; ms?: number }>;
}

export type SessionWorkMetadataDecider = (metadata: SessionMetadata, revision: string) => JsonValue | null;

export interface SessionWorkAssistSelection {
  recap?: boolean;
  suggestion?: boolean;
}

export interface SessionWorkDependencies {
  sessionService: SessionWorkSessionService;
  resolveSessionScope: (sessionId: string) => Promise<SessionWorkScope | null>;
  getSettings?: () => SessionWorkSettings;
  classifierEndpoint: (workspaceId: string) => Promise<ClassifierEndpoint | null> | ClassifierEndpoint | null;
  jev: SessionWorkJevClient;
  readMetadata: (sessionId: string, directory: string) => Promise<SessionMetadata | null>;
  updateMetadata: (
    sessionId: string,
    decide: SessionWorkMetadataDecider,
    options: { directory?: string },
  ) => Promise<{ metadata?: SessionMetadata; changed: boolean }>;
  isSessionArchived?: (sessionId: string) => Promise<boolean>;
  isWorktreePinned?: (directory: string) => Promise<boolean>;
  chatRoots?: string[];
  lineage?: SessionLineage | null;
  activityProbe?: Partial<SessionActivityProbe> | null;
  now?: () => number;
}

export interface SessionWorkRuntime {
  processCanonicalEvent: (event: CanonicalEvent, scope?: SessionWorkScope | null) => void;
  evaluateTurnEnd: (params: {
    sessionId: string;
    directory?: string;
    assist?: SessionWorkAssistSelection | null;
  }) => Promise<AssistGateDecision | null>;
  stop: () => void;
}

export function createSessionWorkRuntime({
  sessionService,
  resolveSessionScope,
  getSettings = readSessionWorkSettings,
  classifierEndpoint,
  jev,
  readMetadata,
  updateMetadata,
  isSessionArchived = async () => false,
  isWorktreePinned = async () => false,
  chatRoots = [],
  lineage = null,
  activityProbe = null,
  now = Date.now,
}: SessionWorkDependencies): SessionWorkRuntime {
  if (!sessionService) {
    throw new Error('session-work requires the canonical session service');
  }
  if (!resolveSessionScope) throw new Error('session-work requires a session scope resolver');
  const resolvedChatRoots = chatRoots.filter(Boolean).map((root) => path.resolve(root));
  const isChatDirectory = (directory: string): boolean => {
    if (!directory) return false;
    const resolved = path.resolve(directory);
    return resolvedChatRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
  };
  let stopped = false;
  const seenMessages = new Set<string>();
  const suggested = new Map<string, string>();
  const turnGenerations = new Map<string, number>();
  let lastTurnGeneration = 0;
  const turnGeneration = (sessionId: string): number => turnGenerations.get(sessionId) ?? 0;
  const advanceTurn = (sessionId: string): void => {
    lastTurnGeneration += 1;
    turnGenerations.delete(sessionId);
    turnGenerations.set(sessionId, lastTurnGeneration);
    while (turnGenerations.size > SEEN_MESSAGES_LIMIT) {
      const oldest = turnGenerations.keys().next().value;
      if (oldest === undefined) break;
      turnGenerations.delete(oldest);
    }
  };

  const historyQuery = (limit: number, cursor?: string): string => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set('cursor', cursor);
    return query.toString();
  };

  const readPages = (sessionId: string, signal?: AbortSignal) => async ({ limit, cursor }: { limit: number; cursor?: string }) => {
    signal?.throwIfAborted();
    const page = await sessionService.history(sessionId, historyQuery(limit, cursor));
    return {
      turns: page.turns,
      messages: page.messages.map((message) => ({
        messageId: message.messageId,
        turnId: message.turnId,
        role: message.role,
        createdAt: message.createdAt ?? null,
        providerId: message.providerId,
        modelId: message.modelId,
        parts: message.parts.map((part) => (
          part.type === 'text' ? { type: part.type, content: part.content } : { type: part.type }
        )),
      })),
      nextCursor: page.nextCursor,
    };
  };
  const readMessageText = async (sessionId: string, messageId: string, signal?: AbortSignal): Promise<string> => {
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 8; pageNumber += 1) {
      signal?.throwIfAborted();
      const page = await sessionService.history(sessionId, historyQuery(50, cursor));
      const message = page?.messages?.find((candidate) => candidate.messageId === messageId);
      if (message) {
        return message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.content)
          .join('\n\n');
      }
      const next = page?.nextCursor ?? null;
      if (!next || next === cursor) break;
      cursor = next;
    }
    return '';
  };

  const eligibleSession = async (sessionId: string, scope: SessionWorkScope): Promise<RuntimeSession | null> => {
    const snapshot = await sessionService.open(sessionId);
    const session = snapshot?.session;
    if (!session || session.sessionId !== sessionId || session.rootSessionId !== sessionId) return null;
    if (isChatDirectory(scope.cwd)) return null;
    if (await isWorktreePinned(scope.cwd)) return null;
    const metadata = await readMetadata(sessionId, scope.cwd);
    if (isRecord(metadata?.openchamber) && metadata.openchamber.kind === 'review') return null;
    if (await isSessionArchived(sessionId)) return null;
    lineage?.remember(session.sessionId, session.rootSessionId);
    return session;
  };

  const markSuggested = (sessionId: string, directory: string): void => {
    suggested.delete(sessionId);
    suggested.set(sessionId, directory);
    while (suggested.size > SEEN_MESSAGES_LIMIT) {
      const oldest = suggested.keys().next().value;
      if (oldest === undefined) break;
      suggested.delete(oldest);
    }
  };

  const onUserMessage = async ({ sessionId, messageId, text = '', createdAt }: {
    sessionId: string;
    messageId: string;
    text?: string;
    createdAt: number;
  }): Promise<void> => {
    const settings = getSettings();
    if (!settings.enabled || !settings.autoOpen) return;
    if (seenMessages.has(messageId)) return;
    const scope = await resolveSessionScope(sessionId);
    if (!scope) return;
    const requestText = text.trim() || (await readMessageText(sessionId, messageId));
    if (!requestText.trim()) return;
    seenMessages.add(messageId);
    while (seenMessages.size > SEEN_MESSAGES_LIMIT) {
      const oldest = seenMessages.values().next().value;
      if (oldest === undefined) break;
      seenMessages.delete(oldest);
    }
    const endpoint = await classifierEndpoint(scope.workspaceId);
    if (!endpoint) return;
    const session = await eligibleSession(sessionId, scope);
    if (!session) return;
    if (readWork(await readMetadata(sessionId, scope.cwd))?.state === 'open') return;
    const turns = await loadSettledTurns({ readPage: readPages(sessionId), signal: undefined });
    const { answers } = await jev.ask(
      buildSendRequest({ history: turnsToHistory(turns), request: excerptHead(requestText.trim(), REQUEST_CHARS) }),
      endpoint,
    );
    if (stopped || !decideOpen(answers)) return;
    await updateMetadata(sessionId, (metadata) => openByJevPatch(metadata, { requestAt: createdAt, now: now() }), { directory: scope.cwd });
  };

  const retireSuggestion = (sessionId: string): void => {
    const directory = suggested.get(sessionId);
    if (directory === undefined) return;
    suggested.delete(sessionId);
    void (async () => {
      try {
        await updateMetadata(sessionId, clearSuggestionPatch, { directory });
      } catch (error) {
        console.warn('[session-work] could not retire a hint:', error instanceof Error ? error.message : String(error));
      }
    })();
  };

  const processCanonicalEvent = (event: CanonicalEvent, scope?: SessionWorkScope | null): void => {
    if (stopped || !event || (scope?.sessionId && scope.sessionId !== event.sessionId)) return;
    const sessionId = event.sessionId;
    if (event.type === 'session.status' && event.runtimeStatus !== 'idle') {
      advanceTurn(sessionId);
      retireSuggestion(sessionId);
      return;
    }
    if (event.type !== 'message.created' || event.role !== 'user') return;
    if (lineage?.isChild(sessionId) === true) return;
    if (!seenMessages.has(event.messageId)) advanceTurn(sessionId);
    const legacy = LegacyUserEventFieldsSchema.safeParse(event);
    const parts = legacy.success ? legacy.data.parts ?? [] : [];
    const text = parts
      .filter((part) => part.type === 'text' && isString(part.content))
      .map((part) => part.content)
      .join('\n\n');
    const createdAt = (legacy.success ? legacy.data.createdAt : undefined) ?? event.timestamp ?? now();
    void (async () => {
      try {
        await onUserMessage({ sessionId, messageId: event.messageId, text, createdAt });
      } catch (error) {
        console.warn('[session-work] could not check a sent message:', error instanceof Error ? error.message : String(error));
      }
    })();
  };

  const waitsOnBackground = async (sessionId: string, turnStartedAt: number): Promise<boolean | null> => {
    if (!activityProbe) return null;
    const jobs = activityProbe.fetchRunningBackgroundJobs
      ? await activityProbe.fetchRunningBackgroundJobs(sessionId)
      : null;
    if (jobs?.some((job) => job.kind !== 'shell' || (job.startedAt >= turnStartedAt && now() - job.startedAt < BACKGROUND_SHELL_WAIT_MS))) return true;
    const statuses = activityProbe.fetchActiveSessionStatuses
      ? await activityProbe.fetchActiveSessionStatuses(sessionId)
      : null;
    const children = statuses && activityProbe.hasWorkingChildren
      ? await activityProbe.hasWorkingChildren(sessionId, statuses)
      : null;
    if (children === true) return true;
    return Array.isArray(jobs) && children === false ? false : null;
  };

  const evaluateTurnEnd = async ({ sessionId, assist }: {
    sessionId: string;
    directory?: string;
    assist?: SessionWorkAssistSelection | null;
  }): Promise<AssistGateDecision | null> => {
    if (stopped || lineage?.isChild(sessionId) === true) return null;
    const settings = getSettings();
    if (!settings.enabled && !settings.reviewOffer && !assist?.recap && !assist?.suggestion) return null;
    if (!turnGenerations.has(sessionId)) advanceTurn(sessionId);
    const generation = turnGeneration(sessionId);
    let background: boolean | null = null;
    try {
      const scope = await resolveSessionScope(sessionId);
      if (!scope) return null;
      const endpoint = await classifierEndpoint(scope.workspaceId);
      if (!endpoint) return null;
      const session = await eligibleSession(sessionId, scope);
      if (!session) return null;
      const work = settings.enabled ? readWork(await readMetadata(sessionId, scope.cwd)) : null;
      const ask = {
        open: settings.enabled && settings.autoOpen && work?.state !== 'open',
        wrapUp: settings.enabled && work?.state === 'open',
        reviewReady: settings.reviewOffer,
        recap: Boolean(assist?.recap),
        nextStep: Boolean(assist?.suggestion),
      };
      const context = await loadAssistContext({ readPage: readPages(sessionId), signal: new AbortController().signal });
      if (!context) return null;
      const turn = context.turns.at(-1);
      if (!turn || !turn.assistant) return null;
      background = ask.wrapUp || ask.nextStep ? await waitsOnBackground(sessionId, turn.user.created ?? 0) : null;
      const request = buildTurnEndRequest({
        history: turnsToHistory(context.turns.slice(0, -1)),
        request: excerptHead(turn.user.text, REQUEST_CHARS),
        answer: excerptHeadTail(turn.assistant.text, ANSWER_EDGE_CHARS, ANSWER_EDGE_CHARS),
        ask,
      });
      if (!request) return background === true && ask.nextStep ? { recap: true, suggestion: false } : null;
      const { answers } = await jev.ask(request, endpoint);
      if (stopped) return null;
      if (ask.open && decideOpen(answers)) {
        const requestAt = turn.user.created ?? now();
        await updateMetadata(sessionId, (metadata) => openByJevPatch(metadata, { requestAt, now: now() }), { directory: scope.cwd });
      }
      const suggest = ask.wrapUp && background !== true && decideWrapUp(answers)
        ? suggestDonePatch
        : ask.reviewReady && decideReviewReady(answers) ? offerReviewPatch : null;
      if (suggest) {
        const { changed } = await updateMetadata(
          sessionId,
          (metadata) => (turnGeneration(sessionId) === generation ? suggest(metadata, { now: now() }) : null),
          { directory: scope.cwd },
        );
        if (changed) markSuggested(sessionId, scope.cwd);
      }
      const gate = ask.recap || ask.nextStep ? decideAssist(answers) : null;
      return background === true ? { recap: gate?.recap ?? true, suggestion: false } : gate;
    } catch (error) {
      console.warn('[session-work] turn-end check failed:', error instanceof Error ? error.message : String(error));
      return background === true && assist?.suggestion ? { recap: true, suggestion: false } : null;
    }
  };

  const stop = (): void => {
    stopped = true;
    seenMessages.clear();
    suggested.clear();
    turnGenerations.clear();
  };

  return { processCanonicalEvent, evaluateTurnEnd, stop };
}
