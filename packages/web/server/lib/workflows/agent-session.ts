import { z } from 'zod';
import {
  modelRefKey,
  parseModelSelector,
  thinkingLevelToReasoningEffort,
} from '@openchamber/agent-contract';
import type {
  CapturedSendOptions,
  HistoryPage,
  Message,
  PromptRequest,
  SessionControlAck,
  Turn,
} from '@openchamber/agent-contract';
import type { DispatchOutcome } from '../dispatch-results/runtime.js';
import type { SyntheticMessage, WorkflowAgentSessions } from './contracts.js';

const POLL_MS = 1_000;
const HISTORY_LIMIT = 50;

const OUTCOME_STATES = {
  completed: 'completed',
  failed: 'error',
  cancelled: 'cancelled',
} as const;

type TerminalStatus = keyof typeof OUTCOME_STATES;

const terminalTurn = (turn: Turn): turn is Turn & { status: TerminalStatus } =>
  turn.status === 'completed' || turn.status === 'failed' || turn.status === 'cancelled';

const historyQuery = (): string => new URLSearchParams({ limit: String(HISTORY_LIMIT) }).toString();

const messageText = (message: Message): string => (Array.isArray(message.parts) ? message.parts : [])
  .filter((part): part is Extract<Message['parts'][number], { type: 'text' }> => part.type === 'text')
  .map((part) => part.content)
  .join('')
  .trim();

const outcomeOf = (page: HistoryPage, turn: Turn & { status: TerminalStatus }): DispatchOutcome => {
  const message = page.messages.find((candidate) =>
    candidate.role === 'assistant' && turn.assistantMessageIds.includes(candidate.messageId));
  return {
    state: OUTCOME_STATES[turn.status],
    text: message ? messageText(message) : '',
    errorMessage: turn.error ? turn.error.trim() : '',
  };
};

const parseModelRef = (value: string) => {
  const parsed = parseModelSelector(value);
  if (!parsed) return null;
  return {
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    variant: parsed.variant ?? null,
    thinkingLevel: parsed.thinkingLevel,
  };
};

export interface WorkflowSessionService {
  create: (payload: {
    projectId: string;
    workspaceId: string;
    parentSessionId?: string;
    options?: CapturedSendOptions;
    title?: string;
  }) => Promise<{ session?: { sessionId?: string } | null } | null | undefined>;
  send: (sessionId: string, payload: PromptRequest) => Promise<{ run?: { runId?: string } | null } | null | undefined>;
  followUp: (sessionId: string, payload: { request: PromptRequest }) => Promise<{ followUpId?: string } | null | undefined>;
  history: (sessionId: string, query: string) => Promise<HistoryPage | null | undefined>;
  open: (sessionId: string) => Promise<{ activeRun?: { runId?: string } | null } | null | undefined>;
  control: (sessionId: string, operation: { type: 'abort'; runId: string }) => Promise<{ run?: { runId?: string } | null } | SessionControlAck | null | undefined>;
  unloadWorker?: ((sessionId: string) => Promise<void>) | undefined;
}

export interface WorkflowWorkspaceScope {
  projectId: string;
  workspaceId: string;
  cwd?: string;
}

export interface WorkflowAgentSessionOptions {
  sessionService: WorkflowSessionService;
  resolveWorkspace: (directory: string) => Promise<WorkflowWorkspaceScope | null | undefined>;
  pollMs?: number;
  sleep?: (duration: number) => Promise<void>;
}

const statusErrorSchema = z.object({
  status: z.number().optional(),
  statusCode: z.number().optional(),
});

const usageSchema = z.object({
  input: z.number(),
  output: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  cost: z.object({ total: z.number() }),
});

export class WorkflowAgentStopped extends Error {
  constructor() {
    super('The agent was stopped');
    this.name = 'WorkflowAgentStopped';
  }
}

export type WorkflowAgentSessionsHandle = WorkflowAgentSessions & {
  postSynthetic: (sessionId: string, message: Pick<SyntheticMessage, 'text' | 'resume'>) => Promise<void>;
};

