import { z } from 'zod';
import { parseModelSelector, thinkingLevelToReasoningEffort, modelRefKey } from '@openchamber/agent-contract';

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
// The idle turn is polled: the Host has no push subscription this module may
// hold, and a workflow agent is one prompt, so a short poll is enough.
const POLL_MS = 1_000;
const HISTORY_LIMIT = 50;
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
import { readDispatchOutcome } from '../dispatch-results/runtime.js';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
=======
import { readDispatchOutcome } from '../dispatch-results/runtime.js';
import type { DispatchResultsOptions } from '../dispatch-results/runtime.js';
import { createSessionActivityProbe } from '../opencode/session-activity.js';
import type { SessionActivityOptions } from '../opencode/session-activity.js';
import { hasErrorMessage } from './contracts.js';
import type { SyntheticMessage, WorkflowRuntimeOptions } from './contracts.js';
import type { WorkflowClientFactory, WorkflowSessionClient, WorkflowSessionRequest } from './opencode-client.js';
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
const terminalTurn = (turn) => turn.status === 'completed' || turn.status === 'failed' || turn.status === 'cancelled';
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
// The idle event wakes a waiting agent at once; this is the fallback when an
// event is missed, such as across a reconnect of the event hub.
const POLL_MS = 5_000;
const RECORD_PAGE_LIMIT = 50;
=======
const POLL_MS = 5_000;
const RECORD_PAGE_LIMIT = 50;
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
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

/** `provider/model`, optionally with `[:level]`, `#variant` or `@upstream`. */
const parseModelRef = (value) => {
  const parsed = parseModelSelector(value);
  if (!parsed) return null;
  return {
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    variant: parsed.variant ?? null,
    thinkingLevel: parsed.thinkingLevel,
  };
};
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
const statusEventSchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.string().min(1) }) }),
});
const recordSchema = z.object({ id: z.string().min(1), type: z.string() });
const permissionRuleSchema = z.object({ action: z.string(), resource: z.string(), effect: z.enum(['allow', 'deny', 'ask']) });
const sessionSchema = z.object({
  id: z.string().min(1),
  model: z.object({ id: z.string().min(1), providerID: z.string().min(1), variant: z.string().optional() }).nullish(),
  permissions: z.array(permissionRuleSchema).optional(),
});
const usageSessionSchema = z.object({
  model: z.object({ id: z.string().min(1), providerID: z.string().min(1) }).nullish(),
  cost: z.number(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    cache: z.object({ read: z.number(), write: z.number() }),
  }),
});
=======
const statusEventSchema = z.object({
  type: z.literal('session.status'),
  properties: z.object({ sessionID: z.string().min(1), status: z.object({ type: z.string().min(1) }) }),
});
const recordSchema = z.object({ id: z.string().min(1), type: z.string() });
const permissionRuleSchema = z.object({ action: z.string(), resource: z.string(), effect: z.enum(['allow', 'deny', 'ask']) });
const sessionSchema = z.object({
  id: z.string().min(1),
  model: z.object({ id: z.string().min(1), providerID: z.string().min(1), variant: z.string().optional() }).nullish(),
  location: z.object({ directory: z.string().min(1) }).nullish(),
  permissions: z.array(permissionRuleSchema).optional(),
});
const usageSessionSchema = z.object({
  model: z.object({ id: z.string().min(1), providerID: z.string().min(1) }).nullish(),
  cost: z.number(),
  tokens: z.object({
    input: z.number(),
    output: z.number(),
    reasoning: z.number(),
    cache: z.object({ read: z.number(), write: z.number() }),
  }),
});
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts

export interface WorkflowAgentSessionOptions {
  buildOpenCodeUrl: SessionActivityOptions['buildOpenCodeUrl'];
  getOpenCodeAuthHeaders: SessionActivityOptions['getOpenCodeAuthHeaders'];
  waitForOpenCodeReady?: (timeoutMs: number, pollMs: number) => Promise<void>;
  globalEventHub: Pick<DispatchResultsOptions['globalEventHub'], 'subscribeEvent'>;
  createClient?: WorkflowClientFactory;
  fetchImpl?: typeof fetch;
  pollMs?: number;
}

type AgentSessions = WorkflowRuntimeOptions['agentSessions'];
type ModelRef = NonNullable<z.infer<typeof sessionSchema>['model']>;

