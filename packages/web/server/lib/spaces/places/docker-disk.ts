import { z } from 'zod';

import { SpaceError } from '../errors.js';
import { labelFilterArgs, parseSpaceLabels, ROLE_VOLUME } from '../labels.js';
import type { RunCommandFn } from '../run-command.js';
import type { DockerEngine } from './docker-engine.js';
import type { DockerTools } from './docker-tools.js';
import type {
  PlaceDiskCleanUpResult,
  PlaceDiskKeptEntry,
  PlaceDiskMachineTrimResult,
  PlaceDiskReadResult,
  PlaceImageFailure,
} from './registry.js';

const QUERY_TIMEOUT_MS = 60_000;
const TRIM_TIMEOUT_MS = 120_000;
const SIZE_UNITS = new Map<string, number>([
  ['B', 1],
  ['kB', 1e3],
  ['KB', 1e3],
  ['MB', 1e6],
  ['GB', 1e9],
  ['TB', 1e12],
  ['PB', 1e15],
]);
const IN_USE = /\bis in use\b|\bbeing used by\b|\bmust be forced\b|\bcontainer is running\b/i;
const COLIMA_MACHINE = /^colima(?:-([A-Za-z0-9._-]+))?$/;

const dockerDfSchema = z.looseObject({
  Volumes: z.array(z.looseObject({
    Name: z.string().optional(),
    Size: z.string().optional(),
    Links: z.union([z.string(), z.number()]).optional(),
  })).optional(),
  Images: z.array(z.looseObject({
    ID: z.string().optional(),
    UniqueSize: z.string().optional(),
  })).optional(),
});

const errorMessageSchema = z.object({
  message: z.string().optional(),
});

export interface DockerImagePullState {
  pulling: boolean;
  failure: PlaceImageFailure | null;
}

export interface DockerDiskDependencies {
  engine: DockerEngine;
  runCommand: RunCommandFn;
  colimaPath: string | null;
  owner: string;
  image: string;
  retiredImages?: readonly string[] | undefined;
  tools: DockerTools;
  imagePullState?: (() => DockerImagePullState) | undefined;
}

interface DockerImageDiskInfo {
  name: string;
  bytes: number;
  inUse: boolean;
  tags: string[];
}

export const parseDockerSize = (text: string | null | undefined): number => {
  const match = /^(\d+(?:\.\d+)?)\s*(B|kB|KB|MB|GB|TB|PB)$/.exec(String(text ?? '').trim());
  if (!match?.[1] || !match[2]) return 0;
  return Math.round(Number(match[1]) * (SIZE_UNITS.get(match[2]) ?? 0));
};

const parseJson = (text: string): string | number | boolean | null | object => {
  try {
    return JSON.parse(text);
  } catch {
    throw new SpaceError('docker_output_unreadable', 'Docker printed something that is not JSON');
  }
};

