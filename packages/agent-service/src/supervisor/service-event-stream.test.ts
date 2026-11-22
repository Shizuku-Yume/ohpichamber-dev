import { expect, test } from 'bun:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { get, createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionManager } from '@oh-my-pi/pi-coding-agent/session/session-manager';
import { z } from 'zod';
import { RuntimeSessionSchema } from '@openchamber/agent-contract';
import { SessionRegistry } from '../sessions/registry.ts';
import { AgentService } from './service.ts';

const ListeningPortSchema = z.object({ port: z.number().int().positive() });

test('the authenticated session stream delivers a replayed backlog in order across a real socket', async () => {
  const root = await mkdtemp(join(tmpdir(), 'service-event-stream-'));
  const previousHome = process.env.HOME;
  process.env.HOME = root;
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await Promise.all([cwd, agentDirectory].map(directory => mkdir(directory, { recursive: true })));
  const sessionsDirectory = SessionManager.getDefaultSessionDir(cwd, agentDirectory);
  const manager = SessionManager.create(cwd, sessionsDirectory);
  manager.appendMessage({ role: 'user', content: 'Stream replay prompt', timestamp: Date.now() });
  await manager.ensureOnDisk();
  await manager.flush();
  const sessionFile = manager.getSessionFile();
  await manager.close();
  if (!sessionFile) throw new Error('Native session file is required');
  const secret = randomBytes(32).toString('hex');
  const rootSessionId = randomUUID();
  const projectId = randomUUID();
  const workspaceId = randomUUID();
  const env = { HOME: root, USERPROFILE: root, PI_CONFIG_DIR: '.omp', PI_CODING_AGENT_DIR: agentDirectory,
    OMP_PROFILE: '', PI_PROFILE: '', XDG_CONFIG_HOME: join(root, 'config'), XDG_DATA_HOME: join(root, 'data'),
    XDG_STATE_HOME: join(root, 'state-home'), XDG_CACHE_HOME: join(root, 'cache') };
  const bootstrap = { rootSessionId, projectId, workspaceId, cwd, agentDirectory, agentDirectoryId: 'stream-owner', displayPath: 'workspace', env };
  const port = await new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const bound = ListeningPortSchema.safeParse(probe.address());
      probe.close(() => bound.success ? resolve(bound.data.port) : reject(new Error('A loopback port is required')));
    });
  });
  const service = new AgentService({
    workerEntrypoint: fileURLToPath(new URL('../worker/index.ts', import.meta.url)),
    internalSecret: secret,
    stateDirectory: join(root, 'service-state'),
    port,
    policyCheck: async () => ({ allowed: true }),
    invokeHostAction: async () => { throw new Error('Unexpected Host action'); },
    hostSkillSource: async operation => operation.action === 'reconcile'
      ? { status: 'reconciled', sources: { workspace: '0', agent: '0' } }
      : { status: 'failed', code: 'SERVICE_UNAVAILABLE' },
  });
  try {
    await service.start();
    const request = async (pathname: string, init: RequestInit = {}) => {
      const headers = new Headers({ 'x-internal-secret': secret, accept: 'application/json' });
      if (init.body) headers.set('content-type', 'application/json');
      const response = await fetch(`http://127.0.0.1:${port}${pathname}`, { ...init, headers });
      return { status: response.status, body: await response.json() };
    };
    expect((await request(`/internal/workspaces/${encodeURIComponent(workspaceId)}`, { method: 'POST',
      body: JSON.stringify({ projectId, cwd, agentDirectory, agentDirectoryId: 'stream-owner', env }) })).status).toBe(201);
    const created = await request('/internal/sessions', { method: 'POST', body: JSON.stringify({ ...bootstrap, sessionFile, sessionsDirectory }) });
    if (created.status !== 201) throw new Error(JSON.stringify(created.body));
    expect(RuntimeSessionSchema.parse(created.body).sessionId).toBe(rootSessionId);

    // AgentService keeps its registry private; the test seeds the real route's
    // journal with a backlog, so reach it through a runtime-checked lookup.
    const sessions: unknown = Object.getOwnPropertyDescriptor(service, 'sessions')?.value;
    if (!(sessions instanceof SessionRegistry)) throw new Error('AgentService did not expose a SessionRegistry');
    const journal = sessions.journal(rootSessionId);
    const { epoch, headSequence } = journal.runtime();
    const cursor = `${epoch}:${headSequence}`;
    const events = journal.append(Array.from({ length: 1000 }, (_, index) => ({
      timestamp: 2,
      event: { type: 'tool.started' as const, toolCallId: `tool${index}`, toolName: 'bash', input: { arguments: ['x'.repeat(1024)] } },
    })));

    const body = await new Promise<string>((resolve, reject) => {
      const stream = get({ host: '127.0.0.1', port,
        path: `/api/agent/v1/sessions/${encodeURIComponent(rootSessionId)}/events?cursor=${encodeURIComponent(cursor)}`,
        headers: { 'x-internal-secret': secret, accept: 'text/event-stream' },
      }, response => {
        expect(response.statusCode).toBe(200);
        expect(response.headers['content-type']?.split(';')[0]).toBe('text/event-stream');
        let text = '';
        let counted = 0;
        let received = 0;
        response.on('data', chunk => {
          text += chunk.toString('utf8');
          let boundary: number;
          while ((boundary = text.indexOf('\n\n', counted)) >= 0) { received += 1; counted = boundary + 2; }
          // A healthy SSE stream stays open, so the replay's frame count ends it.
          if (received >= events.length) { response.destroy(); resolve(text); }
        });
        response.on('end', () => resolve(text));
        response.on('error', reject);
      });
      stream.on('error', reject);
    });
    expect(body).not.toContain('stream.invalidated');
    const ids = body.split('\n\n').flatMap(frame => {
      const match = /^id: (.*)$/m.exec(frame);
      return match ? [match[1]!] : [];
    });
    expect(ids).toEqual(events.map(event => `${event.epoch}:${event.sequence}`));
  } finally {
    await service.stop();
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  }
}, 90000);
