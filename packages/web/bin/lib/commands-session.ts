import { z } from 'zod';
import type { ModelRefLike } from '@openchamber/agent-contract';
import { asNonEmptyString, isBoolean } from '../../server/lib/shared/object-guards.js';
import type { ControlInput, PublicSessionStatus, TextMessage } from '../../server/lib/openchamber-control/contracts.js';
import { TunnelCliError, EXIT_CODE } from './cli-errors.js';
import { resolveTargetPort } from './cli-api-target.js';
import { parseGoalTokenBudget } from './cli-goal.js';
import { requestControlAction } from './cli-control.js';
import type { CliOptions } from './cli-args.js';
import {
  intro as clackIntro,
  outro as clackOutro,
  isJsonMode,
  isQuietMode,
  printJson,
  logStatus,
} from '../cli-output.js';

const sessionStatusSchema = z.object({
  type: z.enum(['idle', 'waiting', 'busy']),
});

const textMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  createdAt: z.number().nullable(),
  completedAt: z.number().nullable(),
  model: z.string().nullable(),
  text: z.string(),
});

const sessionModelRefSchema = z.object({
  provider: z.string().optional(),
  providerId: z.string().optional(),
  providerID: z.string().optional(),
  modelId: z.string().optional(),
  modelID: z.string().optional(),
  id: z.string().optional(),
  variant: z.string().optional(),
});

const toSessionModelRef = (raw: z.infer<typeof sessionModelRefSchema>): ModelRefLike & { variant?: string | undefined } => {
  const ref: ModelRefLike & { variant?: string | undefined } = {};
  if (raw.provider !== undefined) ref.provider = raw.provider;
  if (raw.providerId !== undefined) ref.providerId = raw.providerId;
  if (raw.providerID !== undefined) ref.providerID = raw.providerID;
  if (raw.modelId !== undefined) ref.modelId = raw.modelId;
  if (raw.modelID !== undefined) ref.modelID = raw.modelID;
  if (raw.id !== undefined) ref.id = raw.id;
  if (raw.variant !== undefined) ref.variant = raw.variant;
  return ref;
};

const sessionLineItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  slug: z.string().optional(),
  agent: z.string().optional(),
  directory: z.string().optional(),
  model: sessionModelRefSchema.nullish(),
  status: z.object({ type: z.string().optional() }).nullish(),
});

const sessionListResponseSchema = z.object({
  sessions: z.array(sessionLineItemSchema).optional(),
});

const sessionStatusResponseSchema = z.object({
  sessionId: z.string().optional(),
  sessionStatus: sessionStatusSchema,
});

const sessionMessagesResponseSchema = z.object({
  sessionId: z.string().optional(),
  sessionStatus: sessionStatusSchema.optional(),
  role: z.string().optional(),
  messages: z.array(textMessageSchema).optional(),
});

const sessionActionResponseSchema = z.object({
  sessionId: z.string().optional(),
  directory: z.string().optional(),
  promptDispatched: z.boolean().optional(),
  dispatchedAsCommand: z.boolean().optional(),
  goalEnabled: z.boolean().optional(),
  goalTokenBudget: z.number().nullish(),
  sessionStatus: sessionStatusSchema.optional(),
  lastAssistantMessage: textMessageSchema.nullish(),
  worktree: z.object({
    path: z.string().optional(),
    branch: z.string().optional(),
    name: z.string().optional(),
  }).nullish(),
});

export type SessionCommandOptions = Partial<CliOptions>;

export type SessionLineItem = {
  id?: string | undefined;
  title?: string | undefined;
  slug?: string | undefined;
  agent?: string | undefined;
  directory?: string | undefined;
  model?: (ModelRefLike & { variant?: string | undefined }) | null | undefined;
  status?: { type?: string | undefined } | null | undefined;
};

export type SessionWorktreePayload = {
  name: string;
  branchName?: string;
  startRef?: string;
};

