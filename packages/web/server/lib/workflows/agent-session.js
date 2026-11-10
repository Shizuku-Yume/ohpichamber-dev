import { z } from 'zod';

// The idle turn is polled: the Host has no push subscription this module may
// hold, and a workflow agent is one prompt, so a short poll is enough.
const POLL_MS = 1_000;
const HISTORY_LIMIT = 50;

const terminalTurn = (turn) => turn.status === 'completed' || turn.status === 'failed' || turn.status === 'cancelled';

const historyQuery = () => new URLSearchParams({ limit: String(HISTORY_LIMIT) }).toString();

/**
 * The text of an assistant message. Canonical messages carry typed parts; a
 * workflow answer is their text, in order.
 */
const messageText = (message) => (Array.isArray(message?.parts) ? message.parts : [])
  .filter((part) => part?.type === 'text' && typeof part.content === 'string')
  .map((part) => part.content)
  .join('')
  .trim();

const OUTCOME_STATES = { completed: 'completed', failed: 'error', cancelled: 'cancelled' };

/** The outcome of one terminal turn, in dispatch-results' shape. */
const outcomeOf = (page, turn) => {
  const message = page.messages.find((candidate) =>
    candidate.role === 'assistant' && turn.assistantMessageIds.includes(candidate.messageId));
  return {
    state: OUTCOME_STATES[turn.status],
    text: message ? messageText(message) : '',
    errorMessage: typeof turn.error === 'string' ? turn.error.trim() : '',
  };
};

/** `provider/model`, optionally with `#variant`, as the workflow script names it. */
const parseModelRef = (value) => {
  const [model, variant] = value.split('#');
  const slash = model.indexOf('/');
  if (slash <= 0 || slash === model.length - 1) return null;
  return { providerId: model.slice(0, slash), modelId: model.slice(slash + 1), variant: variant || null };
};

export class WorkflowAgentStopped extends Error {
  constructor() {
    super('The agent was stopped');
    this.name = 'WorkflowAgentStopped';
  }
}

/**
<<<<<<< HEAD
 * Workflow agents run as canonical Host sessions on the Agent Service. One
 * agent is one session and one prompt; a JSON answer that does not match its
 * schema gets a follow-up prompt in the same session.
 *
 * Unlike upstream's OpenCode child sessions these are root sessions: the
 * canonical create contract carries no parent link, and the Agent Service
 * writes `parentSessionId` only for sessions its own subagent tool opens.
 * The run record links every agent's session, and the report goes back into
 * the session that proposed the run.
=======
 * The mark on every workflow agent's session. A run can start a hundred
 * agents, so the sidebar leaves sessions with this kind out of its subagent
 * rows (`packages/ui/src/lib/sessionWorkflowMetadata.ts`); the run's card and
 * the Workflows panel list them instead.
 */
const WORKFLOW_AGENT_METADATA = Object.freeze({ openchamber: Object.freeze({ kind: 'workflow-agent' }) });

/**
 * Workflow agents are OpenCode child sessions of the session that started the
 * run, so the user can open any of them from the run's card. One agent is one
 * session and one turn; a JSON answer that does not match its schema gets a
 * follow-up prompt in the same session.
>>>>>>> bc50ba56a
 */
