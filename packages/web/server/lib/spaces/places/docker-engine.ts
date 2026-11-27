import { z } from 'zod';

import { SpaceError } from '../errors.js';
import type { RunCommandFn, RunCommandOptions, RunCommandResult } from '../run-command.js';
import type { PlaceRemovalFailure } from './registry.js';

const QUERY_TIMEOUT_MS = 30_000;
export const CHANGE_TIMEOUT_MS = 120_000;
export const ROLLBACK_SETTLE_MS = 2_000;

const INTERRUPTED_CODES = ['command_timeout', 'command_killed', 'command_output_too_large'] as const;

export const isInterrupted = (error: { code?: string | undefined } | null | undefined): boolean =>
  error?.code !== undefined && INTERRUPTED_CODES.some((code) => code === error.code);

const NOT_FOUND_PATTERNS = [
  /\bNo such (?:object|container|volume|network|image)\b/i,
  /\b(?:container|volume|network)\b.*\bnot found\b/i,
];

const isNotFound = (result: RunCommandResult): boolean =>
  result.code !== 0 && NOT_FOUND_PATTERNS.some((pattern) => pattern.test(result.stderr));

const REMOVAL_IN_PROGRESS = /removal of container .* is already in progress/i;
const isAlreadyGone = (result: RunCommandResult): boolean =>
  isNotFound(result) || (result.code !== 0 && REMOVAL_IN_PROGRESS.test(result.stderr));

const parseJson = (text: string): string | number | boolean | null | object => {
  try {
    return JSON.parse(text);
  } catch {
    throw new SpaceError('docker_output_unreadable', 'Docker printed something that is not JSON');
  }
};

export const dockerMountSchema = z.looseObject({
  Type: z.string().optional(),
  Name: z.string().optional(),
  Source: z.string().optional(),
  Destination: z.string().optional(),
  RW: z.boolean().optional(),
});

export const dockerLabelsSchema = z.record(z.string(), z.string().optional());

export const dockerInspectEntrySchema = z.looseObject({
  Id: z.string().optional(),
  Name: z.string().optional(),
  Labels: dockerLabelsSchema.nullable().optional(),
  RepoTags: z.array(z.string()).nullable().optional(),
  Internal: z.boolean().optional(),
  EnableIPv6: z.boolean().optional(),
  Options: dockerLabelsSchema.nullable().optional(),
  IPAM: z.looseObject({
    Config: z.array(z.looseObject({
      Subnet: z.string().optional(),
      Gateway: z.string().optional(),
    })).optional(),
  }).optional(),
  State: z.looseObject({
    Running: z.boolean().optional(),
    Status: z.string().optional(),
    ExitCode: z.number().optional(),
  }).optional(),
  Config: z.looseObject({
    User: z.string().optional(),
    Labels: dockerLabelsSchema.nullable().optional(),
    Env: z.array(z.string()).nullable().optional(),
    Image: z.string().optional(),
  }).optional(),
  HostConfig: z.looseObject({
    ReadonlyRootfs: z.boolean().optional(),
    Privileged: z.boolean().optional(),
    CapDrop: z.array(z.string()).nullable().optional(),
    CapAdd: z.array(z.string()).nullable().optional(),
    SecurityOpt: z.array(z.string()).nullable().optional(),
    Init: z.boolean().optional(),
    PidsLimit: z.number().nullable().optional(),
    Memory: z.number().optional(),
    MemorySwap: z.number().optional(),
    ShmSize: z.number().optional(),
    LogConfig: z.looseObject({
      Type: z.string().optional(),
      Config: dockerLabelsSchema.nullable().optional(),
    }).optional(),
    Tmpfs: dockerLabelsSchema.nullable().optional(),
    Binds: z.array(z.string()).nullable().optional(),
    VolumesFrom: z.array(z.string()).nullable().optional(),
    PidMode: z.string().optional(),
    IpcMode: z.string().optional(),
    UTSMode: z.string().optional(),
    UsernsMode: z.string().optional(),
    CgroupnsMode: z.string().optional(),
    NetworkMode: z.string().optional(),
    Runtime: z.string().optional(),
    Devices: z.array(z.looseObject({ PathOnHost: z.string().optional() })).nullable().optional(),
    Sysctls: dockerLabelsSchema.nullable().optional(),
    PortBindings: z.record(z.string(), z.array(z.looseObject({ HostPort: z.string().optional() })).optional()).nullable().optional(),
  }).optional(),
  Mounts: z.array(dockerMountSchema).optional(),
  NetworkSettings: z.looseObject({
    Networks: z.record(z.string(), z.looseObject({
      IPAddress: z.string().optional(),
      Aliases: z.array(z.string()).nullable().optional(),
      DNSNames: z.array(z.string()).nullable().optional(),
    })).nullable().optional(),
  }).optional(),
});

export type DockerInspectEntry = z.infer<typeof dockerInspectEntrySchema>;
export type DockerLabels = z.infer<typeof dockerLabelsSchema>;
export type DockerResourceKind = 'container' | 'volume' | 'network' | 'image';