export type SessionCreatePayload = {
  directory?: string;
  projectId?: string;
  title?: string;
  worktree?: SessionWorktreePayload;
  prompt?: string;
  model?: string;
  agent?: string;
  variant?: string;
  goal?: true;
  goalTokenBudget?: number;
  setUpstream?: boolean;
};

export type SessionPromptPayload = {
  directory: string;
  prompt: string;
  messageId?: string;
  model?: string;
  agent?: string;
  variant?: string;
  goal?: true;
  goalTokenBudget?: number;
};

const validateModel = (model: string | undefined): string | null => {
  const normalized = asNonEmptyString(model);
  if (!normalized) return null;
  const slashIndex = normalized.indexOf('/');
  if (slashIndex <= 0 || slashIndex === normalized.length - 1) {
    throw new TunnelCliError('--model must be in provider/model format.', EXIT_CODE.USAGE_ERROR);
  }
  return normalized;
};

const normalizeLimit = (value: number | string | null | undefined, fallback = 10): number => {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new TunnelCliError('Invalid limit value. Provide a positive integer.', EXIT_CODE.USAGE_ERROR);
  }
  return parsed;
};

const assertSessionTarget = (options: SessionCommandOptions = {}) => {
  const sessionId = asNonEmptyString(options.session);
  const directory = asNonEmptyString(options.directory);
  if (!sessionId) {
    throw new TunnelCliError('Missing required --session.', EXIT_CODE.USAGE_ERROR);
  }
  if (!directory) {
    throw new TunnelCliError('Missing required --dir.', EXIT_CODE.USAGE_ERROR);
  }
  return { sessionId, directory };
};

const normalizeMessageRole = (value: string | undefined): 'all' | 'user' | 'assistant' => {
  const role = asNonEmptyString(value) || 'all';
  if (role !== 'all' && role !== 'user' && role !== 'assistant') {
    throw new TunnelCliError('--role must be one of: all, user, assistant.', EXIT_CODE.USAGE_ERROR);
  }
  return role;
};

const formatTextMessage = (message: TextMessage): string => {
  const label = message.role === 'user' ? 'User' : 'Assistant';
  const timestamp = message.createdAt ? new Date(message.createdAt).toISOString() : '';
  const details = [timestamp, message.model].filter(Boolean).join(' ');
  return `**${label}**${details ? `\n\n*${details}*` : ''}\n\n${message.text}`;
};

const formatSessionModel = (session: SessionLineItem, formatModelRef: (ref: ModelRefLike) => string): string | null => {
  if (!session.model) return null;
  return formatModelRef(session.model) || null;
};

const formatSessionLine = (session: SessionLineItem, formatModelRef: (ref: ModelRefLike) => string): string => {
  const title = asNonEmptyString(session.title) || asNonEmptyString(session.slug) || asNonEmptyString(session.id) || 'untitled';
  const model = formatSessionModel(session, formatModelRef) || 'unknown-model';
  const agent = asNonEmptyString(session.agent) || 'unknown-agent';
  const variant = asNonEmptyString(session.model?.variant);
  const directory = asNonEmptyString(session.directory) || 'unknown-directory';
  const selections = [`\`${model}\``, `\`${agent}\``];
  if (variant && variant !== 'default') selections.push(`\`${variant}\``);
  const status = asNonEmptyString(session.status?.type);
  return `- \`${title}\` — ${selections.join(', ')}${status ? ` — status:${status}` : ''} — \`${directory}\``;
};