export class WorkflowAgentStopped extends Error {
  constructor() {
    super('The agent was stopped');
    this.name = 'WorkflowAgentStopped';
  }
}

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
/**
 * Workflow agents run as canonical Host sessions on the Agent Service. One
 * agent is one session and one prompt; a JSON answer that does not match its
 * schema gets a follow-up prompt in the same session.
 *
 * Unlike upstream's OpenCode child sessions these are root sessions: the
 * canonical create contract carries no parent link, and the Agent Service
 * writes `parentSessionId` only for sessions its own subagent tool opens.
 * The run record links every agent's session, and the report goes back into
 * the session that proposed the run.
 */
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
/** `provider/model`, optionally with `#variant`, as OpenCode's model ref. */
const parseModelRef = (value) => {
  const [model, variant] = value.split('#');
  const slash = model.indexOf('/');
  if (slash <= 0 || slash === model.length - 1) return null;
  const ref = { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
  if (variant) ref.variant = variant;
  return ref;
};

/**
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
 */
=======
const parseModelRef = (value: string) => {
  const [model = '', variant] = value.split('#');
  const slash = model.indexOf('/');
  if (slash <= 0 || slash === model.length - 1) return null;
  const ref: ModelRef = { providerID: model.slice(0, slash), id: model.slice(slash + 1) };
  if (variant) ref.variant = variant;
  return ref;
};

const workflowAgentMetadata = (parentSessionId: string) => ({ openchamber: { kind: 'workflow-agent', parentID: parentSessionId } });

>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
export const createWorkflowAgentSessions = ({
  sessionService,
  resolveWorkspace,
  pollMs = POLL_MS,
<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
  sleep = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
}) => {
  if (!sessionService || typeof sessionService.send !== 'function' || typeof sessionService.create !== 'function') {
    throw new Error('Workflow agents need the canonical session service');
  }
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
}) => {
  // Session id -> wakers of the turns waiting on it.
  const waiters = new Map();
  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, fetchImpl });