export const createWorkflowAgentSessions = ({
  sessionService,
  resolveWorkspace,
  pollMs = POLL_MS,
}: WorkflowAgentSessionOptions): WorkflowAgentSessionsHandle => {
  if (!sessionService?.send || !sessionService?.create) {
    throw new Error('Workflow agents need the canonical session service');
  }

  const workspaceFor = async (directory: string): Promise<WorkflowWorkspaceScope> => {
    const scope = await resolveWorkspace(directory);
    if (!scope?.projectId || !scope?.workspaceId) throw new Error(`No workspace is registered for ${directory}`);
    return scope;
  };

  const optionsFor = (model: string | null | undefined, _agent: string | null | undefined): CapturedSendOptions => {
    const ref = model ? parseModelRef(model) : null;
    if (model && !ref) {
      throw new Error(`model must be provider/model, optionally with :thinkingLevel, #variant or @upstream, got ${model}`);
    }
    return {
      providerId: ref?.providerId ?? null,
      modelId: ref?.modelId ?? null,
      agentId: null,
      variant: ref?.variant ?? null,
      reasoningEffort: thinkingLevelToReasoningEffort(ref?.thinkingLevel),
    };
  };

  const inheritedOptions = async (parentSessionId: string | null | undefined): Promise<CapturedSendOptions> => {
    if (!parentSessionId) return optionsFor(null, null);
    const page = await sessionService.history(parentSessionId, historyQuery()).catch(() => null);
    const last = [...(page?.messages ?? [])].reverse()
      .find((message) => message.role === 'assistant' && message.providerId && message.modelId);
    if (!last?.providerId || !last.modelId) return optionsFor(null, null);
    return { providerId: last.providerId, modelId: last.modelId, agentId: null, variant: null, reasoningEffort: null };
  };

  const promptRequest = (text: string, options: CapturedSendOptions): PromptRequest => ({
    input: { text, attachments: [], context: [] },
    options,
  });

  const waitForTurn = async ({
    sessionId,
    runId,
    afterTurnId,
    signal,
  }: {
    sessionId: string;
    runId?: string | undefined;
    afterTurnId?: string | undefined;
    signal: AbortSignal;
  }): Promise<DispatchOutcome> => {
    for (; ;) {
      if (signal.aborted) throw new WorkflowAgentStopped();
      const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
      if (page) {
        const turns = page.turns.filter(terminalTurn);
        const turn = runId
          ? turns.find((candidate) => candidate.runId === runId)
          : [...turns].reverse().find((candidate) => candidate.turnId !== afterTurnId);
        if (turn) return outcomeOf(page, turn);
      }
      await new Promise<void>((resolve) => {
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

  const unloadWorker = async (sessionId: string): Promise<void> => {
    if (sessionService.unloadWorker) {
      await sessionService.unloadWorker(sessionId).catch(() => { });
    }
  };

  const interrupt = async (_directory: string, sessionId: string): Promise<void> => {
    try {
      const snapshot = await sessionService.open(sessionId);
      const runId = snapshot?.activeRun?.runId;
      if (!runId) return;
      await sessionService.control(sessionId, { type: 'abort', runId });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(`[workflows] could not interrupt agent session ${sessionId}:`, detail);
    } finally {
      await unloadWorker(sessionId);
    }
  };

  const start = async ({
    directory,
    parentSessionId,
    title,
    agent: _agent,
    model,
    text,
    signal,
    onSession,
  }: Parameters<WorkflowAgentSessions['start']>[0]): Promise<{ sessionId: string; outcome: DispatchOutcome }> => {
    const workspace = await workspaceFor(directory);
    const options = model ? optionsFor(model, null) : {
      ...await inheritedOptions(parentSessionId),
      agentId: null,
    };
    const createPayload: Parameters<WorkflowSessionService['create']>[0] = {
      projectId: workspace.projectId,
      workspaceId: workspace.workspaceId,
      options,
    };
    if (parentSessionId) createPayload.parentSessionId = parentSessionId;
    if (title) createPayload.title = title;
    const created = await sessionService.create(createPayload);
    const sessionId = created?.session?.sessionId;
    if (!sessionId) throw new Error('The Agent Service returned no session id');
    await onSession(sessionId);
    if (signal.aborted) throw new WorkflowAgentStopped();
    const sent = await sessionService.send(sessionId, promptRequest(text, options));
    if (signal.aborted) {
      await interrupt(directory, sessionId);
      throw new WorkflowAgentStopped();
    }
    const outcome = await waitForTurn({ sessionId, runId: sent?.run?.runId, signal });
    return { sessionId, outcome };
  };

  const createSession = async ({
    directory,
    title,
  }: Parameters<WorkflowAgentSessions['createSession']>[0]): Promise<string> => {
    const workspace = await workspaceFor(directory);
    const createPayload: Parameters<WorkflowSessionService['create']>[0] = {
      projectId: workspace.projectId,
      workspaceId: workspace.workspaceId,
      options: optionsFor(null, null),
    };
    if (title) createPayload.title = title;
    const created = await sessionService.create(createPayload);
    const sessionId = created?.session?.sessionId;
    if (!sessionId) throw new Error('The Agent Service returned no session id');
    return sessionId;
  };

  const followUp = async ({
    directory,
    sessionId,
    text,
    signal,
  }: Parameters<WorkflowAgentSessions['followUp']>[0]): Promise<DispatchOutcome> => {
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

  const readUsage = async ({
    directory: _directory,
    sessionId,
  }: Parameters<WorkflowAgentSessions['readUsage']>[0]) => {
    const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
    const message = [...(page?.messages ?? [])].reverse()
      .find((candidate) => candidate.role === 'assistant' && candidate.usage);
    if (!message) return null;
    const usage = usageSchema.safeParse(message.usage);
    if (!usage.success) return null;
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

  const postSynthetic = async (
    sessionId: string,
    message: Pick<SyntheticMessage, 'text' | 'resume'>,
  ): Promise<void> => {
    if (message?.resume !== true) return;
    const page = await sessionService.history(sessionId, historyQuery()).catch(() => null);
    const last = [...(page?.messages ?? [])].reverse()
      .find((candidate) => candidate.role === 'assistant' && candidate.providerId && candidate.modelId);
    const options = last?.providerId && last.modelId
      ? { providerId: last.providerId, modelId: last.modelId, agentId: null, variant: null, reasoningEffort: null }
      : optionsFor(null, null);
    try {
      await sessionService.send(sessionId, {
        input: { text: '', attachments: [], context: [{ kind: 'synthetic', text: message.text }] },
        options,
      });
    } catch (error) {
      const parsed = statusErrorSchema.safeParse(error);
      if (parsed.success && parsed.data.status === undefined && parsed.data.statusCode !== undefined && error instanceof Error) {
        Object.assign(error, { status: parsed.data.statusCode });
      }
      throw error;
    }
  };

  return { start, createSession, followUp, interrupt, readUsage, postSynthetic, unloadWorker };
};