const buildSessionCreatePayload = (options: SessionCommandOptions = {}): SessionCreatePayload => {
  const directory = asNonEmptyString(options.directory);
  const projectId = asNonEmptyString(options.project);
  if (!directory && !projectId) {
    throw new TunnelCliError('Missing required --dir or --project.', EXIT_CODE.USAGE_ERROR);
  }
  if (directory && projectId) {
    throw new TunnelCliError('Provide only one of --dir or --project.', EXIT_CODE.USAGE_ERROR);
  }

  const prompt = asNonEmptyString(options.prompt);
  const model = validateModel(options.model);
  const goalEnabled = options.goal === true;
  const goalTokenBudget = parseGoalTokenBudget(options);
  if (goalEnabled && !prompt) {
    throw new TunnelCliError('--goal requires --prompt.', EXIT_CODE.USAGE_ERROR);
  }

  const title = asNonEmptyString(options.title) || asNonEmptyString(options.name);
  const agent = asNonEmptyString(options.agent);
  const variant = asNonEmptyString(options.variant);
  const worktree = asNonEmptyString(options.worktree);
  const branch = asNonEmptyString(options.branch);
  const startRef = asNonEmptyString(options.startRef);

  const payload: SessionCreatePayload = {};
  if (directory) payload.directory = directory;
  if (projectId) payload.projectId = projectId;
  if (title) payload.title = title;
  if (worktree) {
    const worktreePayload: SessionWorktreePayload = { name: worktree };
    if (branch) worktreePayload.branchName = branch;
    if (startRef) worktreePayload.startRef = startRef;
    payload.worktree = worktreePayload;
  }
  if (prompt) payload.prompt = prompt;
  if (model) payload.model = model;
  if (agent) payload.agent = agent;
  if (variant) payload.variant = variant;
  if (goalEnabled) payload.goal = true;
  if (goalTokenBudget !== undefined) payload.goalTokenBudget = goalTokenBudget;
  if (isBoolean(options.setUpstream)) payload.setUpstream = options.setUpstream;
  return payload;
};

const buildSessionPromptPayload = (options: SessionCommandOptions = {}, action?: string): SessionPromptPayload => {
  const { directory } = assertSessionTarget(options);
  const prompt = asNonEmptyString(options.prompt);
  if (!prompt) throw new TunnelCliError('Missing required --prompt.', EXIT_CODE.USAGE_ERROR);
  const model = validateModel(options.model);
  const agent = asNonEmptyString(options.agent);
  const variant = asNonEmptyString(options.variant);
  const messageId = asNonEmptyString(options.message);
  if (messageId && action !== 'fork') {
    throw new TunnelCliError('--message is only valid for session fork.', EXIT_CODE.USAGE_ERROR);
  }
  const goalEnabled = options.goal === true;
  const goalTokenBudget = parseGoalTokenBudget(options);

  const payload: SessionPromptPayload = {
    directory,
    prompt,
  };
  if (messageId) payload.messageId = messageId;
  if (model) payload.model = model;
  if (agent) payload.agent = agent;
  if (variant) payload.variant = variant;
  if (goalEnabled) payload.goal = true;
  if (goalTokenBudget !== undefined) payload.goalTokenBudget = goalTokenBudget;
  return payload;
};

const validateActionWaitOptions = (options: SessionCommandOptions, action: string): void => {
  if (options.timeout !== undefined && !options.wait) {
    throw new TunnelCliError('--timeout requires --wait.', EXIT_CODE.USAGE_ERROR);
  }
  if (options.lastAssistant && !options.wait) {
    throw new TunnelCliError(`--last-assistant requires --wait for session ${action}.`, EXIT_CODE.USAGE_ERROR);
  }
};

const reportWaitingForUser = (options: SessionCommandOptions, sessionStatus?: PublicSessionStatus | null): void => {
  if (options.wait !== true || sessionStatus?.type !== 'waiting') return;
  process.exitCode = EXIT_CODE.GENERAL_ERROR;
  if (!isJsonMode(options)) process.stderr.write('Session is waiting for the user and has not finished.\n');
};