export function createDockerDisk({
  engine,
  runCommand,
  colimaPath,
  owner,
  image,
  retiredImages = [],
  tools,
  imagePullState = () => ({ pulling: false, failure: null }),
}: DockerDiskDependencies) {
  const readUsage = async () => {
    const raw = parseJson(await engine.docker(['system', 'df', '--verbose', '--format', '{{json .}}'], QUERY_TIMEOUT_MS));
    const parsed = dockerDfSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      throw new SpaceError('docker_output_unreadable', 'Docker printed disk usage with an unexpected shape');
    }
    return {
      volumes: new Map((parsed.data.Volumes ?? []).map((volume) => [
        String(volume.Name ?? ''),
        { bytes: parseDockerSize(volume.Size), links: Number.parseInt(String(volume.Links ?? ''), 10) || 0 },
      ])),
      images: new Map((parsed.data.Images ?? []).map((entry) => [
        String(entry.ID ?? ''),
        parseDockerSize(entry.UniqueSize),
      ])),
    };
  };

  const spaceVolumes = async (): Promise<string[]> =>
    (await engine.findByLabel('volume', labelFilterArgs({ owner })))
      .filter((entry) => {
        const labels = parseSpaceLabels(entry.Labels);
        return labels?.owner === owner && labels.role === ROLE_VOLUME;
      })
      .map((entry) => String(entry.Name ?? ''));

  const readImage = async (name: string, images: ReadonlyMap<string, number>): Promise<DockerImageDiskInfo | null> => {
    const entry = await engine.inspect('image', name);
    if (!entry) return null;
    const users = await engine.docker(['ps', '--all', '--filter', `ancestor=${name}`, '--format', '{{.Names}}'], QUERY_TIMEOUT_MS);
    return { name, bytes: images.get(String(entry.Id ?? '')) ?? 0, inUse: users.trim() !== '', tags: entry.RepoTags ?? [] };
  };

  const readRetiredImages = async (images: ReadonlyMap<string, number>): Promise<DockerImageDiskInfo[]> => {
    const found = await Promise.all(retiredImages.map((name) => readImage(name, images)));
    return found.filter((state): state is DockerImageDiskInfo => state !== null && state.tags.every((tag) => tag === state.name));
  };

  const measure = async () => {
    const [usage, ours, spaces] = await Promise.all([readUsage(), tools.listOurs(), spaceVolumes()]);
    const { volumes } = usage;
    const sizeOf = (name: string): number => volumes.get(name)?.bytes ?? 0;
    const oldTools = ours.volumes.filter((name) => name !== ours.current);
    const [imageState, retired] = await Promise.all([readImage(image, usage.images), readRetiredImages(usage.images)]);
    return { volumes, ours, oldTools, spaces, image: imageState, retired, sizeOf };
  };

  const read = async (): Promise<PlaceDiskReadResult> => {
    const { volumes, ours, oldTools, spaces, image: imageState, retired, sizeOf } = await measure();
    const freeTools = oldTools.filter((name) => (volumes.get(name)?.links ?? 0) === 0);
    const freesImage = imageState !== null && !imageState.inUse;
    const freeRetired = retired.filter((state) => !state.inUse).reduce((total, state) => total + state.bytes, 0);
    const sum = (names: readonly string[]): number => names.reduce((total, name) => total + sizeOf(name), 0);
    const pull = imagePullState();
    return {
      imageBytes: imageState?.bytes ?? null,
      imagePulling: pull.pulling,
      imageFailure: imageState === null && !pull.pulling ? pull.failure : null,
      toolsBytes: sum(ours.volumes),
      spacesBytes: sum(spaces),
      freeBytes: sum(freeTools) + (freesImage ? imageState.bytes : 0) + freeRetired,
      freesImage,
    };
  };

  const trimMachine = async (): Promise<PlaceDiskMachineTrimResult> => {
    if (!colimaPath) return { state: 'skipped' };
    try {
      const info = await engine.run(['info', '--format', '{{json .Name}}'], QUERY_TIMEOUT_MS);
      const match = info.code === 0 ? COLIMA_MACHINE.exec(String(parseJson(info.stdout))) : null;
      if (!match) return { state: 'skipped' };
      const result = await runCommand(colimaPath, ['ssh', '--profile', match[1] ?? 'default', '--', 'sudo', '-n', 'fstrim', '--all'], { timeoutMs: TRIM_TIMEOUT_MS });
      return result.code === 0 ? { state: 'trimmed' } : { state: 'failed', message: result.stderr.trim().slice(-500) || `exit code ${result.code}` };
    } catch (error) {
      const message = error instanceof Error ? error.message : (errorMessageSchema.safeParse(error).data?.message ?? String(error));
      return { state: 'failed', message };
    }
  };

  const cleanUp = async (): Promise<PlaceDiskCleanUpResult> => {
    const { oldTools, ours, image: imageState, retired, sizeOf } = await measure();
    let freedBytes = 0;
    const kept: PlaceDiskKeptEntry[] = [];
    const attempt = async (
      kind: string,
      name: string,
      bytes: number,
      removal: Promise<{ kind: string; name: string; message: string } | null>,
    ): Promise<boolean> => {
      const problem = await removal;
      if (!problem) {
        freedBytes += bytes;
        return true;
      }
      kept.push({ kind, name, reason: IN_USE.test(problem.message) ? 'in_use' : 'failed', message: problem.message });
      return false;
    };
    let removedAny = false;
    for (const name of ours.oneShots) {
      removedAny = (await attempt('container', name, 0, engine.removeStoppedContainer(name))) || removedAny;
    }
    for (const name of oldTools) {
      removedAny = (await attempt('tools', name, sizeOf(name), engine.removeOne('volume', name))) || removedAny;
    }
    if (imageState) {
      removedAny = (await attempt('image', image, imageState.bytes, engine.removeOne('image', image))) || removedAny;
    }
    for (const state of retired) {
      removedAny = (await attempt('image', state.name, state.bytes, engine.removeOne('image', state.name))) || removedAny;
    }
    return { freedBytes, kept, machine: removedAny ? await trimMachine() : { state: 'skipped' } };
  };

  return { read, cleanUp };
}
