import { create } from 'zustand';
import type { CanonicalEvent, JsonValue, SessionSnapshot } from '@openchamber/agent-contract';


type LiveTool = {
  partID: string;
  name: string;
  path: string | null;
};

type SessionCalls = {
  running: readonly LiveTool[];
  last: LiveTool | null;
};

type ContextReading =
  | { state: 'measured'; tokens: number }
  | { state: 'compacted' };

type SessionLiveWorkState = {
  tools: ReadonlyMap<string, SessionCalls>;
  context: ReadonlyMap<string, ContextReading>;
};

export const SESSION_LIVE_WORK_MAX = 2000;
const CALLS_MAX = 16;

let revision = 0;
let resetRevision = 0;
const touchedAt = new Map<string, number>();

const touch = (sessionID: string): void => {
  revision += 1;
  touchedAt.delete(sessionID);
  touchedAt.set(sessionID, revision);
  if (touchedAt.size > SESSION_LIVE_WORK_MAX) {
    const oldest = touchedAt.keys().next().value;
    if (oldest !== undefined) touchedAt.delete(oldest);
  }
};

export const sessionContextRevision = (): number => revision;

export const currentLiveTool = (calls: SessionCalls | undefined): LiveTool | undefined => calls?.running.at(-1) ?? calls?.last ?? undefined;

export const useSessionLiveWorkStore = create<SessionLiveWorkState>()(() => ({
  tools: new Map(),
  context: new Map(),
}));