export const createWorkflowAgentSessions = ({
  sessionService,
  resolveWorkspace,
  pollMs = POLL_MS,
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
}) => {
  if (!sessionService || typeof sessionService.send !== 'function' || typeof sessionService.create !== 'function') {
    throw new Error('Workflow agents need the canonical session service');
  }

  const workspaceFor = async (directory) => {
    const scope = await resolveWorkspace(directory);
    if (!scope?.projectId || !scope?.workspaceId) throw new Error(`No workspace is registered for ${directory}`);
    return scope;
  };

  const optionsFor = (model, _agent) => {
    const ref = model ? parseModelRef(model) : null;
    if (model && !ref) throw new Error(`model must be provider/model or provider/model#variant, got ${model}`);
    return {
      providerId: ref?.providerId ?? null,
      modelId: ref?.modelId ?? null,
      agentId: null,
      variant: ref?.variant ?? null,
      reasoningEffort: null,
    };
  };

  /** The model the proposing session last answered on, so an agent inherits it. */
  const inheritedOptions = async (parentSessionId) => {
    if (!parentSessionId) return optionsFor(null, null);
    const page = await sessionService.history(parentSessionId, historyQuery()).catch(() => null);
    const last = [...(page?.messages ?? [])].reverse()
      .find((message) => message.role === 'assistant' && message.providerId && message.modelId);
    if (!last) return optionsFor(null, null);
    return { providerId: last.providerId, modelId: last.modelId, agentId: null, variant: null, reasoningEffort: null };
  };

  const promptRequest = (text, options) => ({
    input: { text, attachments: [], context: [] },
    options,
  });

  /** Resolves when the run's turn is over, or when the newest turn after `afterTurnId` is. */
  const waitForTurn = async ({ sessionId, runId, afterTurnId, signal }) => {
    for (;;) {
      if (signal.aborted) throw new WorkflowAgentStopped();
      const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
      if (page) {
        const turns = page.turns.filter(terminalTurn);
        const turn = runId
          ? turns.find((candidate) => candidate.runId === runId)
          : [...turns].reverse().find((candidate) => candidate.turnId !== afterTurnId);
        if (turn) return outcomeOf(page, turn);
      }
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        const wake = () => {
          clearTimeout(timer);
          signal.removeEventListener('abort', wake);
          resolve();
        };
        signal.addEventListener('abort', wake, { once: true });
        timer.unref?.();
      });
    }
  };

  /**
   * Interrupts a running agent session. Failure is reported, not thrown: the
   * run is being stopped either way.
   */
  const interrupt = async (directory, sessionId) => {
    try {
      const snapshot = await sessionService.open(sessionId);
      const runId = snapshot?.activeRun?.runId;
      if (!runId) return;
      await sessionService.control(sessionId, { type: 'abort', runId });
    } catch (error) {
      console.warn(`[workflows] could not interrupt agent session ${sessionId}:`, error?.message ?? error);
    } finally {
      if (typeof sessionService.unloadWorker === 'function') {
        await sessionService.unloadWorker(sessionId).catch(() => {});
      }
    }
  };


  /**
   * Creates the agent's session in the run's workspace and prompts it once.
   * `onSession(sessionId)` hears the id as soon as the session exists, so a
<<<<<<< HEAD
   * stop can interrupt it. Resolves to `{ sessionId, outcome }`.
   */
  const start = async ({ directory, parentSessionId, title, agent: _agent, model, text, signal, onSession }) => {
    const workspace = await workspaceFor(directory);
    const options = model ? optionsFor(model, null) : {
      ...await inheritedOptions(parentSessionId),
      agentId: null,
    };
    const created = await sessionService.create({
      projectId: workspace.projectId,
      workspaceId: workspace.workspaceId,
      ...(parentSessionId ? { parentSessionId } : {}),
      options,
      ...(title ? { title } : {}),
    });
    const sessionId = created?.session?.sessionId;
    if (!sessionId) throw new Error('The Agent Service returned no session id');
    onSession(sessionId);
=======
   * stop can interrupt it. Its checkpoint must resolve before any prompt; a
   * rejected checkpoint leaves the already-created empty child in OpenCode.
   * Resolves to `{ sessionId, outcome }`, where outcome
   * is dispatch-results' `{ state, text, errorMessage }`.
   */
  const start = async ({ directory, parentSessionId, title, agent, model, allowTools = [], text, signal, onSession }) => {
    const client = await getClient(directory);
    let modelRef = model ? parseModelRef(model) : null;
    if (model && !modelRef) throw new Error(`model must be provider/model or provider/model#variant, got ${model}`);
    const parent = modelRef && allowTools.length === 0
      ? null
      : sessionSchema.safeParse(await client.session.get({ sessionID: parentSessionId }).catch(() => null));
    // Like a subagent: without a model of its own the agent runs on the
    // session that started the run.
    if (!modelRef && parent?.success && parent.data.model) modelRef = parent.data.model;
    const request = { parentID: parentSessionId, title, metadata: WORKFLOW_AGENT_METADATA };
    if (agent) request.agent = agent;
    if (modelRef) request.model = modelRef;
    // A child given permissions of its own no longer inherits its parent's, so
    // they come first and the allows, read last, win. Without the parent's
    // rules nothing is set: the agent keeps them and answers in plain text,
    // which the prompt allows for.
    if (allowTools.length > 0 && parent?.success) {
      request.permissions = [
        ...(parent.data.permissions ?? []),
        ...allowTools.map((tool) => ({ action: tool, resource: '*', effect: 'allow' })),
      ];
    }
    const created = sessionSchema.parse(await client.session.create(request));
    await onSession(created.id);
>>>>>>> bc50ba56a
    if (signal.aborted) throw new WorkflowAgentStopped();
    const sent = await sessionService.send(sessionId, promptRequest(text, options));
    if (signal.aborted) {
      await interrupt(directory, sessionId);
      throw new WorkflowAgentStopped();
    }
    const outcome = await waitForTurn({ sessionId, runId: sent?.run?.runId, signal });
    return { sessionId, outcome };
  };

  /** A plain session for a saved workflow the user runs where no session is open. */
  const createSession = async ({ directory, title, signal }) => {
    const workspace = await workspaceFor(directory);
    const created = await sessionService.create({
      projectId: workspace.projectId,
      workspaceId: workspace.workspaceId,
      options: optionsFor(null, null),
      ...(title ? { title } : {}),
    });
    const sessionId = created?.session?.sessionId;
    if (!sessionId) throw new Error('The Agent Service returned no session id');
    return sessionId;
  };

  /** A follow-up prompt in an agent's own session, such as a schema correction. */
  const followUp = async ({ directory, sessionId, text, signal }) => {
    const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
    const afterTurnId = [...(page?.turns ?? [])].reverse().find(terminalTurn)?.turnId;
    const options = await inheritedOptions(sessionId);
    await sessionService.followUp(sessionId, { request: promptRequest(text, options) });
    if (signal.aborted) {
      await interrupt(directory, sessionId);
      throw new WorkflowAgentStopped();
    }
    return waitForTurn({ sessionId, afterTurnId, signal });
  };

  /**
   * The model an agent's session ran on and what it spent, as the Agent
   * Service keeps them on the last assistant message. Null when unreadable.
   */
  const readUsage = async ({ directory: _directory, sessionId }) => {
    const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
    const message = [...(page?.messages ?? [])].reverse()
      .find((candidate) => candidate.role === 'assistant' && candidate.usage);
    if (!message) return null;
    const usage = z.object({
      input: z.number(), output: z.number(),
      cacheRead: z.number(), cacheWrite: z.number(),
      cost: z.object({ total: z.number() }),
    }).safeParse(message.usage);
    if (!usage.success) return null;
    return {
      model: message.providerId && message.modelId ? `${message.providerId}/${message.modelId}` : null,
      usage: {
        cost: usage.data.cost.total,
        input: usage.data.input,
        output: usage.data.output,
        reasoning: 0,
        cacheRead: usage.data.cacheRead,
        cacheWrite: usage.data.cacheWrite,
      },
    };
  };

  /**
   * Delivers the run's report into the proposing session, waking it so the
   * agent continues. A declined or stopped run reports without waking
   * upstream; the canonical send always starts a run, so those reports stay in
   * the run record instead of starting a turn no one asked for.
   */
  const postSynthetic = async (sessionId, message) => {
    if (message?.resume !== true) return;
    const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
    const last = [...(page?.messages ?? [])].reverse()
      .find((candidate) => candidate.role === 'assistant' && candidate.providerId && candidate.modelId);
    const options = last
      ? { providerId: last.providerId, modelId: last.modelId, agentId: null, variant: null, reasoningEffort: null }
      : optionsFor(null, null);
    try {
      await sessionService.send(sessionId, {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: message.text }] },
        options,
      });
    } catch (error) {
      // The runtime tells a repeated delivery (409) and a gone session (404)
      // from a real failure by `status`; the canonical error carries `statusCode`.
      if (error && error.status === undefined) error.status = error.statusCode;
      throw error;
    }
  };
  const unloadWorker = async (sessionId) => {
    if (typeof sessionService.unloadWorker === 'function') {
      await sessionService.unloadWorker(sessionId).catch(() => {});
    }
  };

  return { start, createSession, followUp, interrupt, readUsage, postSynthetic, unloadWorker };
};
