import http from 'node:http';
import type { Duplex } from 'node:stream';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSpaceId, hashProjectDirectory } from '../labels.js';
import { runCommand } from '../run-command.js';
import { REQUIRED_PLACE_METHODS } from './registry.js';
import type { ListedSpace, SpacePlace, SpaceSpec } from './registry.js';

const CREATE_TIMEOUT_MS = 25 * 60_000;

const healthBodySchema = z.object({
  status: z.string().optional(),
});

export interface ContractSuiteSetupResult {
  place: SpacePlace;
  dispose: () => Promise<void>;
}

export interface ContractSuiteOptions {
  enabled?: boolean | undefined;
  setup: () => Promise<ContractSuiteSetupResult>;
}

export function runPlaceContractSuite(title: string, { enabled = true, setup }: ContractSuiteOptions): void {
  describe.skipIf(!enabled)(`place contract: ${title}`, () => {
    const spec: SpaceSpec = {
      id: createSpaceId(),
      name: 'Contract suite, a=b',
      project: hashProjectDirectory('/contract/suite/project'),
      created: new Date().toISOString(),
      memoryBytes: 512 * 1024 * 1024,
    };
    let place: SpacePlace | undefined;
    let dispose = async (): Promise<void> => { return; };

    const currentPlace = (): SpacePlace => {
      if (!place) throw new Error('Contract suite place is not initialized');
      return place;
    };

    const listed = async (): Promise<ListedSpace | undefined> =>
      (await currentPlace().list()).find((space) => space.id === spec.id);

    const requestOver = (stream: Duplex, path: string): Promise<{ status: number | undefined; body: string }> =>
      new Promise((resolve, reject) => {
        const request = http.request({ path, headers: { host: '127.0.0.1' }, createConnection: () => stream }, (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
        });
        request.on('error', reject);
        request.end();
      });

    beforeAll(async () => {
      ({ place, dispose } = await setup());
    });

    afterAll(async () => {
      await dispose();
    });

    it('has an id and every operation', () => {
      const active = currentPlace();
      expect(active.id).toMatch(/\S/);
      for (const method of REQUIRED_PLACE_METHODS) {
        expect(active[method]).toBeInstanceOf(Function);
      }
    });

    it('is available', async () => {
      expect(await currentPlace().check()).toMatchObject({ available: true });
    });

    it('creates a space that verifies clean', async () => {
      const active = currentPlace();
      await active.create(spec);
      expect(await active.verify(spec.id)).toEqual([]);
    }, CREATE_TIMEOUT_MS);

    it('lists the space as running, with what it was created with', async () => {
      const { id, name, project, created } = spec;
      expect(await listed()).toEqual({ id, name, project, created, state: 'running', stoppedIdle: false, gatekeeperRunning: true, orphans: [], damaged: false, missing: [] });
    });

    it('refuses to create the same space again, and leaves it alone', async () => {
      await expect(currentPlace().create(spec)).rejects.toMatchObject({ code: 'space_name_taken' });
      expect(await listed()).toMatchObject({ state: 'running' });
    });

    it('runs commands as uid 1000', async () => {
      const result = await currentPlace().exec(spec.id, ['id', '-u']);
      expect(result).toMatchObject({ code: 0, stdout: '1000\n' });
    });

    it('runs a command in the gatekeeper, which is a container of its own', async () => {
      const active = currentPlace();
      const space = await active.exec(spec.id, ['cat', '/etc/hostname']);
      const gatekeeper = await active.exec(spec.id, ['cat', '/etc/hostname'], { target: 'gatekeeper' });
      expect(space).toMatchObject({ code: 0 });
      expect(gatekeeper).toMatchObject({ code: 0 });
      expect(space.stdout.trim()).not.toBe('');
      expect(gatekeeper.stdout.trim()).not.toBe('');
      expect(gatekeeper.stdout.trim()).not.toBe(space.stdout.trim());

      const work = `/spaces/${spec.id}`;
      expect(await active.exec(spec.id, ['test', '-d', work])).toMatchObject({ code: 0 });
      expect((await active.exec(spec.id, ['test', '-d', work], { target: 'gatekeeper' })).code).not.toBe(0);
      expect(await active.exec(spec.id, ['id', '-u'], { target: 'gatekeeper' })).toMatchObject({ code: 0, stdout: '1000\n' });
    });

    it('knows the two exec targets and no others', async () => {
      const active = currentPlace();
      for (const target of ['setup', 'host', '', 'space-old']) {
        await expect(active.exec(spec.id, ['id', '-u'], { target })).rejects.toMatchObject({ code: 'invalid_exec_target' });
      }
    });

    it('hands out an argv that runs a command in the space container', async () => {
      const active = currentPlace();
      const argv = await active.execArgv(spec.id);
      expect(argv.length).toBeGreaterThan(0);
      for (const argument of argv) {
        expect(argument).toEqual(expect.any(String));
        expect(argument).not.toBe('');
        expect([...argument].some((ch) => {
          const code = ch.charCodeAt(0);
          return code <= 0x1f || code === 0x7f;
        })).toBe(false);
      }
      const [file, ...args] = argv;
      if (!file) throw new Error('Expected non-empty execArgv');
      const run = (command: readonly string[]) => runCommand(file, [...args, ...command], { timeoutMs: 60_000 });
      const hostname = await run(['cat', '/etc/hostname']);
      expect(hostname).toMatchObject({ code: 0 });
      expect(hostname.stdout).toBe((await active.exec(spec.id, ['cat', '/etc/hostname'])).stdout);
      expect(hostname.stdout).not.toBe((await active.exec(spec.id, ['cat', '/etc/hostname'], { target: 'gatekeeper' })).stdout);
    });

    it('connects to the server inside the space', async () => {
      const stream = await currentPlace().connect(spec.id);
      const answer = await requestOver(stream, '/health');
      expect(answer.status).toBe(200);
      expect(healthBodySchema.parse(JSON.parse(answer.body))).toMatchObject({ status: 'ok' });
      const closed = new Promise<void>((resolve) => stream.once('close', resolve));
      stream.destroy();
      await closed;
    });

    it('stops the space and lists it as exited', async () => {
      await currentPlace().stop(spec.id);
      expect(await listed()).toMatchObject({ state: 'exited', stoppedIdle: false, gatekeeperRunning: false });
    });

    it('connects to no stopped space', async () => {
      await expect(currentPlace().connect(spec.id)).rejects.toMatchObject({ code: 'space_not_running' });
    });

    it('hands out no argv for a stopped space', async () => {
      await expect(currentPlace().execArgv(spec.id)).rejects.toMatchObject({ code: 'space_not_running' });
    });

    it('starts the space again', async () => {
      const active = currentPlace();
      await active.start(spec.id);
      expect(await listed()).toMatchObject({ state: 'running' });
      expect(await active.verify(spec.id)).toEqual([]);
    });

    it('removes the space and leaves no labelled resource behind', async () => {
      const result = await currentPlace().remove(spec.id);
      expect(result.failed).toEqual([]);
      expect(await listed()).toBeUndefined();
    });

    it('removes the gatekeeper with the space', async () => {
      const active = currentPlace();
      await expect(active.exec(spec.id, ['cat', '/etc/hostname'], { target: 'gatekeeper' })).rejects.toThrow();
      await expect(active.exec(spec.id, ['cat', '/etc/hostname'])).rejects.toThrow();
    });

    it('hands out no argv for a space that is gone', async () => {
      await expect(currentPlace().execArgv(spec.id)).rejects.toThrow();
    });

    it('connects to no space that is gone', async () => {
      await expect(currentPlace().connect(spec.id)).rejects.toThrow();
    });

    it('treats removing a missing space as done', async () => {
      expect(await currentPlace().remove(spec.id)).toEqual({ removed: [], failed: [] });
    });
  });
}