const dockerInspectListSchema = z.array(dockerInspectEntrySchema);
const inspectNonListObjectSchema = z.looseObject({});

const errorMessageSchema = z.object({
  message: z.string().optional(),
});

const inspectArgs = (kind: DockerResourceKind, names: readonly string[]): string[] =>
(kind === 'container' ? ['inspect', '--type', 'container', ...names] : [kind, 'inspect', ...names]);

const listArgs = (kind: DockerResourceKind, filters: readonly string[]): string[] =>
(kind === 'container'
  ? ['ps', '--all', ...filters, '--format', '{{.Names}}']
  : [kind, 'ls', ...filters, '--format', '{{.Name}}']);

const removeArgs = (kind: DockerResourceKind, name: string): string[] =>
(kind === 'container' ? ['rm', '--force', name] : [kind, 'rm', name]);

export const entryLabels = (kind: DockerResourceKind, entry: DockerInspectEntry): DockerLabels | null | undefined =>
(kind === 'container' ? entry.Config?.Labels : entry.Labels);

export const entryName = (entry: DockerInspectEntry): string =>
  String(entry.Name ?? '').replace(/^\//, '');

export const pause = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => { setTimeout(resolve, milliseconds); });

export interface DockerEngineDependencies {
  runCommand: RunCommandFn;
  dockerPath: string;
}

export function createDockerEngine({ runCommand, dockerPath }: DockerEngineDependencies) {
  const run = (args: readonly string[], timeoutMs: number, options: RunCommandOptions = {}): Promise<RunCommandResult> =>
    runCommand(dockerPath, args, { ...options, timeoutMs });

  const failure = (args: readonly string[], result: RunCommandResult): SpaceError => new SpaceError(
    'docker_command_failed',
    `docker ${args.slice(0, 2).join(' ')} failed: ${result.stderr.trim() || `exit code ${result.code}`}`,
  );

  const docker = async (args: readonly string[], timeoutMs: number): Promise<string> => {
    const result = await run(args, timeoutMs);
    if (result.code !== 0) {
      throw failure(args, result);
    }
    return result.stdout;
  };

  const inspect = async (kind: DockerResourceKind, name: string): Promise<DockerInspectEntry | null> => {
    const args = inspectArgs(kind, [name]);
    const result = await run(args, QUERY_TIMEOUT_MS);
    if (isNotFound(result)) {
      return null;
    }
    if (result.code !== 0) {
      throw failure(args, result);
    }
    const raw = parseJson(result.stdout);
    if (inspectNonListObjectSchema.safeParse(raw).success) {
      return null;
    }
    const parsedList = dockerInspectListSchema.safeParse(raw);
    if (!parsedList.success) {
      throw new SpaceError('docker_output_unreadable', 'Docker printed inspect data with an unexpected shape');
    }
    return parsedList.data[0] ?? null;
  };

  const findByLabel = async (kind: DockerResourceKind, filters: readonly string[]): Promise<DockerInspectEntry[]> => {
    const names = (await docker(listArgs(kind, filters), QUERY_TIMEOUT_MS)).split('\n').filter(Boolean);
    if (names.length === 0) {
      return [];
    }
    const args = inspectArgs(kind, names);
    const result = await run(args, QUERY_TIMEOUT_MS);
    if (result.code !== 0 && !isNotFound(result)) {
      throw failure(args, result);
    }
    const parsed = dockerInspectListSchema.safeParse(parseJson(result.stdout));
    if (!parsed.success) {
      throw new SpaceError('docker_output_unreadable', 'Docker printed inspect data with an unexpected shape');
    }
    return parsed.data;
  };

  const removeWith = async (args: readonly string[], kind: DockerResourceKind, name: string): Promise<PlaceRemovalFailure | null> => {
    try {
      const result = await run(args, CHANGE_TIMEOUT_MS);
      return result.code === 0 || isAlreadyGone(result) ? null : { kind, name, message: result.stderr.trim() };
    } catch (error) {
      const message = error instanceof Error ? error.message : (errorMessageSchema.safeParse(error).data?.message ?? String(error));
      return { kind, name, message };
    }
  };

  const removeOne = (kind: DockerResourceKind, name: string): Promise<PlaceRemovalFailure | null> =>
    removeWith(removeArgs(kind, name), kind, name);

  const removeStoppedContainer = (nameOrId: string): Promise<PlaceRemovalFailure | null> =>
    removeWith(['rm', nameOrId], 'container', nameOrId);

  const removeByName = async (names: ReadonlyArray<readonly [DockerResourceKind, string]>): Promise<PlaceRemovalFailure[]> => {
    const failed: PlaceRemovalFailure[] = [];
    for (const [kind, name] of names) {
      try {
        if (await inspect(kind, name)) {
          const problem = await removeOne(kind, name);
          if (problem) failed.push(problem);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : (errorMessageSchema.safeParse(error).data?.message ?? String(error));
        failed.push({ kind, name, message });
      }
    }
    return failed;
  };

  return { run, docker, failure, inspect, findByLabel, removeOne, removeStoppedContainer, removeByName };
}

export type DockerEngine = ReturnType<typeof createDockerEngine>;