=======
}: WorkflowAgentSessionOptions) => {
  const waiters = new Map<string, Set<() => void>>();
  const activityProbe = createSessionActivityProbe({ buildOpenCodeUrl, getOpenCodeAuthHeaders, fetchImpl });
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
  const workspaceFor = async (directory) => {
    const scope = await resolveWorkspace(directory);
    if (!scope?.projectId || !scope?.workspaceId) throw new Error(`No workspace is registered for ${directory}`);
    return scope;
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  // Every v2 route lives under /api and the client appends it, so it only
  // wants the origin. Per-directory scoping is a request header.
  const getClient = async (directory) => {
    await waitForOpenCodeReady(10_000, 250);
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    return createClient({ baseUrl: new URL(buildOpenCodeUrl('/api/info', '')).origin, headers, fetch: fetchImpl });
=======
  const getClient = async (directory: string) => {
    await waitForOpenCodeReady(10_000, 250);
    const headers = { ...getOpenCodeAuthHeaders() };
    if (directory) headers['x-opencode-directory'] = encodeURIComponent(directory);
    return createClient({ baseUrl: new URL(buildOpenCodeUrl('/api/info', '')).origin, headers, fetch: fetchImpl });
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
  };

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
  const optionsFor = (model, _agent) => {
    const ref = model ? parseModelRef(model) : null;
    if (model && !ref) throw new Error(`model must be provider/model, optionally with :thinkingLevel, #variant or @upstream, got ${model}`);
    return {
      providerId: ref?.providerId ?? null,
      modelId: ref?.modelId ?? null,
      agentId: null,
      variant: ref?.variant ?? null,
      reasoningEffort: thinkingLevelToReasoningEffort(ref?.thinkingLevel),
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  /**
   * Admits a synthetic message into a session, the way dispatch-results
   * delivers a dispatched session's answer. Throws with `status` set, so the
   * caller can tell an id admitted before (409) and a gone session (404).
   */
  const postSynthetic = async (sessionId, body) => {
    const response = await fetchImpl(buildOpenCodeUrl(`/api/session/${encodeURIComponent(sessionId)}/synthetic`, ''), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...getOpenCodeAuthHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw Object.assign(new Error(`OpenCode refused the workflow report with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`), { status: response.status });
    }
  };

  const unsubscribe = globalEventHub.subscribeEvent((event) => {
    for (const payload of event?.translated?.() ?? []) {
      const status = statusEventSchema.safeParse(payload);
      if (!status.success || status.data.properties.status.type !== 'idle') continue;
      for (const wake of waiters.get(status.data.properties.sessionID) ?? []) wake();
    }
  });

  const pause = (sessionId, signal) => new Promise((resolve) => {
    const set = waiters.get(sessionId) ?? new Set();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      set.delete(done);
      if (set.size === 0) waiters.delete(sessionId);
      resolve();
=======
  const postSynthetic = async (sessionId: string, body: SyntheticMessage) => {
    const response = await fetchImpl(buildOpenCodeUrl(`/api/session/${encodeURIComponent(sessionId)}/synthetic`, ''), {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...getOpenCodeAuthHeaders() },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw Object.assign(new Error(`OpenCode refused the synthetic message with ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`), { status: response.status });
    }
  };

  const unsubscribe = globalEventHub.subscribeEvent((event) => {
    for (const payload of event?.translated?.() ?? []) {
      const status = statusEventSchema.safeParse(payload);
      if (!status.success || status.data.properties.status.type !== 'idle') continue;
      for (const wake of waiters.get(status.data.properties.sessionID) ?? []) wake();
    }
  });

  const pause = (sessionId: string, signal: AbortSignal) => new Promise<void>((resolve) => {
    const set = waiters.get(sessionId) ?? new Set<() => void>();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      set.delete(done);
      if (set.size === 0) waiters.delete(sessionId);
      resolve();
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
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

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
  /** Resolves when the run's turn is over, or when the newest turn after `afterTurnId` is. */
  const waitForTurn = async ({ sessionId, runId, afterTurnId, signal }) => {
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  const readRecords = async (client, sessionId) => {
    const page = await client.message.list({ sessionID: sessionId, limit: RECORD_PAGE_LIMIT, order: 'desc' });
    return Array.isArray(page?.data) ? page.data : null;
  };

  /** The newest end-of-run record of a session, or null when it has none. */
  const latestIdleId = async (client, sessionId) => {
    const records = await readRecords(client, sessionId);
    const idle = (records ?? []).map((record) => recordSchema.safeParse(record)).find((parsed) => parsed.success && parsed.data.type === 'idle');
    return idle?.data.id ?? null;
  };

  /**
   * Waits until the turn that began after `afterIdleId` is over: the session
   * is not running, none of its own subagents runs, and OpenCode has written
   * the run's idle record. Unknown is never "over".
   */
  const waitForTurn = async (client, sessionId, afterIdleId, signal) => {
=======
  const readRecords = async (client: WorkflowSessionClient, sessionId: string) => {
    const page = await client.message.list({ sessionID: sessionId, limit: RECORD_PAGE_LIMIT, order: 'desc' });
    return Array.isArray(page?.data) ? page.data : null;
  };

  const latestIdleId = async (client: WorkflowSessionClient, sessionId: string) => {
    const records = await readRecords(client, sessionId);
    const idle = (records ?? []).map((record) => recordSchema.safeParse(record)).find(
      (parsed): parsed is z.ZodSafeParseSuccess<z.infer<typeof recordSchema>> => parsed.success && parsed.data.type === 'idle',
    );
    return idle?.data.id ?? null;
  };

  const waitForTurn = async (client: WorkflowSessionClient, sessionId: string, afterIdleId: string | null, signal: AbortSignal) => {
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
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

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
  /**
   * Interrupts a running agent session. Failure is reported, not thrown: the
   * run is being stopped either way.
   */
  const interrupt = async (directory, sessionId) => {
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  const prompt = async (client, sessionId, text, signal) => {
    const afterIdleId = await latestIdleId(client, sessionId);
    // A run stopped meanwhile sends nothing; one stopped while the prompt was
    // on its way interrupts the turn it started, which the run's own
    // interrupts may have missed.
    if (signal.aborted) throw new WorkflowAgentStopped();
    await client.session.prompt({ sessionID: sessionId, text });
    if (signal.aborted) {
      await client.session.interrupt({ sessionID: sessionId }).catch(() => undefined);
      throw new WorkflowAgentStopped();
    }
    return waitForTurn(client, sessionId, afterIdleId, signal);
  };

  /**
   * Interrupts a running agent session. Failure is reported, not thrown: the
   * run is being stopped either way.
   */
  const interrupt = async (directory, sessionId) => {
=======
  const prompt = async (client: WorkflowSessionClient, sessionId: string, text: string, signal: AbortSignal) => {
    const afterIdleId = await latestIdleId(client, sessionId);
    if (signal.aborted) throw new WorkflowAgentStopped();
    await client.session.prompt({ sessionID: sessionId, text });
    if (signal.aborted) {
      await client.session.interrupt({ sessionID: sessionId }).catch(() => undefined);
      throw new WorkflowAgentStopped();
    }
    return waitForTurn(client, sessionId, afterIdleId, signal);
  };

  const interrupt: AgentSessions['interrupt'] = async (directory, sessionId) => {
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
    try {
      const snapshot = await sessionService.open(sessionId);
      const runId = snapshot?.activeRun?.runId;
      if (!runId) return;
      await sessionService.control(sessionId, { type: 'abort', runId });
    } catch (error) {
<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
      console.warn(`[workflows] could not interrupt agent session ${sessionId}:`, error?.message ?? error);
    } finally {
      if (typeof sessionService.unloadWorker === 'function') {
        await sessionService.unloadWorker(sessionId).catch(() => {});
      }
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
      console.warn(`[workflows] could not interrupt agent session ${sessionId}:`, error?.message ?? error);
=======
      console.warn(`[workflows] could not interrupt agent session ${sessionId}:`, hasErrorMessage(error) ? error.message ?? error : error);
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
    }
  };

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js

  /**
   * Creates the agent's session in the run's workspace and prompts it once.
   * `onSession(sessionId)` hears the id as soon as the session exists, so a
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
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  /**
   * Creates the agent's session under `parentSessionId` and runs `text` in it.
   * `onSession(sessionId)` hears the id as soon as the session exists, so a
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
=======
  const start: AgentSessions['start'] = async ({ directory, parentSessionId, title, agent, model, allowTools = [], text, signal, onSession }) => {
    const client = await getClient(directory);
    let modelRef = model ? parseModelRef(model) : null;
    if (model && !modelRef) throw new Error(`model must be provider/model or provider/model#variant, got ${model}`);
    const parent = sessionSchema.parse(await client.session.get({ sessionID: parentSessionId }));
    if (!modelRef && parent.model) modelRef = parent.model;
    const request: WorkflowSessionRequest = {
      title,
      metadata: workflowAgentMetadata(parentSessionId),
      location: { directory: parent.location?.directory || directory },
    };
    if (agent) request.agent = agent;
    if (modelRef) request.model = modelRef;
    const permissions: z.infer<typeof permissionRuleSchema>[] = [
      ...(parent.permissions ?? []),
      ...allowTools.map((tool): z.infer<typeof permissionRuleSchema> => ({ action: tool, resource: '*', effect: 'allow' })),
    ];
    if (permissions.length > 0) request.permissions = permissions;
    const created = sessionSchema.parse(await client.session.create(request));
    await onSession(created.id);
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
    if (signal.aborted) throw new WorkflowAgentStopped();
    const sent = await sessionService.send(sessionId, promptRequest(text, options));
    if (signal.aborted) {
      await interrupt(directory, sessionId);
      throw new WorkflowAgentStopped();
    }
    const outcome = await waitForTurn({ sessionId, runId: sent?.run?.runId, signal });
    return { sessionId, outcome };
  };

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
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
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  /** A plain session for a saved workflow the user runs where no session is open. */
  const createSession = async ({ directory, title }) => {
    const client = await getClient(directory);
    return sessionSchema.parse(await client.session.create({ title })).id;
=======
  const createSession: AgentSessions['createSession'] = async ({ directory, title }) => {
    const client = await getClient(directory);
    return sessionSchema.parse(await client.session.create({ title })).id;
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
  };

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
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
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  /** A follow-up prompt in an agent's own session, such as a schema correction. */
  const followUp = async ({ directory, sessionId, text, signal }) => {
    const client = await getClient(directory);
    return prompt(client, sessionId, text, signal);
=======
  const followUp: AgentSessions['followUp'] = async ({ directory, sessionId, text, signal }) => {
    const client = await getClient(directory);
    return prompt(client, sessionId, text, signal);
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
  };

<<<<<<< HEAD:packages/web/server/lib/workflows/agent-session.js
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
||||||| bc50ba56aa:packages/web/server/lib/workflows/agent-session.js
  /**
   * The model an agent's session ran on and what it spent, as OpenCode keeps
   * them on the session. Null when the session cannot be read.
   */
  const readUsage = async ({ directory, sessionId }) => {
    const client = await getClient(directory);
    const session = usageSessionSchema.safeParse(await client.session.get({ sessionID: sessionId }).catch(() => null));
    if (!session.success) return null;
    const { model, cost, tokens } = session.data;
=======
  const readUsage: AgentSessions['readUsage'] = async ({ directory, sessionId }) => {
    const client = await getClient(directory);
    const session = usageSessionSchema.safeParse(await client.session.get({ sessionID: sessionId }).catch(() => null));
    if (!session.success) return null;
    const { model, cost, tokens } = session.data;
>>>>>>> upstream/main:packages/web/server/lib/workflows/agent-session.ts
    return {
      model: modelRefKey(message.providerId, message.modelId) || null,
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
