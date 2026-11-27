import type { JsonValue } from '../shared/json-values.js';

export type { SessionMetadata as StoredSessionMetadata } from '../openchamber-sessions/session-metadata-store.js';

export interface PendingPermission {
  directory?: JsonValue | undefined;
  id?: JsonValue | undefined;
}

export type PublicSessionStatus = { type: 'idle' | 'waiting' | 'busy' };

export interface ControlOptions {
  signal?: AbortSignal | undefined;
  contextSessionId?: string | null | undefined;
  contextCallId?: string | null | undefined;
}

export interface TextMessage {
  id: string;
  role: 'user' | 'assistant';
  createdAt: number | null;
  completedAt: number | null;
  model: string | null;
  text: string;
}

export interface SessionActionResult {
  sessionId: string;
  promptDispatched: boolean;
  sessionStatus?: PublicSessionStatus;
  lastAssistantMessage?: TextMessage | null;
}

export interface SessionStatusResult {
  sessionId: string;
  sessionStatus: PublicSessionStatus;
}

export interface SessionMessagesResult extends SessionStatusResult {
  role: string;
  messages: TextMessage[];
}

export interface SessionReadResults {
  'session.messages': SessionMessagesResult;
  'session.status': SessionStatusResult;
}

export type SessionReadAction = keyof SessionReadResults;

export interface SessionControlExecute {
  (action: 'session.create' | 'session.send', input?: ControlInput, contextDirectory?: ControlInput['directory'], options?: ControlOptions): Promise<SessionActionResult>;
  <Action extends SessionReadAction>(action: Action, input?: ControlInput, contextDirectory?: ControlInput['directory'], options?: ControlOptions): Promise<SessionReadResults[Action]>;
}

export interface ControlInput {
  name?: JsonValue | undefined;
  title?: JsonValue | undefined;
  model?: JsonValue | undefined;
  agent?: JsonValue | undefined;
  variant?: JsonValue | undefined;
  daily?: JsonValue | undefined;
  weekly?: JsonValue | undefined;
  once?: JsonValue | undefined;
  cron?: JsonValue | undefined;
  time?: JsonValue | undefined;
  timezone?: JsonValue | undefined;
  targetSessionId?: JsonValue | undefined;
  goal?: JsonValue | undefined;
  goalTokenBudget?: JsonValue | undefined;
  runInWorktree?: JsonValue | undefined;
  cleanupWorktree?: JsonValue | undefined;
  baseBranch?: JsonValue | undefined;
  disabled?: JsonValue | undefined;
  taskId?: JsonValue | undefined;
  wait?: JsonValue | undefined;
  returnResult?: JsonValue | undefined;
  ownWork?: JsonValue | undefined;
  timeout?: JsonValue | undefined;
  lastAssistant?: JsonValue | undefined;
  pullRequest?: JsonValue | undefined;
  worktree?: JsonValue | undefined;
  branch?: JsonValue | undefined;
  startRef?: JsonValue | undefined;
  setUpstream?: JsonValue | undefined;
  messageId?: JsonValue | undefined;
  withStatus?: JsonValue | undefined;
  inWork?: JsonValue | undefined;
  busy?: JsonValue | undefined;
  all?: JsonValue | undefined;
  children?: JsonValue | undefined;
  query?: JsonValue | undefined;
  provider?: JsonValue | undefined;
  providerId?: JsonValue | undefined;
  offset?: JsonValue | undefined;
  limit?: JsonValue | undefined;
  tabId?: JsonValue | undefined;
  viewport?: JsonValue | undefined;
  ref?: JsonValue | undefined;
  selector?: JsonValue | undefined;
  text?: JsonValue | undefined;
  to?: JsonValue | undefined;
  toSelector?: JsonValue | undefined;
  dialog?: JsonValue | undefined;
  readonly value?: JsonValue | undefined;
  submit?: JsonValue | undefined;
  direction?: JsonValue | undefined;
  key?: JsonValue | undefined;
  gone?: JsonValue | undefined;
  timeoutMs?: JsonValue | undefined;
  paths?: JsonValue | undefined;
  showWhenFocused?: JsonValue | undefined;
  link?: JsonValue | undefined;
  identifier?: JsonValue | undefined;
  existingBranch?: JsonValue | undefined;
  carry?: JsonValue | undefined;
  role?: JsonValue | undefined;
  last?: JsonValue | undefined;
  html?: JsonValue | undefined;
  ui?: JsonValue | undefined;
  awaitAnswer?: JsonValue | undefined;
  answerLater?: JsonValue | undefined;
  share?: JsonValue | undefined;
  reason?: JsonValue | undefined;
  placeholder?: JsonValue | undefined;
  program?: JsonValue | undefined;
  inputs?: JsonValue | undefined;
  projectId?: JsonValue | undefined;
  workspaceId?: JsonValue | undefined;
  directory?: JsonValue | undefined;
  kind?: JsonValue | undefined;
  id?: JsonValue | undefined;
  body?: JsonValue | undefined;
  completed?: JsonValue | undefined;
  planId?: JsonValue | undefined;
  dependsOn?: JsonValue | undefined;
  sessionId?: JsonValue | undefined;
  expected?: JsonValue | undefined;
  ready?: JsonValue | undefined;
  source?: JsonValue | undefined;
  args?: JsonValue | undefined;
  url?: JsonValue | undefined;
  waitId?: JsonValue | undefined;
  prompt?: JsonValue | undefined;
  count?: JsonValue | undefined;
  aspect?: JsonValue | undefined;
  resolution?: JsonValue | undefined;
  images?: JsonValue | undefined;
  path?: JsonValue | undefined;
  readonly label?: JsonValue | undefined;
  maxBytes?: JsonValue | undefined;
}

export interface ActionContext {
  directory?: string | null | undefined;
  signal?: AbortSignal | undefined;
}
