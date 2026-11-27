import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { PromptReceiptResultSchema } from '@openchamber/agent-contract';
import { AgentService } from './service.ts';
import type { HostSkillSourceResult } from './file-resources-host-protocol.ts';

const ListeningPortSchema = z.object({ port: z.number().int().positive() });
const freePort = (): Promise<number> => {
  const { promise, resolve, reject } = Promise.withResolvers<number>();
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const address = ListeningPortSchema.safeParse(probe.address());
    probe.close(() => { if (address.success) resolve(address.data.port); else reject(new Error('A free loopback port is required')); });
  });
  return promise;
};

/**
 * The receipt query route over the real HTTP surface: one booted AgentService,
 * one deferred session (no worker wait), and the triple-shape answers the
 * design pins down — `unknown` as a 200, malformed ids as 400, unknown
 * sessions as 404 — plus the cold-session guarantee that no worker answers it.
 */
test('prompt-receipts route answers the triple shape over the real HTTP surface', async () => {
  const root = await mkdtemp(join(tmpdir(), 'service-receipts-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));

  const secret = randomBytes(32).toString('hex');
  const rootSessionId = randomUUID();
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const env = {
    HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
    OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state-home'), XDG_CACHE_HOME: join(root, 'cache'),
  };
  const port = await freePort();
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret,
    stateDirectory: join(root, 'service-state'),
    port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async (operation): Promise<HostSkillSourceResult> => {
      if (operation.action !== 'reconcile') return { status: 'failed', code: 'SERVICE_UNAVAILABLE' };
      return { status: 'reconciled', sources: { workspace: '0', agent: '0' } };
    },
  });

  try {
    await service.start();
    const request = async (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
      if (init.body) headers.set('content-type', 'application/json');
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
      return { status: response.status, body: z.json().parse(await response.json().catch(() => null)) };
    };

    const workspace = await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, {
      method: 'POST',
      body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'receipt-owner', env }),
    });
    expect(workspace.status).toBe(201);
    // Deferred admission: the session exists with its durable reference before
    // any worker answers, so the receipt path never depends on a live worker.
    const created = await request('/internal/sessions', {
      method: 'POST',
      body: JSON.stringify({
        rootSessionId, projectId, workspaceId, cwd, agentDirectory,
        agentDirectoryId: 'receipt-owner', displayPath: 'workspace', env, deferred: true,
      }),
    });
    expect(created.status).toBe(201);

    // No decision was ever made for this correlation id: the answer is a
    // well-formed 200 with status `unknown` — not an error, because "no
    // durable decision exists" is an authoritative answer the UI relies on.
    const correlationId = randomUUID();
    const unknown = await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/prompt-receipts/${encodeURIComponent(correlationId)}`);
    expect(unknown.status).toBe(200);
    expect(PromptReceiptResultSchema.parse(unknown.body)).toEqual({ status: 'unknown', correlationId, sessionId: rootSessionId });

    // A session the service never owned is a 404 SESSION_NOT_FOUND, distinct
    // from `unknown`: the receipt key is meaningless without its session.
    const missing = await request(`/api/agent/v1/sessions/${encodeURIComponent(randomUUID())}/prompt-receipts/${encodeURIComponent(correlationId)}`);
    expect(missing.status).toBe(404);

    // Malformed route identities are 400 INVALID_REQUEST before any lookup.
    const malformed = await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/prompt-receipts/%ZZ`);
    expect(malformed.status).toBe(400);

    // A submission refused before worker dispatch leaves a rejected receipt
    // the route answers without any worker round-trip. Steer is the
    // deterministic pre-dispatch refusal: this session has no active run, so
    // admission rejects it with RUN_NOT_FOUND before the worker is asked.
    const rejectedCorrelation = randomUUID();
    const steerBody = () => JSON.stringify({
      correlationId: rejectedCorrelation,
      request: {
        input: { text: 'Receipt probe', attachments: [], context: [] },
        options: { providerId: null, modelId: null, agentId: null, variant: null, reasoningEffort: null },
      },
    });
    const refused = await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/steer`, {
      method: 'POST',
      body: steerBody(),
    });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.status).toBeLessThan(500);
    const rejected = await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/prompt-receipts/${encodeURIComponent(rejectedCorrelation)}`);
    expect(rejected.status).toBe(200);
    const parsed = PromptReceiptResultSchema.parse(rejected.body);
    expect(parsed.status).toBe('rejected');
    if (parsed.status === 'rejected') {
      expect(parsed.receipt.sessionId).toBe(rootSessionId);
      expect(parsed.receipt.correlationId).toBe(rejectedCorrelation);
      expect(parsed.receipt.operation).toBe('steer');
      expect(parsed.receipt.expiresAt).toBeGreaterThan(Date.now());
    }

    // Resubmission with the same correlation id does not replay the rejection:
    // rejected rows serve the query only, so the same deterministic refusal is
    // re-derived through admission — never a cached answer, never a new outcome.
    const replayed = await request(`/internal/sessions/${encodeURIComponent(rootSessionId)}/steer`, {
      method: 'POST',
      body: steerBody(),
    });
    expect(replayed.status).toBe(refused.status);
    expect(PromptReceiptResultSchema.parse((await request(`/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/prompt-receipts/${encodeURIComponent(rejectedCorrelation)}`)).body)).toMatchObject({ status: 'rejected' });
  } finally {
    await service.stop();
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