async function sessionCommand(options: SessionCommandOptions = {}, action: string | null = 'help'): Promise<void> {
  if (action === 'help') {
    process.stdout.write(`OhPiChamber Session Commands\n\nUSAGE:\n  ohpichamber session list [--dir <path>] [--limit <count>] [--with-status] [OPTIONS]\n  ohpichamber session create --dir <path> [--title <title>] [--wait] [OPTIONS]\n  ohpichamber session create --project <projectId> [--title <title>] [--wait] [OPTIONS]\n  ohpichamber session send --session <id> --dir <path> --prompt <text> [--wait] [OPTIONS]\n  ohpichamber session fork --session <id> --dir <path> --prompt <text> [--message <id>] [--wait] [OPTIONS]\n  ohpichamber session status --session <id> --dir <path> [OPTIONS]\n  ohpichamber session messages --session <id> --dir <path> [--wait] [OPTIONS]\n\nLIST OPTIONS:\n  --dir <path>            Filter sessions by directory\n  --limit <count>         Maximum sessions to show (default: 10)\n  --all                   Include archived sessions\n  --with-status           Include idle/busy/waiting status\n\nACTION OPTIONS:\n  --session <id>          Source or target session id\n  --dir <path>            Authoritative session directory\n  --prompt <text>         Prompt to send to the session\n  --message <id>          Fork from this message (fork only; default: latest)\n  --model <provider/model>  Model for the prompt (defaults to configured selection)\n  --agent <id>            Agent for the prompt (defaults to configured selection)\n  --variant <id>          Model variant for the prompt\n  --goal                  Run the prompt as a new goal\n  --goal-token-budget <n> Goal token budget (1000-100000000; requires --goal)\n  --wait                  Wait for the session to become idle; exits non-zero if it waits for the user\n  --last-assistant        Include the last assistant text after waiting\n  --timeout <seconds>     Wait timeout in seconds (default: 600, max: 86400)\n\nCREATE OPTIONS:\n  --worktree <name>       Create a git worktree before creating the session\n  --branch <name>         Branch name for --worktree\n  --start-ref, --base <ref>  Start ref for --worktree\n  --upstream              Set upstream for the worktree branch\n  --no-upstream           Do not set upstream for the worktree branch\n  --name <title>          Alias for --title\n\nSTATUS/MESSAGES OPTIONS:\n  --last                  Return only the latest text-bearing message\n  --last-assistant        Shorthand for --last --role assistant\n  --limit <count>         Maximum text messages to return (default: 10)\n  --all                   Return all text-bearing messages\n  --role <role>           Filter messages: all, user, assistant\n\nOUTPUT OPTIONS:\n  -p, --port <port>       OhPiChamber server port\n  --json                  Output machine-readable JSON\n  -q, --quiet             Print compact output\n`);
    return;
  }

  if (action === 'list') {
    const limit = normalizeLimit(options.limit);
    const port = await resolveTargetPort(options);
    const listInput: ControlInput = {
      limit,
      all: options.all === true,
      withStatus: options.withStatus === true,
    };
    const directory = asNonEmptyString(options.directory);
    if (directory) listInput.directory = directory;
    const rawBody: unknown = await requestControlAction(port, 'session.list', listInput, options);
    const body = sessionListResponseSchema.parse(rawBody ?? {});
    const sessions = body.sessions ?? [];
    if (isJsonMode(options)) {
      printJson(body);
      return;
    }
    if (sessions.length === 0) {
      process.stdout.write('No sessions found.\n');
      return;
    }
    const { formatModelRef } = await import('@openchamber/agent-contract');
    const formattedLines = sessions.map((session) => formatSessionLine({
      id: session.id,
      title: session.title,
      slug: session.slug,
      agent: session.agent,
      directory: session.directory,
      model: session.model ? toSessionModelRef(session.model) : session.model,
      status: session.status,
    }, formatModelRef));
    process.stdout.write(`${formattedLines.join('\n')}\n`);
    return;
  }

  if (action === 'status') {
    const { sessionId, directory } = assertSessionTarget(options);
    const port = await resolveTargetPort(options);
    const rawResult: unknown = await requestControlAction(port, 'session.status', { sessionId, directory }, options);
    const result = sessionStatusResponseSchema.parse(rawResult);
    const status = result.sessionStatus;
    if (isJsonMode(options)) {
      printJson(result);
      return;
    }
    if (isQuietMode(options)) {
      process.stdout.write(`${status.type}\n`);
      return;
    }
    process.stdout.write(`${sessionId} status:${status.type} directory:${directory}\n`);
    return;
  }

  if (action === 'messages') {
    const { sessionId, directory } = assertSessionTarget(options);
    if (options.timeout !== undefined && !options.wait) {
      throw new TunnelCliError('--timeout requires --wait.', EXIT_CODE.USAGE_ERROR);
    }
    if (options.lastAssistant && options.role && options.role !== 'assistant') {
      throw new TunnelCliError('--last-assistant cannot be combined with a non-assistant --role.', EXIT_CODE.USAGE_ERROR);
    }
    const role = options.lastAssistant ? 'assistant' : normalizeMessageRole(options.role);
    const last = options.last || options.lastAssistant;
    if (options.all && (last || options.limit !== undefined)) {
      throw new TunnelCliError('--all cannot be combined with --last or --limit.', EXIT_CODE.USAGE_ERROR);
    }
    if (last && options.limit !== undefined) {
      throw new TunnelCliError('--last cannot be combined with --limit.', EXIT_CODE.USAGE_ERROR);
    }
    const limit = options.all ? undefined : (last ? undefined : normalizeLimit(options.limit));
    const port = await resolveTargetPort(options);
    const messagesInput: ControlInput = {
      sessionId,
      directory,
      role,
      all: options.all === true,
      last: last === true,
      wait: options.wait === true,
      lastAssistant: options.lastAssistant === true,
    };
    if (limit !== undefined) messagesInput.limit = limit;
    if (options.timeout !== undefined) messagesInput.timeout = Number(options.timeout);
    const rawResult: unknown = await requestControlAction(port, 'session.messages', messagesInput, options);
    const result = sessionMessagesResponseSchema.parse(rawResult ?? {});
    const messages = result.messages ?? [];
    reportWaitingForUser(options, result.sessionStatus);
    if (isJsonMode(options)) {
      printJson(result);
      return;
    }
    if (messages.length === 0) {
      process.stdout.write('No text messages found.\n');
      return;
    }
    if (isQuietMode(options)) {
      process.stdout.write(`${messages.map((message) => message.text).join('\n\n')}\n`);
      return;
    }
    process.stdout.write(`${messages.map(formatTextMessage).join('\n\n---\n\n')}\n`);
    return;
  }

  if (action === 'send' || action === 'fork') {
    const { sessionId } = assertSessionTarget(options);
    const payload = buildSessionPromptPayload(options, action);
    validateActionWaitOptions(options, action);
    const port = await resolveTargetPort(options);
    const controlInput: ControlInput = {
      ...payload,
      sessionId,
      wait: options.wait === true,
      lastAssistant: options.lastAssistant === true,
    };
    if (options.timeout !== undefined) controlInput.timeout = Number(options.timeout);
    const rawResult: unknown = await requestControlAction(port, `session.${action}`, controlInput, options);
    const result = sessionActionResponseSchema.parse(rawResult ?? {});
    const { sessionStatus, lastAssistantMessage } = result;
    reportWaitingForUser(options, sessionStatus);
    if (isJsonMode(options)) {
      printJson(result);
      return;
    }
    if (isQuietMode(options)) {
      process.stdout.write(`${result.sessionId || ''}\n`);
      if (lastAssistantMessage?.text) process.stdout.write(`${lastAssistantMessage.text}\n`);
      return;
    }
    clackIntro(action === 'fork' ? 'Session Forked' : 'Session Prompt Sent');
    logStatus('success', result.sessionId || `${action} completed`, `directory: ${result.directory || 'unknown'}`);
    if (result.promptDispatched) {
      logStatus('info', result.dispatchedAsCommand ? 'command dispatched' : 'prompt dispatched');
    }
    if (result.goalEnabled) {
      logStatus('info', 'goal mode active', result.goalTokenBudget ? `budget: ${result.goalTokenBudget}` : undefined);
    }
    if (sessionStatus) logStatus('info', `session status: ${sessionStatus.type}`);
    clackOutro(action === 'fork' ? 'forked' : 'sent');
    if (lastAssistantMessage) process.stdout.write(`\n${formatTextMessage(lastAssistantMessage)}\n`);
    return;
  }

  if (action !== 'create') {
    throw new TunnelCliError(`Unknown session command '${action}'.`, EXIT_CODE.USAGE_ERROR);
  }

  const payload = buildSessionCreatePayload(options);
  validateActionWaitOptions(options, 'create');
  const port = await resolveTargetPort(options);
  const controlPayload: ControlInput = {
    wait: options.wait === true,
    lastAssistant: options.lastAssistant === true,
  };
  if (payload.directory !== undefined) controlPayload.directory = payload.directory;
  if (payload.projectId !== undefined) controlPayload.projectId = payload.projectId;
  if (payload.title !== undefined) controlPayload.title = payload.title;
  if (payload.prompt !== undefined) controlPayload.prompt = payload.prompt;
  if (payload.model !== undefined) controlPayload.model = payload.model;
  if (payload.agent !== undefined) controlPayload.agent = payload.agent;
  if (payload.variant !== undefined) controlPayload.variant = payload.variant;
  if (payload.goal !== undefined) controlPayload.goal = payload.goal;
  if (payload.goalTokenBudget !== undefined) controlPayload.goalTokenBudget = payload.goalTokenBudget;
  if (payload.setUpstream !== undefined) controlPayload.setUpstream = payload.setUpstream;
  if (payload.worktree) {
    controlPayload.worktree = payload.worktree.name;
    controlPayload.branch = payload.worktree.branchName;
    controlPayload.startRef = payload.worktree.startRef;
  }
  if (options.timeout !== undefined) controlPayload.timeout = Number(options.timeout);
  const rawResult: unknown = await requestControlAction(port, 'session.create', controlPayload, options);
  const result = sessionActionResponseSchema.parse(rawResult ?? {});
  const { sessionStatus, lastAssistantMessage } = result;
  reportWaitingForUser(options, sessionStatus);

  if (isJsonMode(options)) {
    printJson(result);
    return;
  }
  if (isQuietMode(options)) {
    process.stdout.write(`${result.sessionId || ''}\n`);
    if (lastAssistantMessage?.text) process.stdout.write(`${lastAssistantMessage.text}\n`);
    return;
  }

  clackIntro('Session Created');
  logStatus('success', result.sessionId || 'session created', `directory: ${result.directory || 'unknown'}`);
  if (result.worktree?.path) {
    logStatus('info', `worktree: ${result.worktree.branch || result.worktree.name || 'created'}`, result.worktree.path);
  }
  if (result.promptDispatched) {
    logStatus('info', result.dispatchedAsCommand ? 'initial command dispatched' : 'initial prompt dispatched');
  }
  if (result.goalEnabled) {
    logStatus('info', 'goal mode active', result.goalTokenBudget ? `budget: ${result.goalTokenBudget}` : undefined);
  }
  if (sessionStatus) {
    logStatus('info', `session status: ${sessionStatus.type}`);
  }
  clackOutro('created');
  if (lastAssistantMessage) {
    process.stdout.write(`\n${formatTextMessage(lastAssistantMessage)}\n`);
  }
}

export {
  sessionCommand,
  buildSessionCreatePayload,
  buildSessionPromptPayload,
  formatSessionLine,
};
