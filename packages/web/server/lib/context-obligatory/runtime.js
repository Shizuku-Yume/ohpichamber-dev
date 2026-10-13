import { isRecord } from '../shared/guards.js';
const MESSAGE_FETCH_LIMIT = 100;

const readContextState = (session) => {
  const metadata = isRecord(session?.metadata) ? session.metadata : {};
  const openchamber = isRecord(metadata.openchamber) ? metadata.openchamber : {};
  const messages = Array.isArray(openchamber.context_obligatory_messages)
    ? openchamber.context_obligatory_messages.filter((item) =>
      isRecord(item)
      && typeof item.id === 'string'
      && typeof item.createdAt === 'number'
      && (item.role === 'user' || item.role === 'assistant'))
    : [];
  return { metadata, openchamber, messages };
};

const buildContextPrompt = (entries) => {
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

/**
 * Re-injects the messages the user pinned as obligatory after a compaction.
 *
 * Both the pinned list and the cursor live in OpenChamber's own session
 * metadata store — v2 accepts session metadata only at create time.
 * `readSessionMetadata` reads it and `persistContextCursor` records how far we
 * got; without both seams the runtime stays inert.
 */
export const createContextObligatoryRuntime = ({
  sessionService,
  resolveSessionScope,
  sessionKnowledgeRuntime = null,
  persistContextCursor = null,
  readSessionMetadata = null,
}) => {
  if (!sessionService || typeof sessionService.open !== 'function' || typeof sessionService.history !== 'function' || typeof sessionService.send !== 'function') {
    throw new Error('context-obligatory requires the canonical session service');
  }
  if (typeof resolveSessionScope !== 'function') throw new Error('context-obligatory requires a session scope resolver');
  const inflight = new Set();
  let stopped = false;

  const readHistory = async (sessionId, signal) => {
    const messages = [];
    let cursor;
    for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
      signal?.throwIfAborted();
      const query = new URLSearchParams({ limit: String(MESSAGE_FETCH_LIMIT), ...(cursor ? { cursor } : {}) });
      const page = await sessionService.history(sessionId, query.toString());
      messages.push(...(Array.isArray(page?.messages) ? page.messages : []));
      if (!page?.nextCursor) break;
      cursor = page.nextCursor;
    }
    return messages;
  };

  const textOf = (message) => (Array.isArray(message?.parts) ? message.parts : [])
    .filter((part) => part?.type === 'text' && typeof part.content === 'string')
    .map((part) => part.content.trim()).filter(Boolean).join('\n\n');

  const tick = async (sessionId, compactionId) => {
    const scope = await resolveSessionScope(sessionId);
    if (!scope) return;
    const snapshot = await sessionService.open(sessionId);
    if (snapshot?.session && snapshot.session.rootSessionId !== snapshot.session.sessionId) return;
    const stored = { metadata: await readSessionMetadata(sessionId) };
    const state = readContextState(stored);
    const knowledge = sessionKnowledgeRuntime
      ? await sessionKnowledgeRuntime.resolvePending(scope.cwd, '', sessionKnowledgeRuntime.readPins(stored)).catch(() => ({ text: '', signature: '' }))
      : { text: '', signature: '' };
    if (state.messages.length === 0 && !knowledge.text) return;
    if (state.openchamber.context_obligatory_last_compaction_id === compactionId) return;
    const messages = await readHistory(sessionId);
    const entries = state.messages.map((pinned) => {
      const message = messages.find((candidate) => candidate.messageId === pinned.id);
      return message ? { pinned, text: textOf(message) } : null;
    }).filter((entry) => entry?.text).sort((left, right) => left.pinned.createdAt - right.pinned.createdAt);
    if (entries.length === 0 && !knowledge.text) return;
    const text = [knowledge.text, entries.length > 0 ? buildContextPrompt(entries) : ''].filter(Boolean).join('\n\n---\n\n');
    const latestAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
    if (!latestAssistant?.providerId || !latestAssistant.modelId) return;
    await sessionService.send(sessionId, {
      input: { text: '', attachments: [], context: [{ kind: 'synthetic', text }] },
      options: { providerId: latestAssistant.providerId, modelId: latestAssistant.modelId, agentId: null, variant: null, reasoningEffort: null },
    });
    const patch = { context_obligatory_last_compaction_id: compactionId };
    if (knowledge.signature) patch[sessionKnowledgeRuntime.metadataKey] = knowledge.signature;
    await persistContextCursor(sessionId, scope.cwd, { openchamber: patch });
  };

  const processCanonicalEvent = (event, scope) => {
    if (stopped || typeof persistContextCursor !== 'function' || typeof readSessionMetadata !== 'function') return;
    if (event?.type !== 'session.compacted' || typeof event.sessionId !== 'string' || inflight.has(event.sessionId)) return;
    if (scope?.sessionId && scope.sessionId !== event.sessionId) return;
    inflight.add(event.sessionId);
    return tick(event.sessionId, event.compactionId)
      .catch((error) => console.warn('[context-obligatory] injection failed:', error?.message || error))
      .finally(() => inflight.delete(event.sessionId));
  };

  const stop = () => { stopped = true; };
  return { processCanonicalEvent, stop };
};
