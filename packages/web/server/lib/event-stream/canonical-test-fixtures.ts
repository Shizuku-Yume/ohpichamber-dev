import type { HistoryPage, Message, RuntimeSession, SessionSnapshot, Turn } from '@openchamber/agent-contract';
import type { JsonValue } from '../shared/json-values.js';

export interface FixtureScope {
  projectId: string;
  workspaceId: string;
  cwd: string;
  rootSessionId: string;
  agentDirectoryId: string;
  agentDirectory: string;
}

export interface EventFixtureFields {
  type?: string;
  sessionId?: string;
  epoch?: string;
  sequence?: string;
  timestamp?: number;
  [key: string]: JsonValue | undefined;
}

export interface EventFixtureRecord {
  type: string;
  sessionId: string;
  epoch: string;
  sequence: string;
  timestamp: number;
  [key: string]: JsonValue | undefined;
}

export interface StreamBoundaryCall {
  path: string;
  init?: RequestInit | undefined;
}

export interface StreamBoundaryFixture {
  calls: StreamBoundaryCall[];
  service: {
    request: (path: string, init?: RequestInit) => Promise<Response>;
  };
  push: (text: string) => void;
  end: () => void;
  cancelled: () => boolean;
}

export const scope: FixtureScope = {
  projectId: 'project',
  workspaceId: 'workspace',
  cwd: '/private/workspace',
  rootSessionId: 'session',
  agentDirectoryId: 'agent',
  agentDirectory: '/private/agent',
};

export const runtimeSession = (overrides: Partial<RuntimeSession> = {}): RuntimeSession => ({
  sessionId: 'session',
  projectId: 'project',
  workspaceId: 'workspace',
  displayPath: '.',
  rootSessionId: 'session',
  createdAt: 1,
  updatedAt: 2,
  epoch: 'epoch',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  ...overrides,
});

export const turn = (overrides: Partial<Turn> = {}): Turn => ({
  turnId: 'turn',
  sessionId: 'session',
  runId: 'run',
  status: 'completed',
  userMessageId: 'user',
  assistantMessageIds: ['assistant'],
  startedAt: 1,
  finishedAt: 2,
  ...overrides,
});

export const message = (overrides: Partial<Message> = {}): Message => ({
  messageId: 'assistant',
  sessionId: 'session',
  turnId: 'turn',
  role: 'assistant',
  createdAt: 2,
  parts: [{ type: 'text', partId: 'text', content: 'Final searchable answer' }],
  ...overrides,
});

export const history = (
  messages: Message[] = [message()],
  turns: Turn[] = [turn()],
  overrides: Partial<HistoryPage> = {},
): HistoryPage => ({
  sessionId: 'session',
  branch: { branchId: 'branch', branchVersion: '1', leafMessageId: messages.at(-1)?.messageId ?? null },
  messages,
  turns,
  nextCursor: null,
  ...overrides,
});

export const snapshot = (
  messages: Message[] = [],
  turns: Turn[] = [],
  sessionOverrides: Partial<RuntimeSession> = {},
): SessionSnapshot => {
  const selection = history(messages, turns);
  const session = runtimeSession(sessionOverrides);
  return {
    session,
    cursor: `${session.epoch}:${session.headSequence}`,
    activeRun: null,
    branch: selection.branch,
    messages,
    turns,
    window: {
      firstTurnId: turns[0]?.turnId ?? null,
      lastTurnId: turns.at(-1)?.turnId ?? null,
      firstMessageId: messages[0]?.messageId ?? null,
      lastMessageId: messages.at(-1)?.messageId ?? null,
      hasEarlier: false,
    },
    approvals: [],
    questions: [],
    requestRecovery: { pendingSet: 'replace', priorEpochs: 'expired' },
  };
};

export const event = (sequence: number, fields: EventFixtureFields = {}): EventFixtureRecord => {
  const base: EventFixtureRecord = {
    type: 'part.delta',
    sessionId: 'session',
    epoch: 'epoch',
    sequence: String(sequence),
    timestamp: sequence,
  };
  if (!fields.type || fields.type === 'part.delta') {
    base.partId = 'text';
    base.delta = String(sequence);
  }
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete base[key];
    else base[key] = value;
  }
  return base;
};

export const encodeEvent = (record: Pick<EventFixtureRecord, 'epoch' | 'sequence' | 'type'>): string =>
  `id: ${record.epoch}:${record.sequence}\nevent: ${record.type}\ndata: ${JSON.stringify(record)}\n\n`;

export const streamBoundary = (): StreamBoundaryFixture => {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let cancelled = false;
  const calls: StreamBoundaryCall[] = [];
  const body = new ReadableStream<Uint8Array>({
    start(value) { controller = value; },
    cancel() { cancelled = true; },
  });
  return {
    calls,
    service: {
      async request(path: string, init?: RequestInit): Promise<Response> {
        calls.push({ path, init });
        return path.endsWith('/snapshot')
          ? Response.json(snapshot())
          : new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      },
    },
    push(text: string): void {
      if (!controller) throw new Error('Stream controller is not initialized');
      controller.enqueue(new TextEncoder().encode(text));
    },
    end(): void {
      if (!controller) throw new Error('Stream controller is not initialized');
      controller.close();
    },
    cancelled: () => cancelled,
  };
};

export interface Deferred<Value = void> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}

export interface VoidDeferred {
  promise: Promise<void>;
  resolve: () => void;
}

export function deferred(): VoidDeferred;
export function deferred<Value>(): Deferred<Value>;
export function deferred<Value = void>(): Deferred<Value> {
  let resolve: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((done) => { resolve = done; });
  if (!resolve) throw new Error('Promise executor did not initialize resolve');
  return { promise, resolve };
}
