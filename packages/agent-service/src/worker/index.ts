import { operationErrorDetail, WorkerCommandSchema } from '../protocol.ts';
import type { CompletionWorkerBootstrap, UsageWorkerBootstrap, WorkerBootstrapMessage, WorkerOperation, WorkerReply } from '../protocol.ts';
import { ProblemCodeSchema } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerSession } from './session.ts';
import { StatelessWorker } from './stateless.ts';
import { WorkerPolicy } from './policy.ts';
import { NativeMcpError } from './mcp.ts';
import { WorkerHostActions } from './host-actions.ts';
import { getUsageAccounts, getUsageStats, getUsageTools } from './usage.ts';
import { closePrewarmedNativeRuntime, prewarmNativeRuntime } from './native-runtime.ts';

/** The cause a thrown value carries, whatever its shape. A thrown string is a
 * cause the worker chose, not a missing one; only a value with nothing readable
 * falls back to a sentence that says so. */
function operationCause(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return 'The operation failed without a reported cause';
}

function nativeMcpStatus(error: NativeMcpError): number {
  switch (error.code) {
    case 'CATALOG_CONFLICT': case 'WORKER_GENERATION_CONFLICT': case 'MCP_OAUTH_CANCELLED': case 'MCP_OAUTH_IN_PROGRESS': return 409;
    case 'MCP_OAUTH_NOT_FOUND': return 404;
    case 'MCP_CREDENTIAL_UNAVAILABLE': return 422;
    case 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED': return 422;
    case 'MCP_OAUTH_FAILED': return error.retryable ? 502 : 422;
    default: return 503;
  }
}

/**
 * Operations that only read native state. None of them can change the catalog,
 * credentials, settings or MCP configuration an authorization policy is
 * captured from, so the snapshot around them would repeat what the worker
 * already published. Skipping both captures keeps a repeated catalog read off
 * the native settings and policy path; every mutation and the bootstrap still
 * publish, so admission always sees a policy as fresh as the last change.
 */
function isReadOnlyOperation(operation: WorkerOperation): boolean {
  if (operation.type === 'mcp.configuration.read') return true;
  if (operation.type !== 'catalog') return false;
  switch (operation.operation.type) {
    case 'catalog.models.read': case 'catalog.providers.read': case 'catalog.agents.read':
    case 'catalog.settings.read': case 'catalog.warming.read': case 'skills.read': case 'skills.expand':
    case 'catalog.provider.accounts.read': case 'catalog.provider.account-selection.read': case 'catalog.provider.oauth.methods':
    case 'catalog.provider.models.enrich':
    case 'catalog.provider.configuration.read':
      return true;
    default:
      return false;
  }
}

let bootstrap: WorkerBootstrapMessage | CompletionWorkerBootstrap | UsageWorkerBootstrap | undefined;
let initialization: Promise<void> | undefined;
let resources: WorkerSession | StatelessWorker | undefined;
let policy: WorkerPolicy | undefined;
let hostActions: WorkerHostActions | undefined;
let stopping = false;
let shutdown: Promise<void> | undefined;

function send(reply: WorkerReply): void {
  if (!process.connected || !process.send) { void stop(1); return; }
  process.send(reply, error => { if (error) void stop(1); });
}

function stop(exitCode: number): Promise<void> {
  if (shutdown) return shutdown;
  stopping = true;
  try { process.stderr.write(`${JSON.stringify({ type: 'openchamber.diagnostic', level: 'info', code: 'WORKER_STOPPING', detail: `exitCode=${exitCode}` })}\n`); } catch { /* diagnostics never affect lifecycle */ }
  policy?.close();
  hostActions?.close();
  shutdown = (async () => {
    const deadline = setTimeout(() => process.exit(1), 5_000);
    deadline.unref();
    try {
      if (initialization) {
        try { await initialization; } catch { exitCode = 1; }
      }
      const owned = resources;
      resources = undefined;
      if (owned) {
        await owned.close();
        if (bootstrap && process.connected) send({ type: 'lifecycle', workerGeneration: bootstrap.workerGeneration, state: 'closed' });
      }
      await closePrewarmedNativeRuntime();
    } catch { exitCode = 1; }
    finally { clearTimeout(deadline); process.exit(exitCode); }
  })();
  return shutdown;
}

