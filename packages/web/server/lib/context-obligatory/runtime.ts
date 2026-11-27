import { z } from 'zod';
import type { CanonicalEvent, PromptRequest, Run } from '@openchamber/agent-contract';
import { controlErrorFields } from '../openchamber-control/error.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

const MESSAGE_FETCH_LIMIT = 100;

const PinnedMessageSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  role: z.enum(['user', 'assistant']),
});

type PinnedMessage = z.infer<typeof PinnedMessageSchema>;

const ContextMetadataSchema = z.object({
  openchamber: z.object({
    context_obligatory_messages: z.array(z.unknown()).optional(),
    context_obligatory_last_compaction_id: z.string().optional(),
  }).optional(),
});

export interface ContextSessionScope {
  sessionId: string;
  rootSessionId: string;
  projectId: string;
  workspaceId: string;
  cwd: string;
}

export interface ContextMessagePart {
  type: string;
  content?: string | undefined;
}

export interface ContextHistoryMessage {
  messageId: string;
  role: string;
  providerId?: string | null | undefined;
  modelId?: string | null | undefined;
  parts: ContextMessagePart[];
}

export interface ContextSessionService {
  open: (sessionId: string) => Promise<{ session?: { sessionId: string; rootSessionId: string } | null }>;
  history: (sessionId: string, query?: string) => Promise<{ messages?: ContextHistoryMessage[]; nextCursor?: string | null }>;
  send: (sessionId: string, request: PromptRequest) => Promise<{ run: Run } | { ok: boolean } | void>;
}

export interface ContextSessionKnowledgeRuntime {
  metadataKey: string;
  readPins: (session: { metadata?: JsonValue | null | undefined } | null | undefined) => { notes: string[]; plans: string[] };
  resolvePending: (
    directory: string,
    deliveredSignature: string,
    pins?: { notes: string[]; plans: string[] },
  ) => Promise<{ text: string; signature: string }>;
}

export interface ContextObligatoryDependencies {
  sessionService: ContextSessionService;
  resolveSessionScope: (sessionId: string) => Promise<ContextSessionScope | null>;
  sessionKnowledgeRuntime?: ContextSessionKnowledgeRuntime | null;
  persistContextCursor?: ((sessionId: string, directory: string, patch: { openchamber: JsonObject }) => Promise<JsonValue | void>) | null;
  readSessionMetadata?: ((sessionId: string) => Promise<JsonValue | null>) | null;
}

export interface ContextObligatoryRuntime {
  processCanonicalEvent: (event: CanonicalEvent, scope?: ContextSessionScope | null) => Promise<void> | undefined;
  stop: () => void;
}

const readContextState = (metadata: JsonValue | null | undefined) => {
  const parsed = ContextMetadataSchema.safeParse(metadata);
  const openchamber = parsed.success ? parsed.data.openchamber : undefined;
  const rawMessages = openchamber?.context_obligatory_messages ?? [];
  const messages: PinnedMessage[] = [];
  for (const item of rawMessages) {
    const entry = PinnedMessageSchema.safeParse(item);
    if (entry.success) messages.push(entry.data);
  }
  return {
    lastCompactionId: openchamber?.context_obligatory_last_compaction_id,
    messages,
  };
};

const buildContextPrompt = (entries: Array<{ pinned: PinnedMessage; text: string }>) => {
  const timeline = entries.map(({ pinned, text }) => {
    const timestamp = new Date(pinned.createdAt).toISOString();
    return `## ${pinned.role} — ${timestamp}\n\n${text}`;
  }).join('\n\n---\n\n');
  return [
    'The following messages are from the compacted conversation. The user explicitly marked them as important and required in your context. Pay close attention to them; they may have been sent by either the user or you before compaction.',
    'Use them while continuing the pre-compaction work. Do not treat this context restoration as a new standalone task.',
    'If any tasks or next steps remain, do not acknowledge, summarize, or mention this restored context in a separate response. Simply continue the work and use it silently as background context. Do not append a recap of it after completing those tasks. Only if no tasks or next steps remain, give the user a very brief summary of the important restored context in no more than one short paragraph, without lists or a detailed recap.',
    '',
    timeline,
  ].join('\n');
};

