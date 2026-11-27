import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { WorkerApprovalPolicy, WorkerBootstrap, WorkerInfo, WorkerOperation, WorkerOperationResult } from '../protocol.ts';
import { WorkerOperationError, WorkerRegistry } from '../supervisor/workers.ts';
import { SessionRegistry } from './registry.ts';

type Callbacks = ConstructorParameters<typeof WorkerRegistry>[0]['callbacks'];

/**
 * The worker stand-in: admissions are answered in memory, and each behavior
 * the receipt tests need — acceptance, death before answering, refusal — is
 * one flagged branch. No module mocking: this subclasses the real registry's
 * dependency exactly like the neighboring admission test.
 */
class ReceiptWorkers extends WorkerRegistry {
  behavior: 'accept' | 'die' | 'refuse' = 'accept';
  readonly prompts: WorkerOperation[] = [];
  private readonly callbacks: NonNullable<Callbacks>;
  constructor(callbacks: NonNullable<Callbacks>) {
    super({ workerEntrypoint: 'unused-test-worker' });
    this.callbacks = callbacks;
  }
  override async start(input: WorkerBootstrap, _replace?: boolean, _policies?: WorkerApprovalPolicy[], _restartGeneration?: string): Promise<WorkerInfo> {
    this.callbacks.onOpened?.(input.rootSessionId, 'generation', join(input.cwd, 'session.jsonl'), {
      createdAt: 1, updatedAt: 1, mode: { kind: 'main' },
      branch: { branchId: 'branch', branchVersion: '1', leafMessageId: null }, turns: [], messages: [],
    });
    return {
      rootSessionId: input.rootSessionId, workspaceId: input.workspaceId, projectId: input.projectId,
      workerGeneration: 'generation', state: 'ready',
    };
  }
  override async request(rootSessionId: string, operation: WorkerOperation): Promise<WorkerOperationResult> {
    if (operation.type !== 'prompt') throw new Error(`Unexpected operation ${operation.type}`);
    this.prompts.push(operation);
    if (this.behavior === 'die') {
      // Transport loss inside the service: the request never settles into an
      // answer, so the service cannot know whether the worker admitted the
      // run. No receipt row may exist for this correlation id afterwards.
      throw new WorkerOperationError(503, 'SERVICE_UNAVAILABLE', 'The worker did not answer the operation in time');
    }
    if (this.behavior === 'refuse') throw new WorkerOperationError(409, 'RUN_ACTIVE', 'The worker refused the prompt');
    this.callbacks.onEvents?.(rootSessionId, 'generation', [
      { timestamp: 1, event: { type: 'run.started', runId: operation.runId, origin: 'host', createdAt: 1 } },
    ]);
    return { type: 'prompt', run: { runId: operation.runId, sessionId: rootSessionId, status: 'running', origin: 'host', createdAt: 1 } };
  }
  /** Settle the run admission opened, the way a worker finishing the turn does. */
  completeRun(rootSessionId: string, runId: string): void {
    this.callbacks.onEvents?.(rootSessionId, 'generation', [
      { timestamp: 2, event: { type: 'run.completed', runId, finishedAt: 2 } },
    ]);
  }
}


const promptOperation = (correlationId?: string) => {
  const base = {
    type: 'prompt' as const, runId: `run-${correlationId ?? 'plain'}`,
    request: {
      input: { text: 'Prompt', attachments: [], context: [] },
      options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
    },
  };
  if (correlationId === undefined) return base;
  return { ...base, correlationId };
};

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'session-receipts-'));
  const stateDirectory = join(root, 'state');
  await mkdir(stateDirectory);
  const workers = new ReceiptWorkers({
    onOpened: (...args) => registry.onOpened(...args),
    onEvents: (...args) => registry.onEvents(...args),
    onInteraction: (...args) => registry.onInteraction(...args),
    onExit: (...args) => registry.onExit(...args),
  });
  const registry = new SessionRegistry(stateDirectory, workers);
  await registry.initialize();
  await registry.open({
    rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace',
    cwd: root, agentDirectory: join(root, 'agent'), displayPath: 'workspace',
  });
  return { root, stateDirectory, workers, registry };
}