process.on('message', raw => {
  const parsed = WorkerCommandSchema.safeParse(raw);
  if (!parsed.success) return;
  const command = parsed.data;
  if (command.type === 'policy.result') {
    if (command.workerGeneration === bootstrap?.workerGeneration) policy?.settle(command.requestId, command.result);
    return;
  }
  if (command.type === 'action.result') {
    if (command.workerGeneration === bootstrap?.workerGeneration) hostActions?.settle(command.requestId, command.result);
    return;
  }
  if (command.type === 'stop') {
    if (command.workerGeneration === bootstrap?.workerGeneration) void stop(0);
    return;
  }
  if (command.type === 'operation') {
    // Never drop a generation- or stopping-gated operation silently: the
    // supervisor holds a pending entry per commandId and would wait forever.
    if (stopping) {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId, status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'The worker is stopping' });
      return;
    }
    if (command.workerGeneration !== bootstrap?.workerGeneration) {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId, status: 409, code: 'CATALOG_CONFLICT', detail: 'The worker generation does not match this process' });
      return;
    }
    const owned = resources;
    const usage = command.operation.type === 'usage.stats' || command.operation.type === 'usage.tools' || command.operation.type === 'usage.accounts';
    if ((!owned && !usage) || (usage && bootstrap?.type !== 'usage.bootstrap')) {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId, status: 503, code: 'SERVICE_UNAVAILABLE', detail: 'The worker resources needed by this operation are not available' });
      return;
    }
    // Deliberately not serialized: cancel/abort/interactive replies must interrupt active work.
    void (async () => {
      if (command.operation.type === 'usage.stats') return { type: 'usage.stats' as const, result: await getUsageStats(command.operation.query, command.operation.sessionFiles) };
      if (command.operation.type === 'usage.accounts') return { type: 'usage.accounts' as const, result: await getUsageAccounts(command.operation.query) };
      if (command.operation.type === 'usage.tools') return { type: 'usage.tools' as const, result: await getUsageTools(command.operation.query, command.operation.references) };
      if (!owned) throw new Error('Worker resources are unavailable');
      const publishPolicy = owned instanceof StatelessWorker && !isReadOnlyOperation(command.operation);
      if (publishPolicy) send({ type: 'policy.snapshot', workerGeneration: command.workerGeneration, snapshot: await owned.authorizationPolicy() });
      const result = await owned.operation(command.operation);
      if (publishPolicy) send({ type: 'policy.snapshot', workerGeneration: command.workerGeneration, snapshot: await owned.authorizationPolicy() });
      return result;
    })().then(result => {
      send({ type: 'result', workerGeneration: command.workerGeneration, commandId: command.commandId, result });
    }).catch((error: unknown) => {
      const nativeCode = error instanceof NativeMcpError ? ProblemCodeSchema.safeParse(error.code) : undefined;
      const code = error instanceof ProjectionError ? error.code : nativeCode?.success ? nativeCode.data : 'SERVICE_UNAVAILABLE';
      send({
        type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId,
        status: error instanceof ProjectionError ? error.status : error instanceof NativeMcpError ? nativeMcpStatus(error) : 503,
        code,
        // An MCP OAuth failure carries the provider's own sentence, which the
        // sign-in panel shows verbatim; other codes keep the short bound.
        detail: operationErrorDetail(code, operationCause(error))
      });
    });
    return;
  }
  if (bootstrap || stopping) return;
  bootstrap = command;
  if (command.type === 'usage.bootstrap') {
    // Cold reporting constructs no provider and no live session. Usage reads open OMP's configuration and credential store per request, and send no provider request except the bounded quota probe.
    send({ type: 'lifecycle', workerGeneration: command.workerGeneration, state: 'initialized' });
    send({ type: 'ready', workerGeneration: command.workerGeneration });
    return;
  }
  const authorization = new WorkerPolicy(command.workerGeneration, send);
  policy = authorization;
  hostActions = new WorkerHostActions(command.workerGeneration, send);
  if (command.type === 'completion.bootstrap') {
    initialization = StatelessWorker.open(command, authorization.authorize).then(async owned => {
      send({ type: 'policy.snapshot', workerGeneration: command.workerGeneration, snapshot: await owned.authorizationPolicy() });
      resources = owned;
      if (stopping) return;
      send({ type: 'lifecycle', workerGeneration: command.workerGeneration, state: 'initialized' });
      send({ type: 'ready', workerGeneration: command.workerGeneration });
    });
  } else {
    initialization = WorkerSession.open(command, inputs => {
      send({ type: 'events', workerGeneration: command.workerGeneration, inputs });
    }, interaction => {
      send({ type: 'interaction', workerGeneration: command.workerGeneration, request: interaction });
    }, () => { void stop(1); }, authorization.authorize, hostActions.invoke, snapshot => {
      send({ type: 'policy.snapshot', workerGeneration: command.workerGeneration, snapshot });
    }, payload => {
      const reply: Extract<WorkerReply, { type: 'subagent' }> = { type: 'subagent', workerGeneration: command.workerGeneration, subagentId: payload.id, status: payload.status, role: payload.agent };
      if (payload.parentToolCallId) reply.toolCallId = payload.parentToolCallId;
      if (payload.description) reply.description = payload.description;
      if (payload.assignment) reply.solutionSpace = payload.assignment;
      if (payload.sessionFile) reply.sessionFile = payload.sessionFile;
      send(reply);
    }).then(owned => {
      resources = owned;
      if (stopping) return;
      send({ type: 'opened', workerGeneration: command.workerGeneration, sessionFile: owned.sessionFile, seed: owned.seed() });
      send({ type: 'lifecycle', workerGeneration: command.workerGeneration, state: 'initialized' });
      send({ type: 'ready', workerGeneration: command.workerGeneration });
    });
  }
  void initialization.catch(error => {
    const code = error instanceof ProjectionError ? error.code : command.type === 'bootstrap' && command.sessionFile ? 'SESSION_RESTORE_FAILED' : 'SERVICE_UNAVAILABLE';
    // The codes are coarse (a projection rejection and a failed bootstrap share
    // SERVICE_UNAVAILABLE); the reason is what an operator can act on.
    const detail = error instanceof Error && error.message ? error.message.slice(0, 200) : undefined;
    // A projection refusal keeps its status so the Host can tell a refused
    // admission (no native session) from an uncertain one.
    const status = error instanceof ProjectionError ? error.status : undefined;
    if (!stopping) {
      const reply: Extract<WorkerReply, { type: 'error' }> = { type: 'error', workerGeneration: command.workerGeneration, code };
      if (status) reply.status = status;
      if (detail) reply.detail = detail;
      send(reply);
    }
    void stop(1);
  });
});
// The module graph is loaded and this process is waiting for a bootstrap.
// A supervisor that pre-warms a worker adopts it only after this reply, so
// the adoption cannot claim a process that has not finished loading.
if (process.connected) send({ type: 'idle' });
if (process.env.PI_CODING_AGENT_DIR) {
  // The `idle` reply above makes this process adoptable at module load. The
  // warm-up continues either way: a supervisor that can choose prefers the
  // spare that also reported `warm`, because adopting this one would move the
  // rest of the work into the session.
  void prewarmNativeRuntime({ cwd: process.cwd(), agentDirectory: process.env.PI_CODING_AGENT_DIR })
    .then(warmed => { if (warmed !== undefined && process.connected) send({ type: 'warm' }); });
}
process.once('disconnect', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });
process.once('SIGINT', () => { void stop(0); });
