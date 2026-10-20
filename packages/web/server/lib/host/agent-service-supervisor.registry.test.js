import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { MANAGED_PROCESS_TOKEN_ENV } from './managed-process-registry.js';
import { createAgentServiceSupervisor } from './agent-service-supervisor.js';

const createChild = (pid) => {
  const child = new EventEmitter();
  Object.assign(child, {
    pid,
    connected: true,
    exitCode: null,
    signalCode: null,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill(signal) {
      this.connected = false;
      this.signalCode = signal;
      queueMicrotask(() => {
        this.emit('exit', null, signal);
        this.emit('close');
      });
      return true;
    },
  });
  queueMicrotask(() => child.stdout.write(`${JSON.stringify({ type: 'agent-service.listening', port: 41000 })}\n`));
  return child;
};

const createRegistry = (events) => ({
  reapOrphanedProcesses: vi.fn(async () => {
    events.push('reap');
    return { inspected: 0, reaped: 0 };
  }),
  registerManagedProcess: vi.fn(async (entry) => {
    events.push(['register', entry]);
  }),
  unregisterManagedProcess: vi.fn(async (pid) => {
    events.push(['unregister', pid]);
  }),
  terminateManagedProcess: vi.fn(async () => false),
});

const createSupervisor = ({ registry, events, captured = {} }) => createAgentServiceSupervisor({
  bunPath: '/usr/bin/bun',
  entrypoint: '/srv/agent-service/index.js',
  registry,
  spawn: (_file, _args, options) => {
    events.push('spawn');
    captured.options = options;
    return createChild(4242);
  },
  fetchImpl: async () => Response.json({ ready: true, engine: 'omp', version: '1.0.0' }),
});

describe('Agent Service managed-process lifecycle', () => {
  it('reaps previous orphans, records the actual child, and unregisters it after stop', async () => {
    const events = [];
    const registry = createRegistry(events);
    const captured = {};
    const service = createSupervisor({ registry, events, captured });

    expect(await service.start()).toEqual({ phase: 'ready', pid: 4242, port: 41000 });
    const registration = events[2][1];
    expect(events.slice(0, 3)).toEqual(['reap', 'spawn', ['register', registration]]);
    expect(registration).toMatchObject({
      pid: 4242, ownerPid: process.pid, kind: 'agent-service',
      binary: '/usr/bin/bun', entrypoint: '/srv/agent-service/index.js',
      ownershipToken: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    // The same nonce reaches the spawned service (and therefore its workers).
    expect(captured.options.env[MANAGED_PROCESS_TOKEN_ENV]).toBe(registration.ownershipToken);

    await service.stop();

    expect(registry.unregisterManagedProcess).toHaveBeenCalledWith(4242);
    expect(events.at(-1)).toEqual(['unregister', 4242]);
  });

  it('does not let registry failures mask a healthy start or stop', async () => {
    const registry = {
      reapOrphanedProcesses: vi.fn(async () => { throw new Error('registry unavailable'); }),
      registerManagedProcess: vi.fn(async () => { throw new Error('registry unavailable'); }),
      unregisterManagedProcess: vi.fn(async () => { throw new Error('registry unavailable'); }),
    };
    const service = createSupervisor({ registry, events: [] });

    expect(await service.start()).toEqual({ phase: 'ready', pid: 4242, port: 41000 });
    await expect(service.stop()).resolves.toBeUndefined();
    expect(service.getState()).toEqual({ phase: 'stopped', pid: null, port: null });
  });
});
