import { createAgentSession, discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { WorkerCommandSchema } from '../protocol.ts';
import type { WorkerBootstrapMessage, WorkerReply } from '../protocol.ts';

type Session = Awaited<ReturnType<typeof createAgentSession>>['session'];
type AuthStorage = Awaited<ReturnType<typeof discoverAuthStorage>>;
interface Resources {
  session: Session;
  authStorage: AuthStorage;
}

let bootstrap: WorkerBootstrapMessage | undefined;
let initialization: Promise<void> | undefined;
let resources: Resources | undefined;
let stopping = false;
let shutdown: Promise<void> | undefined;

function send(reply: WorkerReply): void {
  if (!process.connected || !process.send) return;
  process.send(reply, error => { if (error) void stop(1); });
}

async function initialize(input: WorkerBootstrapMessage): Promise<Resources> {
  const authStorage = await discoverAuthStorage(input.agentDirectory, { cwd: input.cwd });
  let manager: SessionManager | undefined;
  try {
    const directory = input.sessionsDirectory ?? SessionManager.getDefaultSessionDir(input.cwd, input.agentDirectory);
    manager = SessionManager.create(input.cwd, directory);
    const result = await createAgentSession({
      cwd: input.cwd,
      agentDir: input.agentDirectory,
      sessionManager: manager,
      authStorage,
      enableMCP: false,
      enableLsp: false,
      disableExtensionDiscovery: true,
      hasUI: false,
    });
    return { session: result.session, authStorage };
  } catch (error) {
    try { await manager?.close(); } finally { authStorage.close(); }
    throw error;
  }
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
        // AgentSession.dispose seals and closes its supplied SessionManager.
        try { await owned.session.dispose(); } finally { owned.authStorage.close(); }
        if (bootstrap) send({ type: 'lifecycle', workerGeneration: bootstrap.workerGeneration, state: 'closed' });
      }
    } catch {
      exitCode = 1;
    } finally {
      clearTimeout(deadline);
      process.exit(exitCode);
    }
  })();
  return shutdown;
}

process.on('message', raw => {
  const command = WorkerCommandSchema.safeParse(raw);
  if (!command.success) return;
  const input = command.data;
  if (input.type === 'stop') {
    if (input.workerGeneration === bootstrap?.workerGeneration) void stop(0);
    return;
  }
  if (bootstrap || stopping) return;
  bootstrap = input;
  initialization = initialize(input).then(owned => {
    resources = owned;
    if (stopping) return;
    send({ type: 'lifecycle', workerGeneration: input.workerGeneration, state: 'initialized' });
    send({ type: 'ready', workerGeneration: input.workerGeneration });
  });
  void initialization.catch(() => {
    if (!stopping) send({ type: 'error', workerGeneration: input.workerGeneration });
    void stop(1);
  });
});
process.once('disconnect', () => { void stop(0); });
process.once('SIGTERM', () => { void stop(0); });
process.once('SIGINT', () => { void stop(0); });