const isTextPart = (part: ContextMessagePart): part is { type: 'text'; content: string } =>
  part.type === 'text' && typeof part.content === 'string';

const textOf = (message: ContextHistoryMessage) => (Array.isArray(message.parts) ? message.parts : [])
  .filter(isTextPart)
  .map((part) => part.content.trim())
  .filter(Boolean)
  .join('\n\n');

export const createContextObligatoryRuntime = ({
  sessionService,
  resolveSessionScope,
  sessionKnowledgeRuntime = null,
  persistContextCursor = null,
  readSessionMetadata = null,
}: ContextObligatoryDependencies): ContextObligatoryRuntime => {
  const inflight = new Set<string>();
  let stopped = false;

  const readHistory = async (sessionId: string, signal?: AbortSignal): Promise<ContextHistoryMessage[]> => {
    const messages: ContextHistoryMessage[] = [];
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      signal?.throwIfAborted();
      const query = new URLSearchParams({ limit: String(MESSAGE_FETCH_LIMIT) });
      if (cursor) query.set('cursor', cursor);
      const page = await sessionService.history(sessionId, query.toString());
      messages.push(...(Array.isArray(page?.messages) ? page.messages : []));
      if (!page?.nextCursor) break;
      cursor = page.nextCursor;
    }
    return messages;
  };

  const tick = async (sessionId: string, compactionId: string): Promise<void> => {
    if (!persistContextCursor || !readSessionMetadata) return;
    const scope = await resolveSessionScope(sessionId);
    if (!scope) return;
    const snapshot = await sessionService.open(sessionId);
    if (snapshot?.session && snapshot.session.rootSessionId !== snapshot.session.sessionId) return;
    const metadata = await readSessionMetadata(sessionId);
    const state = readContextState(metadata);
    const knowledge = sessionKnowledgeRuntime
      ? await sessionKnowledgeRuntime.resolvePending(scope.cwd, '', sessionKnowledgeRuntime.readPins({ metadata })).catch(() => ({ text: '', signature: '' }))
      : { text: '', signature: '' };
    if (state.messages.length === 0 && !knowledge.text) return;
    if (state.lastCompactionId === compactionId) return;
    const messages = await readHistory(sessionId);
    const entries = state.messages
      .map((pinned) => {
        const message = messages.find((candidate) => candidate.messageId === pinned.id);
        return message ? { pinned, text: textOf(message) } : null;
      })
      .filter((entry): entry is { pinned: PinnedMessage; text: string } => Boolean(entry && entry.text))
      .sort((left, right) => left.pinned.createdAt - right.pinned.createdAt);
    if (entries.length === 0 && !knowledge.text) return;
    const text = [knowledge.text, entries.length > 0 ? buildContextPrompt(entries) : ''].filter(Boolean).join('\n\n---\n\n');
    const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!latestAssistant?.providerId || !latestAssistant.modelId) return;
    await sessionService.send(sessionId, {
      input: { text: '', attachments: [], context: [{ kind: 'synthetic', text }] },
      options: { providerId: latestAssistant.providerId, modelId: latestAssistant.modelId, agentId: null, variant: null, reasoningEffort: null },
    });
    const patch = knowledge.signature && sessionKnowledgeRuntime
      ? { context_obligatory_last_compaction_id: compactionId, [sessionKnowledgeRuntime.metadataKey]: knowledge.signature }
      : { context_obligatory_last_compaction_id: compactionId };
    await persistContextCursor(sessionId, scope.cwd, { openchamber: patch });
  };

  const processCanonicalEvent = (event: CanonicalEvent, scope?: ContextSessionScope | null): Promise<void> | undefined => {
    if (stopped || !persistContextCursor || !readSessionMetadata) return;
    if (event.type !== 'session.compacted' || !event.sessionId || inflight.has(event.sessionId)) return;
    if (scope?.sessionId && scope.sessionId !== event.sessionId) return;
    inflight.add(event.sessionId);
    return tick(event.sessionId, event.compactionId)
      .catch((error) => {
        const fields = controlErrorFields(error);
        console.warn('[context-obligatory] injection failed:', fields?.message || error);
      })
      .finally(() => inflight.delete(event.sessionId));
  };

  const stop = (): void => { stopped = true; };
  return { processCanonicalEvent, stop };
};