const readInputPath = (input: Readonly<Partial<Record<string, JsonValue>>>): string | null => {
  for (const key of ['path', 'filePath', 'file_path']) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const setCapped = <V>(map: Map<string, V>, key: string, value: V): void => {
  map.delete(key);
  map.set(key, value);
  if (map.size > SESSION_LIVE_WORK_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
};

export const applySessionLiveWorkEvents = (payloads: readonly CanonicalEvent[]): void => {
  const state = useSessionLiveWorkStore.getState();
  let tools: Map<string, SessionCalls> | null = null;
  let context: Map<string, ContextReading> | null = null;
  const callsOf = (sessionID: string): SessionCalls => (tools ?? state.tools).get(sessionID) ?? { running: [], last: null };
  const setCalls = (sessionID: string, calls: SessionCalls) => {
    tools ??= new Map(state.tools);
    if (calls.running.length === 0 && !calls.last) tools.delete(sessionID);
    else setCapped(tools, sessionID, { running: calls.running.slice(-CALLS_MAX), last: calls.last });
  };
  const read = (sessionID: string, reading: ContextReading) => {
    touch(sessionID);
    const previous = (context ?? state.context).get(sessionID);
    if (previous && sameReading(previous, reading)) return;
    context ??= new Map(state.context);
    setCapped(context, sessionID, reading);
  };
  const measure = (sessionID: string, tokens: number) => {
    if (tokens > 0) read(sessionID, { state: 'measured', tokens });
  };
  const endCalls = (sessionID: string) => {
    const calls = callsOf(sessionID);
    if (calls.running.length === 0 && !calls.last) return;
    setCalls(sessionID, { running: [], last: null });
  };
  const startCall = (sessionID: string, id: string, toolName: string, input: Record<string, JsonValue>) => {
    const calls = callsOf(sessionID);
    const path = readInputPath(input);
    const existing = calls.running.find((call) => call.partID === id);
    if (existing?.name === toolName && existing.path === path) return;
    const call = { partID: id, name: toolName, path };
    setCalls(sessionID, { ...calls, running: existing ? calls.running.map((entry) => entry === existing ? call : entry) : [...calls.running, call] });
  };
  const finishCall = (sessionID: string, id: string) => {
    const calls = callsOf(sessionID);
    const call = calls.running.find((entry) => entry.partID === id);
    if (call) setCalls(sessionID, { running: calls.running.filter((entry) => entry !== call), last: call });
  };
  for (const event of payloads) {
    const id = event.sessionId;
    switch (event.type) {
      case 'tool.started':
        startCall(id, event.toolCallId, event.toolName, event.input);
        break;
      case 'tool.completed':
        finishCall(id, event.toolCallId);
        break;
      case 'part.started':
      case 'part.updated':
      case 'part.completed': {
        const part = event.part;
        if (part.type === 'tool_call') {
          if (part.status === 'pending' || part.status === 'running') startCall(id, part.toolCallId, part.toolName, part.input);
          else finishCall(id, part.toolCallId);
        }
        break;
      }
      case 'message.created':
      case 'message.updated':
        if (event.usage) measure(id, event.usage.totalTokens);
        break;
      case 'session.compacted':
        read(id, event.tokensAfter === undefined ? { state: 'compacted' } : { state: 'measured', tokens: event.tokensAfter });
        break;
      case 'run.started':
      case 'run.completed':
      case 'run.failed':
      case 'run.cancelled':
        endCalls(id);
        break;
      case 'session.status':
        if (event.runtimeStatus === 'idle' || event.runtimeStatus === 'unavailable') endCalls(id);
        break;
      case 'session.deleted':
        for (const sessionID of event.deletedSessionIds) {
          endCalls(sessionID);
          touch(sessionID);
          if ((context ?? state.context).has(sessionID)) {
            context ??= new Map(state.context);
            context.delete(sessionID);
          }
        }
        break;
    }
  }
  if (tools || context) useSessionLiveWorkStore.setState({ tools: tools ?? state.tools, context: context ?? state.context });
};

const sameReading = (a: ContextReading, b: ContextReading): boolean => (
  a.state === b.state && (a.state !== 'measured' || b.state !== 'measured' || a.tokens === b.tokens)
);

export const seedSessionContextFromHost = (readings: ReadonlyMap<string, ContextReading>, since: number): void => {
  if (since < resetRevision) return;
  const state = useSessionLiveWorkStore.getState();
  let context: Map<string, ContextReading> | null = null;
  for (const [sessionID, reading] of readings) {
    if ((touchedAt.get(sessionID) ?? 0) > since) continue;
    const previous = state.context.get(sessionID);
    if (previous && sameReading(previous, reading)) continue;
    context ??= new Map(state.context);
    setCapped(context, sessionID, reading);
  }
  if (context) useSessionLiveWorkStore.setState({ context });
};

export const resetSessionLiveWork = (): void => {
  touchedAt.clear();
  revision += 1;
  resetRevision = revision;
  useSessionLiveWorkStore.setState({ tools: new Map(), context: new Map() });
};

export const applySessionLiveWorkSnapshot = (snapshot: SessionSnapshot): void => {
  const id = snapshot.session.sessionId;
  const activeTurns = new Set(snapshot.activeRun ? snapshot.turns.filter((turn) => turn.runId === snapshot.activeRun?.runId).map((turn) => turn.turnId) : []);
  const calls: LiveTool[] = [];
  let reading: ContextReading | undefined;
  for (const message of snapshot.messages) {
    if (message.role === 'assistant' && message.usage && message.usage.totalTokens > 0) reading = { state: 'measured', tokens: message.usage.totalTokens };
    for (const part of message.parts) {
      if (part.type === 'notice' && part.noticeType === 'compaction') reading = part.details.tokensAfter === undefined ? { state: 'compacted' } : { state: 'measured', tokens: part.details.tokensAfter };
      if (activeTurns.has(message.turnId) && part.type === 'tool_call' && (part.status === 'pending' || part.status === 'running')) calls.push({ partID: part.toolCallId, name: part.toolName, path: readInputPath(part.input) });
    }
  }
  const state = useSessionLiveWorkStore.getState();
  const tools = new Map(state.tools);
  const context = new Map(state.context);
  if (calls.length) setCapped(tools, id, { running: calls.slice(-CALLS_MAX), last: null });
  else tools.delete(id);
  if (reading) setCapped(context, id, reading);
  else context.delete(id);
  touch(id);
  useSessionLiveWorkStore.setState({ tools, context });
};
