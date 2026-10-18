import { WorkerCommandSchema } from '../protocol.ts';
import type { CompletionWorkerBootstrap, UsageWorkerBootstrap, WorkerBootstrapMessage, WorkerReply } from '../protocol.ts';
import { ProblemCodeSchema } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerSession } from './session.ts';
import { StatelessWorker } from './stateless.ts';
import { WorkerPolicy } from './policy.ts';
import { NativeMcpError } from './mcp.ts';
import { WorkerHostActions } from './host-actions.ts';
import { getUsageStats, getUsageTools } from './usage.ts';

function nativeMcpStatus(error: NativeMcpError): number {
  switch (error.code) {
    case 'CATALOG_CONFLICT': case 'WORKER_GENERATION_CONFLICT': case 'MCP_OAUTH_CANCELLED': return 409;
    case 'MCP_OAUTH_NOT_FOUND': return 404;
    case 'MCP_CREDENTIAL_UNAVAILABLE': return 422;
    case 'MCP_OAUTH_FAILED': return error.retryable ? 502 : 422;
    default: return 503;
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
    if (stopping || command.workerGeneration !== bootstrap?.workerGeneration) return;
    const owned = resources;
    const usage = command.operation.type === 'usage.stats' || command.operation.type === 'usage.tools';
    if ((!owned && !usage) || (usage && bootstrap?.type !== 'usage.bootstrap')) {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId, status: 503, code: 'SERVICE_UNAVAILABLE' });
      return;
    }
    // Deliberately not serialized: cancel/abort/interactive replies must interrupt active work.
    void (async () => {
      if (command.operation.type === 'usage.stats') return { type: 'usage.stats' as const, result: await getUsageStats(command.operation.query, command.operation.references) };
      if (command.operation.type === 'usage.tools') return { type: 'usage.tools' as const, result: await getUsageTools(command.operation.query, command.operation.references) };
      if (!owned) throw new Error('Worker resources are unavailable');
      if (owned instanceof StatelessWorker) send({ type: 'policy.snapshot', workerGeneration: command.workerGeneration, snapshot: await owned.authorizationPolicy() });
      const result = await owned.operation(command.operation);
      if (owned instanceof StatelessWorker) send({ type: 'policy.snapshot', workerGeneration: command.workerGeneration, snapshot: await owned.authorizationPolicy() });
      return result;
    })().then(result => {
      send({ type: 'result', workerGeneration: command.workerGeneration, commandId: command.commandId, result });
    }).catch(error => {
      const nativeCode = error instanceof NativeMcpError ? ProblemCodeSchema.safeParse(error.code) : undefined;
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId,
        status: error instanceof ProjectionError ? error.status : error instanceof NativeMcpError ? nativeMcpStatus(error) : 503,
        code: error instanceof ProjectionError ? error.code : nativeCode?.success ? nativeCode.data : 'SERVICE_UNAVAILABLE' });
    });
    return;
  }
  if (bootstrap || stopping) return;
  bootstrap = command;
  if (command.type === 'usage.bootstrap') {
    // Cold reporting never constructs providers, AuthStorage, a live session, or the policy runtime.
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
      if (payload.description) reply.solutionSpace = payload.description;
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
    if (!stopping) send({ type: 'error', workerGeneration: command.workerGeneration, code });
    void stop(1);
  });
});
process.once('disconnect', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });
process.once('SIGINT', () => { void stop(0); });