test('an accepted admission writes a durable accepted receipt keyed by the correlation id', async () => {
  const { root, workers, registry } = await fixture();
  try {
    const run = await registry.prompt('root', promptOperation('corr-accept'));
    expect(run.runId).toBe('run-corr-accept');
    const receipt = registry.promptReceipt('root', 'corr-accept');
    expect(receipt).toMatchObject({ outcome: 'accepted', runId: 'run-corr-accept', operation: 'send', sessionId: 'root' });
    expect(receipt?.expiresAt).toBeGreaterThan(Date.now());
    expect(workers.prompts).toHaveLength(1);
    // No correlation id, no row: direct service tests and older Hosts keep
    // the pre-receipt behavior exactly. The first run must settle before a
    // second prompt is admissible at all.
    workers.completeRun('root', 'run-corr-accept');
    await registry.prompt('root', promptOperation());
    expect(registry.promptReceipt('root', 'corr-plain')).toBeNull();
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('the accepted receipt survives a full service restart and answers from the cold session', async () => {
  const { root, stateDirectory, registry } = await fixture();
  try {
    await registry.prompt('root', promptOperation('corr-restart'));
    await registry.close();

    // Reopen the service against the same state directory. The session is
    // cold — no worker, never reopened — which is exactly the interrupted-send
    // case the query exists for.
    const workers = new ReceiptWorkers({
      onOpened: (...args) => reopened.onOpened(...args),
      onEvents: (...args) => reopened.onEvents(...args),
      onInteraction: (...args) => reopened.onInteraction(...args),
      onExit: (...args) => reopened.onExit(...args),
    });
    const reopened = new SessionRegistry(stateDirectory, workers);
    await reopened.initialize();
    const receipt = reopened.promptReceipt('root', 'corr-restart');
    expect(receipt).toMatchObject({ outcome: 'accepted', runId: 'run-corr-restart', sessionId: 'root' });
    expect(workers.prompts).toHaveLength(0);
    await reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a worker crash during admission leaves no receipt row: the answer stays unknown', async () => {
  const { root, workers, registry } = await fixture();
  try {
    workers.behavior = 'die';
    await expect(registry.prompt('root', promptOperation('corr-crash'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    // Neither accepted nor rejected is durably true here, so no row exists:
    // the client-facing truth is `unknown`, never a fabricated rejection.
    expect(registry.promptReceipt('root', 'corr-crash')).toBeNull();
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a deterministic refusal writes the rejected receipt before the refusal is thrown', async () => {
  const { root, workers, registry } = await fixture();
  try {
    // Admission-registered-but-runtime-running: a prompt behind an active run
    // is refused before the worker is ever asked.
    await registry.prompt('root', promptOperation('corr-first'));
    await expect(registry.prompt('root', promptOperation('corr-blocked'))).rejects.toMatchObject({ code: 'RUN_ACTIVE' });
    const receipt = registry.promptReceipt('root', 'corr-blocked');
    expect(receipt).toMatchObject({ outcome: 'rejected', code: 'RUN_ACTIVE', sessionId: 'root', operation: 'send' });
    // The worker saw exactly one prompt: the refusal never reached admission.
    expect(workers.prompts).toHaveLength(1);
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('resubmission with the same correlation id replays the original acceptance instead of re-running the prompt', async () => {
  const { root, workers, registry } = await fixture();
  try {
    const first = await registry.prompt('root', promptOperation('corr-dupe'));
    expect(first.runId).toBe('run-corr-dupe');
    // The run settled (no active-run refusal), then the identical logical
    // send arrives again — the transport retry after a lost response. It must
    // not run twice: the durable receipt is the answer.
    workers.completeRun('root', 'run-corr-dupe');
    const replayed = await registry.prompt('root', promptOperation('corr-dupe'));
    expect(replayed.runId).toBe('run-corr-dupe');
    expect(workers.prompts).toHaveLength(1);
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('resubmission of a rejected correlation id re-enters admission and upgrades the receipt once the refusal cause clears', async () => {
  const { root, workers, registry } = await fixture();
  try {
    await registry.prompt('root', promptOperation('corr-live'));
    await expect(registry.prompt('root', promptOperation('corr-refused'))).rejects.toMatchObject({ code: 'RUN_ACTIVE' });
    expect(registry.promptReceipt('root', 'corr-refused')).toMatchObject({ outcome: 'rejected', code: 'RUN_ACTIVE' });
    const promptsBefore = workers.prompts.length;
    // Rejected rows serve the query only: once the blocking run settles, the
    // resubmission is admitted anew — a cold-retry recovery can never strand a
    // send behind a stale rejection.
    workers.completeRun('root', 'run-corr-live');
    const recovered = await registry.prompt('root', promptOperation('corr-refused'));
    expect(recovered.runId).toBe('run-corr-refused');
    expect(workers.prompts.length).toBe(promptsBefore + 1);
    // The upgrade is durable: the query answers the accepted receipt, and the
    // next resubmission replays that acceptance instead of re-running.
    expect(registry.promptReceipt('root', 'corr-refused')).toMatchObject({ outcome: 'accepted', runId: 'run-corr-refused' });
    workers.completeRun('root', 'run-corr-refused');
    const replayed = await registry.prompt('root', promptOperation('corr-refused'));
    expect(replayed.runId).toBe('run-corr-refused');
    expect(workers.prompts.length).toBe(promptsBefore + 1);
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a rejection replayed over an accepted row never downgrades the accepted receipt', async () => {
  const { root, workers, registry } = await fixture();
  try {
    await registry.prompt('root', promptOperation('corr-won'));
    expect(registry.promptReceipt('root', 'corr-won')).toMatchObject({ outcome: 'accepted' });
    // The resubmission replays the acceptance without touching admission, so a
    // rejection write can only arrive out of order — the first-write-wins rule
    // keeps the accepted row regardless.
    workers.completeRun('root', 'run-corr-won');
    await registry.prompt('root', promptOperation('corr-won'));
    expect(registry.promptReceipt('root', 'corr-won')).toMatchObject({ outcome: 'accepted', runId: 'run-corr-won' });
    expect(workers.prompts).toHaveLength(1);
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a replayed acceptance reports the real run status once the run settled', async () => {
  const { root, workers, registry } = await fixture();
  try {
    await registry.prompt('root', promptOperation('corr-truth'));
    workers.completeRun('root', 'run-corr-truth');
    const replayed = await registry.prompt('root', promptOperation('corr-truth'));
    expect(replayed).toMatchObject({ runId: 'run-corr-truth', status: 'completed', finishedAt: 2 });
    expect(workers.prompts).toHaveLength(1);
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a corrupt cold transcript fails the replay as SESSION_RESTORE_FAILED instead of a false running answer', async () => {
  const { root, stateDirectory, workers, registry } = await fixture();
  try {
    await registry.prompt('root', promptOperation('corr-corrupt'));
    workers.completeRun('root', 'run-corr-corrupt');
    await registry.close();

    const referenceRows = z.object({ references: z.record(z.string(), z.object({ sessionFile: z.string() })) }).parse(
      JSON.parse(await readFile(join(stateDirectory, 'session-references.json'), 'utf8')),
    );
    const row = referenceRows.references.root;
    if (!row) throw new Error('The test fixture lost its root reference');
    const sessionFile = row.sessionFile;
    await writeFile(sessionFile, 'not a transcript at all  ');

    const restartedWorkers = new ReceiptWorkers({
      onOpened: (...args) => restarted.onOpened(...args),
      onEvents: (...args) => restarted.onEvents(...args),
      onInteraction: (...args) => restarted.onInteraction(...args),
      onExit: (...args) => restarted.onExit(...args),
    });
    const restarted = new SessionRegistry(stateDirectory, restartedWorkers);
    await restarted.initialize();
    await expect(restarted.prompt('root', promptOperation('corr-corrupt'))).rejects.toMatchObject({ status: 503, code: 'SESSION_RESTORE_FAILED' });
    expect(restartedWorkers.prompts).toHaveLength(0);
    await restarted.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a never-registered session receipt query is 404 SESSION_NOT_FOUND, distinct from a registered unknown answer', async () => {
  const { root, registry } = await fixture();
  try {
    expect(() => registry.promptReceipt('never-registered', 'corr-any')).toThrowError(expect.objectContaining({ status: 404, code: 'SESSION_NOT_FOUND' }));
    expect(registry.promptReceipt('root', 'corr-any')).toBeNull();
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);

test('a rejected receipt detail stays the fixed public wording even when the refusal message embeds journal cause text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'session-receipts-sanitized-'));
  const stateDirectory = join(root, 'state');
  await mkdir(stateDirectory);
  const workers = new ReceiptWorkers({
    onOpened: (...args) => registry.onOpened(...args),
    onEvents: (...args) => registry.onEvents(...args),
    onInteraction: (...args) => registry.onInteraction(...args),
    onExit: (...args) => registry.onExit(...args),
  });
  const registry = new SessionRegistry(stateDirectory, workers);
  await registry.initialize();
  await registry.open({
    rootSessionId: 'root', projectId: 'project', workspaceId: 'workspace',
    cwd: root, agentDirectory: join(root, 'agent'), displayPath: 'workspace',
  });
  try {
    // A catalog-registration failure transitions the journal to unavailable
    // with the raw cause — paths and endpoint material the durable receipt
    // must never persist. The refusal thrown to the caller keeps the richer
    // message; only the stored row is constrained to the fixed per-code wording.
    registry.registrationFailed('root', 'generation', 'sensitive cause: /home/user/private/path token=secret');
    await expect(registry.prompt('root', promptOperation('corr-sensitive'))).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    const receipt = registry.promptReceipt('root', 'corr-sensitive');
    expect(receipt).toMatchObject({ outcome: 'rejected', code: 'SERVICE_UNAVAILABLE' });
    if (receipt?.outcome === 'rejected') {
      expect(receipt.detail).toBe('The session runtime is unavailable');
      expect(receipt.detail).not.toContain('/home/user');
      expect(receipt.detail).not.toContain('secret');
    }
    await registry.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
