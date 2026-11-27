import crypto from 'node:crypto';
import http from 'node:http';
import net from 'node:net';
import type { Duplex } from 'node:stream';

import { SpaceError } from '../errors.js';
import { ROLE_GATEKEEPER, ROLE_SPACE, requireSpaceId } from '../labels.js';
import type {
  ListedSpace,
  PlaceCheckResult,
  PlaceExecOptions,
  PlaceExecResult,
  PlaceRemovalEntry,
  PlaceRemoveResult,
  PlaceViolation,
  SpacePlace,
  SpaceSpec,
} from './registry.js';

const TARGETS = [ROLE_SPACE, ROLE_GATEKEEPER] as const;

const CONTAINER_PROGRAM = [
  'const [hostname, ...command] = process.argv.slice(1);',
  'const line = command.join(" ");',
  'if (line === "cat /etc/hostname") process.stdout.write(hostname + "\\n");',
  'else process.exitCode = 127;',
].join(' ');

interface MemoryContainer {
  hostname: string;
  server?: http.Server | undefined;
}

export interface MemoryPlaceOptions {
  id?: string | undefined;
}

const isAddressInfo = (address: ReturnType<http.Server['address']>): address is net.AddressInfo =>
  address !== null && typeof address !== 'string';

export function createMemoryPlace({ id = 'memory' }: MemoryPlaceOptions = {}): SpacePlace {
  const spaces = new Map<string, ListedSpace>();
  const containers = new Map<string, MemoryContainer>();

  const requireSpace = (spaceId: string): ListedSpace => {
    const space = spaces.get(requireSpaceId(spaceId));
    if (!space) {
      throw new SpaceError('space_not_found', `Space ${spaceId} does not exist`);
    }
    return space;
  };

  const requireContainer = (spaceId: string, target: string = ROLE_SPACE): MemoryContainer => {
    if (!TARGETS.some((allowed) => allowed === target)) {
      throw new SpaceError('invalid_exec_target', `A command runs in the space or in its gatekeeper, not in '${target}'`);
    }
    const container = containers.get(`${requireSpaceId(spaceId)}:${target}`);
    if (!container) {
      throw new SpaceError(target === ROLE_GATEKEEPER ? 'gatekeeper_missing' : 'space_not_found', `Space ${spaceId} has no ${target} container`);
    }
    return container;
  };

  return {
    id,
    check: async (): Promise<PlaceCheckResult> => ({ available: true, version: 'memory', os: 'none', arch: 'none', hostIsolation: true }),
    pullImage: async (): Promise<void> => { return; },
    imagePulling: (): boolean => false,
    create: async ({ id: spaceId, name, project, created }: SpaceSpec): Promise<void> => {
      if (spaces.has(requireSpaceId(spaceId))) {
        throw new SpaceError('space_name_taken', `Space ${spaceId} already exists`);
      }
      spaces.set(spaceId, { id: spaceId, name, project, created, state: 'running', stoppedIdle: false, gatekeeperRunning: true, orphans: [], damaged: false, missing: [] });
      for (const target of TARGETS) {
        containers.set(`${spaceId}:${target}`, { hostname: crypto.randomBytes(6).toString('hex') });
      }
      const server = http.createServer((request, response) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ status: 'ok', spaceId, path: request.url }));
      });
      await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve); });
      const spaceContainer = containers.get(`${spaceId}:${ROLE_SPACE}`);
      if (spaceContainer) spaceContainer.server = server;
    },
    list: async (): Promise<ListedSpace[]> => Array.from(spaces.values(), (space) => ({ ...space })),
    exec: async (spaceId: string, argv: readonly string[], options: PlaceExecOptions = {}): Promise<PlaceExecResult> => {
      const container = requireContainer(spaceId, options.target);
      const command = argv.join(' ');
      if (command === 'id -u') {
        return { code: 0, stdout: '1000\n', stderr: '' };
      }
      if (command === 'cat /etc/hostname') {
        return { code: 0, stdout: `${container.hostname}\n`, stderr: '' };
      }
      if (command === `test -d /spaces/${spaceId}`) {
        return { code: options.target === ROLE_GATEKEEPER ? 1 : 0, stdout: '', stderr: '' };
      }
      return { code: 127, stdout: '', stderr: 'not found' };
    },
    execArgv: async (spaceId: string): Promise<string[]> => {
      const { hostname } = requireContainer(spaceId);
      if (requireSpace(spaceId).state !== 'running') {
        throw new SpaceError('space_not_running', `Space ${spaceId} is stopped`);
      }
      return [process.execPath, '-e', CONTAINER_PROGRAM, hostname];
    },
    connect: async (spaceId: string): Promise<Duplex> => {
      const { server } = requireContainer(spaceId);
      if (requireSpace(spaceId).state !== 'running') {
        throw new SpaceError('space_not_running', `Space ${spaceId} is stopped`);
      }
      const address = server?.address() ?? null;
      if (!server || !isAddressInfo(address)) {
        throw new SpaceError('space_server_unreachable', `Space ${spaceId} has no listening server`);
      }
      return net.connect({ host: '127.0.0.1', port: address.port });
    },
    stop: async (spaceId: string): Promise<void> => { Object.assign(requireSpace(spaceId), { state: 'exited', gatekeeperRunning: false }); },
    start: async (spaceId: string): Promise<void> => { Object.assign(requireSpace(spaceId), { state: 'running', stoppedIdle: false, gatekeeperRunning: true }); },
    remove: async (spaceId: string): Promise<PlaceRemoveResult> => {
      const removed: PlaceRemovalEntry[] = [];
      for (const target of TARGETS) {
        const container = containers.get(`${requireSpaceId(spaceId)}:${target}`);
        if (!container) continue;
        container.server?.close();
        containers.delete(`${spaceId}:${target}`);
        removed.push({ kind: 'container', name: `${spaceId}-${target}` });
      }
      if (spaces.delete(spaceId)) removed.push({ kind: 'space', name: spaceId });
      return { removed, failed: [] };
    },
    verify: async (spaceId: string): Promise<PlaceViolation[]> => {
      requireSpace(spaceId);
      requireContainer(spaceId, ROLE_GATEKEEPER);
      return [];
    },
  };
}
