import { WorkerCommandSchema } from '../protocol.ts';
import type { CompletionWorkerBootstrap, WorkerBootstrapMessage, WorkerReply } from '../protocol.ts';
import { ProblemCodeSchema } from '@openchamber/agent-contract';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerSession } from './session.ts';
import { StatelessWorker } from './stateless.ts';
import { WorkerPolicy } from './policy.ts';
import { NativeMcpError } from './mcp.ts';

function nativeMcpStatus(error: NativeMcpError): number {
  switch (error.code) {
    case 'CATALOG_CONFLICT': case 'WORKER_GENERATION_CONFLICT': case 'MCP_OAUTH_CANCELLED': return 409;
    case 'MCP_OAUTH_NOT_FOUND': return 404;
    case 'MCP_CREDENTIAL_UNAVAILABLE': return 422;
    case 'MCP_OAUTH_FAILED': return error.retryable ? 502 : 422;
    default: return 503;
  }
}

let bootstrap: WorkerBootstrapMessage | CompletionWorkerBootstrap | undefined;
let initialization: Promise<void> | undefined;
let resources: WorkerSession | StatelessWorker | undefined;
let policy: WorkerPolicy | undefined;
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
  if (command.type === 'stop') {
    if (command.workerGeneration === bootstrap?.workerGeneration) void stop(0);
    return;
  }
  if (command.type === 'operation') {
    if (stopping || command.workerGeneration !== bootstrap?.workerGeneration) return;
    const owned = resources;
    if (!owned) {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId, status: 503, code: 'SERVICE_UNAVAILABLE' });
      return;
    }
    // Deliberately not serialized: cancel/abort/interactive replies must interrupt active work.
    void owned.operation(command.operation).then(result => {
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
  const authorization = new WorkerPolicy(command.workerGeneration, send);
  policy = authorization;
  if (command.type === 'completion.bootstrap') {
    initialization = StatelessWorker.open(command, authorization.authorize).then(owned => {
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
    }, () => { void stop(1); }, authorization.authorize).then(owned => {
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
