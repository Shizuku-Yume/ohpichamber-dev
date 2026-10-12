import { WorkerCommandSchema } from '../protocol.ts';
import type { WorkerBootstrapMessage, WorkerReply } from '../protocol.ts';
import { ProjectionError } from '../projection/journal.ts';
import { WorkerSession } from './session.ts';

let bootstrap: WorkerBootstrapMessage | undefined;
let initialization: Promise<void> | undefined;
let resources: WorkerSession | undefined;
let stopping = false;
let shutdown: Promise<void> | undefined;

function send(reply: WorkerReply): void {
  if (!process.connected || !process.send) return;
  process.send(reply, error => { if (error) void stop(1); });
}

function stop(exitCode: number): Promise<void> {
  if (shutdown) return shutdown;
  stopping = true;
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
        if (bootstrap) send({ type: 'lifecycle', workerGeneration: bootstrap.workerGeneration, state: 'closed' });
      }
    } catch { exitCode = 1; }
    finally {
      clearTimeout(deadline);
      process.exit(exitCode);
    }
  })();
  return shutdown;
}

process.on('message', raw => {
  const parsed = WorkerCommandSchema.safeParse(raw);
  if (!parsed.success) return;
  const command = parsed.data;
  if (command.type === 'stop') {
    if (command.workerGeneration === bootstrap?.workerGeneration) void stop(0);
    return;
  }
  if (command.type === 'operation') {
    if (stopping || command.workerGeneration !== bootstrap?.workerGeneration) return;
    const owned = resources;
    if (!owned) {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId,
        status: 503, code: 'SERVICE_UNAVAILABLE' });
      return;
    }
    void owned.operation(command.operation).then(result => {
      send({ type: 'result', workerGeneration: command.workerGeneration, commandId: command.commandId, result });
    }).catch(error => {
      send({ type: 'operation.error', workerGeneration: command.workerGeneration, commandId: command.commandId,
        status: error instanceof ProjectionError ? error.status : 503,
        code: error instanceof ProjectionError ? error.code : 'SERVICE_UNAVAILABLE' });
    });
    return;
  }
  if (bootstrap || stopping) return;
  bootstrap = command;
  initialization = WorkerSession.open(command, inputs => {
    send({ type: 'events', workerGeneration: command.workerGeneration, inputs });
  }, () => { void stop(1); }).then(owned => {
    resources = owned;
    if (stopping) return;
    send({ type: 'opened', workerGeneration: command.workerGeneration, sessionFile: owned.sessionFile, seed: owned.seed() });
    send({ type: 'lifecycle', workerGeneration: command.workerGeneration, state: 'initialized' });
    send({ type: 'ready', workerGeneration: command.workerGeneration });
  });
  void initialization.catch(error => {
    if (!stopping) send({ type: 'error', workerGeneration: command.workerGeneration,
      code: error instanceof ProjectionError ? error.code : command.sessionFile ? 'SESSION_RESTORE_FAILED' : 'SERVICE_UNAVAILABLE' });
    void stop(1);
  });
});
process.once('disconnect', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });
process.once('SIGINT', () => { void stop(0); });
