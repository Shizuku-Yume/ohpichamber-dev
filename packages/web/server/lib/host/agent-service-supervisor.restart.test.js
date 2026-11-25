import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAgentServiceSupervisor } from './agent-service-supervisor.js';

const registry = {
  reapOrphanedProcesses: vi.fn(async () => ({ inspected: 0, reaped: 0 })),
  registerManagedProcess: vi.fn(async () => { }),
  unregisterManagedProcess: vi.fn(async () => { }),
  terminateManagedProcess: vi.fn(async () => false),
};

const createChild = (pid, port) => {
  const child = new EventEmitter();
  Object.assign(child, {
    pid,
    connected: true,
    exitCode: null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    send(_message, callback) { callback?.(null); },
    kill(signal) {
      this.connected = false;
      this.signalCode = signal;
      queueMicrotask(() => { this.emit('exit', null, signal); this.emit('close'); });
      return true;
    },
  });
  queueMicrotask(() => child.stdout.write(`${JSON.stringify({ type: 'agent-service.listening', port })}\n`));
  return child;
};

const waitFor = async (predicate, timeoutMs = 1_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Condition was not reached');
};

const services = [];
afterEach(async () => {
  for (const service of services.splice(0)) await service.stop();
});

const createSupervisor = (children, overrides = {}) => {
  const service = createAgentServiceSupervisor({
    bunPath: '/usr/bin/bun',
    entrypoint: '/srv/agent-service/index.js',
    registry,
    restartBaseDelayMs: 5,
    restartMaxDelayMs: 10,
    restartMaxAttempts: 2,
    spawn: () => {
      const child = createChild(50_000 + children.length, 41_000 + children.length);
      children.push(child);
      return child;
    },
    fetchImpl: async () => Response.json({ ready: true, engine: 'omp', version: '1.0.0' }),
    ...overrides,
  });
  services.push(service);
  return service;
};

describe('Agent Service crash recovery', () => {
  it('restarts after an unexpected exit, backs off, and stops at the configured limit', async () => {
    const children = [];
    const service = createSupervisor(children);

    await service.start();
    expect(service.getState().phase).toBe('ready');

    children[0].emit('exit', 1, null);
    children[0].emit('close');
    expect(service.getState().phase).toBe('restarting');
    expect(service.getState().pid).toBeNull();
    expect(service.getState().port).toBeNull();
    await waitFor(() => children.length === 2 && service.getState().phase === 'ready');

    children[1].emit('exit', 1, null);
    children[1].emit('close');
    await waitFor(() => children.length === 3 && service.getState().phase === 'ready');

    children[2].emit('exit', 1, null);
    children[2].emit('close');
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(children).toHaveLength(3);
    expect(service.getState().phase).toBe('failed');
  });

  it('never restarts when an explicit stop lands during the backoff window', async () => {
    const children = [];
    const service = createSupervisor(children);
    await service.start();
    children[0].emit('exit', 1, null);
    children[0].emit('close');
    expect(service.getState().phase).toBe('restarting');
    await service.stop();
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(children).toHaveLength(1);
    expect(service.getState().phase).toBe('stopped');
  });

  it('schedules the next attempt when a recovery start fails', async () => {
    const children = [];
    const service = createSupervisor(children, {
      startupTimeoutMs: 60,
      fetchImpl: async () => {
        if (children.length === 2) throw new Error('recovery service did not become ready');
        return Response.json({ ready: true, engine: 'omp', version: '1.0.0' });
      },
    });
    await service.start();
    children[0].emit('exit', 1, null);
    children[0].emit('close');
    await waitFor(() => children.length === 3 && service.getState().phase === 'ready', 2_000);
    expect(service.getState().phase).toBe('ready');
  });

  it('never restarts after an explicit stop', async () => {
    const children = [];
    const service = createSupervisor(children);
    await service.start();
    await service.stop();
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(children).toHaveLength(1);
    expect(service.getState().phase).toBe('stopped');
  });
  it('caches the OMP version reported at readiness and clears it when the service goes down', async () => {
    const children = [];
    const service = createSupervisor(children, {
      fetchImpl: async () => Response.json({ ready: true, engine: 'omp', version: '1.0.0', ompVersion: '19.1.0' }),
    });
    await service.start();
    expect(service.getState().phase).toBe('ready');
    expect(service.getState().ompVersion).toBe('19.1.0');

    children[0].emit('exit', 1, null);
    children[0].emit('close');
    expect(service.getState().ompVersion).toBeNull();

    await waitFor(() => children.length === 2 && service.getState().phase === 'ready');
    expect(service.getState().ompVersion).toBe('19.1.0');

    await service.stop();
    expect(service.getState().ompVersion).toBeNull();
  });

  it('reports a null OMP version when the service omits it', async () => {
    const children = [];
    const service = createSupervisor(children);
    await service.start();
    expect(service.getState().phase).toBe('ready');
    expect(service.getState().ompVersion).toBeNull();
  });


  it('reports starting while a restart attempt initializes', async () => {
    const children = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let firstStartDone = false;
    const service = createSupervisor(children, {
      fetchImpl: async () => {
        if (!firstStartDone) return Response.json({ ready: true, engine: 'omp', version: '1.0.0' });
        await gate;
        return Response.json({ ready: true, engine: 'omp', version: '1.0.0' });
      },
    });
    await service.start();
    firstStartDone = true;
    children[0].emit('exit', 1, null);
    children[0].emit('close');
    await waitFor(() => children.length === 2);
    expect(service.getState().phase).toBe('starting');
    release();
    await waitFor(() => service.getState().phase === 'ready');
  });

  it('keeps a crashed service down while restarts are held, then starts one generation and consumes no attempt', async () => {
    const children = [];
    const service = createSupervisor(children, { restartMaxAttempts: 1 });
    await service.start();

    service.holdRestarts();
    children[0].emit('exit', 1, null);
    children[0].emit('close');
    // Real timers here: the supervisor arms a real setTimeout, and the close
    // event plus any restart are asynchronous, so fake timers cannot cover it.
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(children).toHaveLength(1);
    expect(service.getState().phase).toBe('failed');

    // A held restart start spawns nothing and keeps the phase.
    await service.start(true);
    expect(children).toHaveLength(1);

    service.resumeRestarts();
    await waitFor(() => children.length === 2 && service.getState().phase === 'ready');

    // The hold consumed no attempt: the only configured retry is still available.
    children[1].emit('exit', 1, null);
    children[1].emit('close');
    await waitFor(() => children.length === 3 && service.getState().phase === 'ready', 2_000);
    children[2].emit('exit', 1, null);
    children[2].emit('close');
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(children).toHaveLength(3);
    expect(service.getState().phase).toBe('failed');
  });

  it('refcounts concurrent holds so the first release cannot restart the service', async () => {
    const children = [];
    const service = createSupervisor(children);
    await service.start();

    service.holdRestarts();
    service.holdRestarts();
    children[0].emit('exit', 1, null);
    children[0].emit('close');
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(children).toHaveLength(1);

    service.resumeRestarts();
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(children).toHaveLength(1);

    service.resumeRestarts();
    await waitFor(() => children.length === 2 && service.getState().phase === 'ready');
  });
});
