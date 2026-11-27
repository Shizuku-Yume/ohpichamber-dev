import net from 'node:net';
import type { Duplex } from 'node:stream';
import { z } from 'zod';

import { SpaceError } from '../errors.js';
import { createGatekeeperChannel } from '../gatekeeper-channel.js';
import {
  buildGatekeeperCreateArgs,
  buildGatekeeperNetworkArgs,
  buildSpaceCreateArgs,
  buildSpaceNetworkArgs,
  buildVolumeOwnershipRunArgs,
  findGatekeeperHardeningViolations,
  findHardeningViolations,
  requireMemoryBytes,
} from '../hardening.js';
import {
  ROLE_GATEKEEPER,
  ROLE_NETWORK,
  ROLE_OUTER_NETWORK,
  ROLE_SETUP,
  ROLE_SPACE,
  ROLE_VOLUME,
  buildSpaceLabels,
  labelArgs,
  labelFilterArgs,
  parseSpaceLabels,
  requireOwner,
  requireSpaceId,
  spaceResourceName,
} from '../labels.js';
import type { SpaceRole } from '../labels.js';
import { SPACE_CONNECT_COMMAND, SPACE_IDLE_EXIT_CODE, SPACE_USER, TOOLS_MOUNT_PATH } from '../layout.js';
import { openCommandStream as openCommandStreamProcess } from '../run-command.js';
import type { RunCommandFn, RunCommandOptions } from '../run-command.js';
import { createSpaceServerChannel, createSpaceToken } from '../space-server.js';
import type { ToolsSource } from '../tools.js';
import { CHANGE_TIMEOUT_MS, ROLLBACK_SETTLE_MS, createDockerEngine, entryLabels, entryName, isInterrupted, pause } from './docker-engine.js';
import type { DockerInspectEntry, DockerResourceKind } from './docker-engine.js';
import { createDockerDisk } from './docker-disk.js';
import { createDockerTools } from './docker-tools.js';
import type {
  ListedSpace,
  PlaceCheckResult,
  PlaceDiskCleanUpResult,
  PlaceDiskReadResult,
  PlaceExecOptions,
  PlaceExecResult,
  PlaceImageFailure,
  PlaceRemovalEntry,
  PlaceRemovalFailure,
  PlaceRemoveResult,
  PlaceViolation,
  SpacePlace,
  SpaceSpec,
} from './registry.js';

const DOCKER_PLACE_ID = 'docker';

export const SPACE_BASE_IMAGE = 'node@sha256:3d27e5c11e5786e309ec3e03f93ae536eb36e6e5eb3714d5eb3300a36157add0';
export const RETIRED_SPACE_BASE_IMAGES = ['node@sha256:dd5847a04b0deee391fa145f1f4c6d214196668b6bcc7988ebed67249f226844'];

const CHECK_TIMEOUT_MS = 10_000;
const PULL_TIMEOUT_MS = 20 * 60_000;
const EXEC_TIMEOUT_MS = 60_000;
const HOST_ISOLATION_MIN_ENGINE = 28;
const ASIDE_SUFFIX = 'old';

const KINDS: readonly DockerResourceKind[] = ['container', 'volume', 'network'];

const dockerVersionSchema = z.object({
  Server: z.object({
    Version: z.string(),
    Os: z.string(),
    Arch: z.string(),
  }).nullable().optional(),
});

const dockerSecurityOptionsSchema = z.array(z.string()).nullable();

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  details: z.looseObject({ errno: z.string().nullable().optional() }).nullable().optional(),
});

export interface DockerPlaceDependencies {
  runCommand: RunCommandFn;
  openCommandStream?: ((file: string, args: readonly string[]) => Duplex) | undefined;
  dockerPath: string;
  colimaPath?: string | null | undefined;
  owner: string;
  toolsSource: ToolsSource;
  wait?: ((milliseconds: number) => Promise<void>) | undefined;
  now?: (() => Date) | undefined;
}

export interface DockerSpacePlace extends SpacePlace {
  readDisk: () => Promise<PlaceDiskReadResult>;
  cleanUpDisk: () => Promise<PlaceDiskCleanUpResult>;
  pullImage: () => Promise<void>;
  imagePulling: () => boolean;
}

function execRole(target: string | undefined): typeof ROLE_SPACE | typeof ROLE_GATEKEEPER {
  if (target === undefined || target === ROLE_SPACE) {
    return ROLE_SPACE;
  }
  if (target === ROLE_GATEKEEPER) {
    return ROLE_GATEKEEPER;
  }
  throw new SpaceError('invalid_exec_target', `A command runs in the space or in its gatekeeper, not in '${target}'`);
}

export function createDockerPlace({
  runCommand,
  openCommandStream = openCommandStreamProcess,
  dockerPath,
  colimaPath = null,
  owner,
  toolsSource,
  wait = pause,
  now = () => new Date(),
}: DockerPlaceDependencies): DockerSpacePlace {
  requireOwner(owner);

  const engine = createDockerEngine({ runCommand, dockerPath });
  const { run, docker, inspect, removeOne, removeStoppedContainer } = engine;
  const tools = createDockerTools({ engine, owner, toolsSource, image: SPACE_BASE_IMAGE, now, wait });
  let imagePull: Promise<void> | null = null;
  let imagePullFailure: PlaceImageFailure | null = null;
  const imagePullState = () => ({ pulling: imagePull !== null, failure: imagePullFailure });
  const disk = createDockerDisk({ engine, runCommand, colimaPath, owner, image: SPACE_BASE_IMAGE, retiredImages: RETIRED_SPACE_BASE_IMAGES, tools, imagePullState });

  const findResources = async (spaceId: string | null) => {
    const filters = labelFilterArgs({ owner, spaceId });
    const resources: Array<{
      kind: DockerResourceKind;
      name: string;
      labels: NonNullable<ReturnType<typeof parseSpaceLabels>>;
      entry: DockerInspectEntry;
    }> = [];
    for (const kind of KINDS) {
      for (const entry of await engine.findByLabel(kind, filters)) {
        const labels = parseSpaceLabels(entryLabels(kind, entry));
        if (labels && labels.owner === owner && (spaceId === null || labels.id === spaceId)) {
          resources.push({ kind, name: entryName(entry), labels, entry });
        }
      }
    }
    return resources;
  };

  const inspectOwnContainer = async (spaceId: string, name: string): Promise<DockerInspectEntry | null> => {
    const entry = await inspect('container', name);
    if (!entry) {
      return null;
    }
    const labels = parseSpaceLabels(entry.Config?.Labels);
    if (labels?.id !== spaceId || labels?.owner !== owner) {
      throw new SpaceError('space_not_ours', `Container ${name} exists but this OhPiChamber installation did not create it`);
    }
    return entry;
  };

  const requireSpaceContainer = async (spaceId: string): Promise<DockerInspectEntry> => {
    const name = spaceResourceName(spaceId, ROLE_SPACE);
    const entry = await inspectOwnContainer(spaceId, name);
    if (entry) {
      return entry;
    }
    if (await inspectOwnContainer(spaceId, spaceResourceName(spaceId, ROLE_SPACE, ASIDE_SUFFIX))) {
      throw new SpaceError('space_move_unfinished', `Space ${spaceId} is in the middle of a move to new tools, or a move did not finish. Start the space to repair it.`);
    }
    throw new SpaceError('space_not_found', `Space ${spaceId} has no container in Docker`);
  };

  const check = async (): Promise<PlaceCheckResult> => {
    const unavailable = (code: string, message: string): PlaceCheckResult => ({ available: false, code, message });
    let version: Awaited<ReturnType<typeof run>>;
    let info: Awaited<ReturnType<typeof run>>;
    try {
      version = await run(['version', '--format', '{{json .}}'], CHECK_TIMEOUT_MS);
      info = await run(['info', '--format', '{{json .SecurityOptions}}'], CHECK_TIMEOUT_MS);
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      if (detail?.code === 'command_spawn_failed' && detail.details?.errno === 'ENOENT') {
        return unavailable('docker_cli_missing', 'The docker command was not found. Install Docker Desktop, Colima or Docker Engine, then try again.');
      }
      if (detail?.code === 'command_spawn_failed') {
        return unavailable('docker_cli_unusable', `The docker command could not be started (${detail.details?.errno ?? 'unknown error'}). Check that ${dockerPath} is a program this user may run.`);
      }
      if (detail?.code === 'command_timeout') {
        return unavailable('docker_daemon_unreachable', 'Docker did not answer in time. Restart Docker Desktop or Colima, then try again.');
      }
      throw error;
    }
    let server: z.infer<typeof dockerVersionSchema>['Server'] = null;
    let securityOptions: string[] = [];
    try {
      server = dockerVersionSchema.parse(JSON.parse(version.stdout)).Server ?? null;
      securityOptions = dockerSecurityOptionsSchema.parse(JSON.parse(info.stdout)) ?? [];
    } catch {
      server = null;
    }
    if (version.code !== 0 || info.code !== 0 || !server) {
      return unavailable('docker_daemon_unreachable', 'Docker is installed but not running. Start Docker Desktop or Colima, then try again.');
    }
    if (!securityOptions.some((option) => /^name=seccomp,profile=(builtin|default)$/.test(option))) {
      return unavailable('docker_seccomp_missing', 'This Docker engine runs containers without its builtin seccomp profile. Turn seccomp back on in the Docker daemon settings, then try again.');
    }

    return {
      available: true,
      version: server.Version,
      os: server.Os,
      arch: server.Arch,
      hostIsolation: Number.parseInt(server.Version, 10) >= HOST_ISOLATION_MIN_ENGINE,
    };
  };

  const pullImage = (): Promise<void> => {
    if (imagePull === null) {
      imagePull = run(['pull', SPACE_BASE_IMAGE], PULL_TIMEOUT_MS)
        .then((result) => {
          if (result.code !== 0) {
            throw new SpaceError(
              'image_pull_failed',
              `Could not download the base image: ${result.stderr.trim() || `exit code ${result.code}`}. Common causes: no internet access on the Docker machine, or Docker's credential helper cannot run in this session.`,
            );
          }
          imagePullFailure = null;
        })
        .catch((error) => {
          const detail = errorDetailSchema.safeParse(error).data;
          const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
          imagePullFailure = { code: detail?.code ?? 'image_pull_failed', message };
          throw error;
        })
        .finally(() => { imagePull = null; });
    }
    return imagePull;
  };

  const ensureImage = async (): Promise<void> => {
    const present = await inspect('image', SPACE_BASE_IMAGE);
    if (present) {
      return;
    }
    await pullImage();
  };

  const verifyContainer = async (spaceId: string, container: DockerInspectEntry): Promise<PlaceViolation[]> => {
    const network = await inspect('network', spaceResourceName(spaceId, ROLE_NETWORK));
    const toolsMount = (container.Mounts ?? []).find((mount) => mount.Destination === TOOLS_MOUNT_PATH);
    const toolsVolume = toolsMount?.Name ? await inspect('volume', toolsMount.Name) : null;
    return findHardeningViolations({ spaceId, owner, container, network, toolsVolume });
  };

  const verifyGatekeeperContainer = async (spaceId: string, container: DockerInspectEntry): Promise<PlaceViolation[]> => {
    const outerNetwork = await inspect('network', spaceResourceName(spaceId, ROLE_OUTER_NETWORK));
    return findGatekeeperHardeningViolations({ spaceId, owner, container, outerNetwork });
  };

  const verify = async (spaceId: string): Promise<PlaceViolation[]> => {
    const violations = await verifyContainer(spaceId, await requireSpaceContainer(spaceId));
    const gatekeeperContainer = await inspectOwnContainer(spaceId, spaceResourceName(spaceId, ROLE_GATEKEEPER));
    if (!gatekeeperContainer) {
      return [...violations, { check: 'gatekeeper_missing', message: 'The space has no gatekeeper container' }];
    }
    return [...violations, ...(await verifyGatekeeperContainer(spaceId, gatekeeperContainer))];
  };

  const requireNoViolations = (violations: PlaceViolation[], what: string): void => {
    if (violations.length > 0) {
      throw new SpaceError(
        'space_verification_failed',
        `The new ${what} does not match the requested restrictions: ${violations.map((violation) => violation.message).join('; ')}`,
        { violations },
      );
    }
  };

  const requireVerified = async (spaceId: string, container: DockerInspectEntry): Promise<void> =>
    requireNoViolations(await verifyContainer(spaceId, container), 'container');

  const requireGatekeeperVerified = async (spaceId: string, container: DockerInspectEntry): Promise<void> =>
    requireNoViolations(await verifyGatekeeperContainer(spaceId, container), 'gatekeeper');

  const remove = async (spaceId: string): Promise<PlaceRemoveResult> => {
    const resources = await findResources(requireSpaceId(spaceId));
    const removed: PlaceRemovalEntry[] = [];
    const failed: PlaceRemovalFailure[] = [];
    for (const { kind, name } of resources) {
      const problem = await removeOne(kind, name);
      if (problem) {
        failed.push(problem);
      } else {
        removed.push({ kind, name });
      }
    }
    return { removed, failed };
  };

  const rollBack = async (spaceId: string): Promise<PlaceRemovalFailure[]> => {
    try {
      return (await remove(spaceId)).failed;
    } catch (error) {
      const message = error instanceof Error ? error.message : (errorDetailSchema.safeParse(error).data?.message ?? String(error));
      return [{ kind: 'space', name: spaceId, message }];
    }
  };

  const execInContainer = (spaceId: string, argv: readonly string[], options: PlaceExecOptions = {}): Promise<PlaceExecResult> => {
    const runOptions: RunCommandOptions = { stdin: options.stdin ?? '' };
    if (options.maxOutputBytes !== undefined) runOptions.maxOutputBytes = options.maxOutputBytes;
    if (options.keepTail === true) runOptions.keepTail = true;
    if (options.killTree === true) runOptions.killTree = true;
    return run(
      ['exec', '--interactive', '--user', SPACE_USER, spaceResourceName(spaceId, execRole(options.target)), ...argv],
      options.timeoutMs ?? EXEC_TIMEOUT_MS,
      runOptions,
    );
  };

  const server = createSpaceServerChannel({ exec: execInContainer, wait, now: () => now().getTime() });
  const gatekeeper = createGatekeeperChannel({ exec: execInContainer, wait, now: () => now().getTime() });

  const innerAddressOf = async (spaceId: string): Promise<string> => {
    const entry = await inspectOwnContainer(spaceId, spaceResourceName(spaceId, ROLE_GATEKEEPER));
    const address = String(entry?.NetworkSettings?.Networks?.[spaceResourceName(spaceId, ROLE_NETWORK)]?.IPAddress ?? '');
    if (net.isIP(address) === 0) {
      throw new SpaceError('gatekeeper_address_unknown', `The runtime reports no address for the network filter of space ${spaceId} on the space's network, so its listeners cannot be bound.`);
    }
    return address;
  };

  const create = async ({ id, name, project, created, memoryBytes }: SpaceSpec): Promise<void> => {
    requireMemoryBytes(memoryBytes);
    const roles: readonly SpaceRole[] = [ROLE_NETWORK, ROLE_OUTER_NETWORK, ROLE_VOLUME, ROLE_SETUP, ROLE_GATEKEEPER, ROLE_SPACE];
    const labelArguments = new Map<SpaceRole, string[]>(roles.map((role) => (
      [role, labelArgs(buildSpaceLabels({ id, role, owner, project, name, created }))]
    )));
    const labelsFor = (role: SpaceRole): string[] => labelArguments.get(role) ?? [];
    const resources = {
      spaceId: id,
      network: spaceResourceName(id, ROLE_NETWORK),
      workVolume: spaceResourceName(id, ROLE_VOLUME, 'work'),
      homeVolume: spaceResourceName(id, ROLE_VOLUME, 'home'),
      image: SPACE_BASE_IMAGE,
    };
    const outerNetwork = spaceResourceName(id, ROLE_OUTER_NETWORK);
    const containerName = spaceResourceName(id, ROLE_SPACE);
    const gatekeeperName = spaceResourceName(id, ROLE_GATEKEEPER);
    const taken: Array<readonly [DockerResourceKind, string]> = [
      ['container', containerName],
      ['container', spaceResourceName(id, ROLE_SETUP)],
      ['container', gatekeeperName],
      ['network', resources.network],
      ['network', outerNetwork],
      ['volume', resources.workVolume],
      ['volume', resources.homeVolume],
    ];

    for (const [kind, resourceName] of taken) {
      if (await inspect(kind, resourceName)) {
        throw new SpaceError('space_name_taken', `Docker already has a ${kind} named ${resourceName}. Remove it or create the space again.`);
      }
    }

    let toolsVolume: string | null = null;
    try {
      await ensureImage();
      toolsVolume = await tools.ensure();
      await docker(buildSpaceNetworkArgs({ network: resources.network, labelArguments: labelsFor(ROLE_NETWORK) }), CHANGE_TIMEOUT_MS);
      await docker(buildGatekeeperNetworkArgs({ network: outerNetwork, labelArguments: labelsFor(ROLE_OUTER_NETWORK) }), CHANGE_TIMEOUT_MS);
      await docker(['volume', 'create', ...labelsFor(ROLE_VOLUME), resources.workVolume], CHANGE_TIMEOUT_MS);
      await docker(['volume', 'create', ...labelsFor(ROLE_VOLUME), resources.homeVolume], CHANGE_TIMEOUT_MS);
      await docker(buildVolumeOwnershipRunArgs({
        ...resources,
        containerName: spaceResourceName(id, ROLE_SETUP),
        labelArguments: labelsFor(ROLE_SETUP),
      }), CHANGE_TIMEOUT_MS);
      await docker(buildGatekeeperCreateArgs({
        containerName: gatekeeperName,
        labelArguments: labelsFor(ROLE_GATEKEEPER),
        network: resources.network,
        image: SPACE_BASE_IMAGE,
      }), CHANGE_TIMEOUT_MS);
      await docker(['network', 'connect', outerNetwork, gatekeeperName], CHANGE_TIMEOUT_MS);
      await requireGatekeeperVerified(id, await inspectOwnContainer(id, gatekeeperName) ?? {});
      await docker(['start', gatekeeperName], CHANGE_TIMEOUT_MS);
      await gatekeeper.writeProgram(id, { bindAddress: await innerAddressOf(id) });
      await gatekeeper.waitUntilReady(id);
      await docker(buildSpaceCreateArgs({
        ...resources,
        containerName,
        labelArguments: labelsFor(ROLE_SPACE),
        toolsVolume,
        memoryBytes,
      }), CHANGE_TIMEOUT_MS);
      await requireVerified(id, await inspectOwnContainer(id, containerName) ?? {});
      await docker(['start', containerName], CHANGE_TIMEOUT_MS);
      await server.writeToken(id, createSpaceToken());
      await server.waitUntilReady(id);
    } catch (error) {
      const detail = errorDetailSchema.safeParse(error).data;
      let rollbackFailures = await rollBack(id);
      const uncertain = isInterrupted(detail);
      if (uncertain) {
        await wait(ROLLBACK_SETTLE_MS);
        rollbackFailures = [...(await rollBack(id)), ...(await engine.removeByName(taken))];
      }
      if (toolsVolume) {
        rollbackFailures = [...rollbackFailures, ...(await tools.removeIfUnlabelled(toolsVolume))];
      }
      const leftovers = rollbackFailures.length > 0
        ? ` Clean-up also failed for: ${rollbackFailures.map((item) => `${item.kind} ${item.name}`).join(', ')}.`
        : '';
      const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
      const wrapped = new SpaceError(
        detail?.code ?? 'space_create_failed',
        `Could not create the space. ${message}${leftovers}${uncertain ? ' Docker may still finish the interrupted step, so look at the spaces list.' : ''}`,
        { original: error instanceof SpaceError ? error.details ?? null : null, rollbackFailures, uncertain },
      );
      wrapped.cause = error;
      throw wrapped;
    }
  };

  const list = async (): Promise<ListedSpace[]> => {
    const byId = new Map<string, Awaited<ReturnType<typeof findResources>>>();
    for (const resource of await findResources(null)) {
      const group = byId.get(resource.labels.id) ?? [];
      group.push(resource);
      byId.set(resource.labels.id, group);
    }
    return Array.from(byId.entries(), ([id, group]): ListedSpace => {
      const containers = group.filter((resource) => resource.labels.role === ROLE_SPACE);
      const space = containers.find((resource) => resource.name === spaceResourceName(id, ROLE_SPACE)) ?? containers[0];
      const fallback = space ?? group[0];
      const name = fallback?.labels.name ?? '';
      const project = fallback?.labels.project ?? '';
      const created = fallback?.labels.created ?? '';
      let state: ListedSpace['state'] = 'missing';
      if (space) {
        state = space.entry.State?.Running === true ? 'running' : 'exited';
      }
      const orphans = space ? [] : group.map((resource) => ({ kind: resource.kind, name: resource.name }));
      const expected = [
        spaceResourceName(id, ROLE_NETWORK),
        spaceResourceName(id, ROLE_OUTER_NETWORK),
        spaceResourceName(id, ROLE_VOLUME, 'work'),
        spaceResourceName(id, ROLE_VOLUME, 'home'),
      ];
      const missing = space ? expected.filter((resourceName) => !group.some((resource) => resource.name === resourceName)) : [];
      const guard = group.find((resource) => resource.labels.role === ROLE_GATEKEEPER);
      if (space && (!guard || (state === 'running' && guard.entry.State?.Running !== true))) {
        missing.push(spaceResourceName(id, ROLE_GATEKEEPER));
      }
      const stoppedIdle = state === 'exited' && space?.entry.State?.ExitCode === SPACE_IDLE_EXIT_CODE;
      const gatekeeperRunning = guard?.entry.State?.Running === true;
      return { id, name, project, created, state, stoppedIdle, gatekeeperRunning, orphans, damaged: missing.length > 0, missing };
    });
  };

  const starting = new Map<string, Promise<void>>();

  const requireGatekeeperContainer = async (spaceId: string): Promise<DockerInspectEntry> => {
    const name = spaceResourceName(spaceId, ROLE_GATEKEEPER);
    const entry = await inspectOwnContainer(spaceId, name);
    if (!entry) {
      throw new SpaceError('gatekeeper_missing', `Space ${spaceId} has no gatekeeper container. Apply or discard its work and create the space again.`);
    }
    return entry;
  };

  const exec = async (spaceId: string, argv: readonly string[], options: PlaceExecOptions = {}): Promise<PlaceExecResult> => {
    if (!Array.isArray(argv) || argv.length === 0) {
      throw new SpaceError('invalid_command', 'A command is a non-empty array of arguments');
    }
    if (execRole(options.target) === ROLE_GATEKEEPER) {
      await requireGatekeeperContainer(spaceId);
    } else {
      await requireSpaceContainer(spaceId);
    }
    return execInContainer(spaceId, argv, options);
  };

  const execArgv = async (spaceId: string): Promise<string[]> => {
    const entry = await requireSpaceContainer(spaceId);
    if (entry.State?.Running !== true) {
      throw new SpaceError('space_not_running', `Space ${spaceId} is stopped. Start it, then try again.`);
    }
    return [dockerPath, 'exec', '--interactive', '--user', SPACE_USER, spaceResourceName(spaceId, ROLE_SPACE)];
  };

  const connect = async (spaceId: string): Promise<Duplex> => {
    const [file, ...args] = await execArgv(spaceId);
    if (!file) {
      throw new SpaceError('command_spawn_failed', 'Docker path is missing');
    }
    return openCommandStream(file, [...args, ...SPACE_CONNECT_COMMAND]);
  };

  const stop = async (spaceId: string): Promise<void> => {
    await starting.get(spaceId)?.catch(() => { return; });
    await requireSpaceContainer(spaceId);
    await docker(['stop', spaceResourceName(spaceId, ROLE_SPACE)], CHANGE_TIMEOUT_MS);
    const gatekeeperName = spaceResourceName(spaceId, ROLE_GATEKEEPER);
    if (await inspectOwnContainer(spaceId, gatekeeperName)) {
      await docker(['stop', gatekeeperName], CHANGE_TIMEOUT_MS);
    }
  };

  const startGatekeeper = async (spaceId: string): Promise<void> => {
    const name = spaceResourceName(spaceId, ROLE_GATEKEEPER);
    const container = await requireGatekeeperContainer(spaceId);
    if (container.State?.Running !== true) {
      await requireGatekeeperVerified(spaceId, container);
      await docker(['start', name], CHANGE_TIMEOUT_MS);
    }
    await gatekeeper.writeProgram(spaceId, { bindAddress: await innerAddressOf(spaceId) });
    await gatekeeper.waitUntilReady(spaceId);
  };

  const recreate = async (spaceId: string, old: DockerInspectEntry, toolsVolume: string): Promise<void> => {
    const name = spaceResourceName(spaceId, ROLE_SPACE);
    const aside = spaceResourceName(spaceId, ROLE_SPACE, ASIDE_SUFFIX);
    const oldLabels = parseSpaceLabels(old.Config?.Labels);
    if (!oldLabels) {
      throw new SpaceError('space_not_ours', `Container ${name} exists but this OhPiChamber installation did not create it`);
    }
    const labels = buildSpaceLabels({ ...oldLabels, role: ROLE_SPACE, owner });
    await docker(['rename', name, aside], CHANGE_TIMEOUT_MS);
    let createdId = '';
    try {
      createdId = (await docker(buildSpaceCreateArgs({
        spaceId,
        containerName: name,
        labelArguments: labelArgs(labels),
        network: spaceResourceName(spaceId, ROLE_NETWORK),
        workVolume: spaceResourceName(spaceId, ROLE_VOLUME, 'work'),
        homeVolume: spaceResourceName(spaceId, ROLE_VOLUME, 'home'),
        toolsVolume,
        memoryBytes: old.HostConfig?.Memory ?? 0,
        image: SPACE_BASE_IMAGE,
      }), CHANGE_TIMEOUT_MS)).trim().split('\n').pop() ?? '';
      await requireVerified(spaceId, await inspectOwnContainer(spaceId, createdId) ?? {});
      await docker(['start', createdId], CHANGE_TIMEOUT_MS);
      await server.waitUntilReady(spaceId);
    } catch (error) {
      const rollbackFailures: PlaceRemovalFailure[] = [];
      const problem = createdId ? await removeOne('container', createdId) : null;
      if (problem) rollbackFailures.push({ ...problem, name });
      try {
        await docker(['rename', aside, name], CHANGE_TIMEOUT_MS);
      } catch (renameError) {
        const current = await inspect('container', name).catch(() => null);
        if (current?.Id !== old.Id) {
          const message = renameError instanceof Error ? renameError.message : (errorDetailSchema.safeParse(renameError).data?.message ?? String(renameError));
          rollbackFailures.push({ kind: 'container', name: aside, message });
        }
      }
      rollbackFailures.push(...(await tools.removeIfUnlabelled(toolsVolume)));
      const outcome = rollbackFailures.length === 0
        ? 'The space keeps its old container.'
        : `Putting the old container back failed for: ${rollbackFailures.map((item) => `${item.kind} ${item.name}`).join(', ')}. Start the space again to repair it.`;
      const detail = errorDetailSchema.safeParse(error).data;
      const message = error instanceof Error ? error.message : (detail?.message ?? String(error));
      const wrapped = new SpaceError(
        detail?.code ?? 'space_recreate_failed',
        `Could not move the space to the current tools. ${message} ${outcome}`,
        { original: error instanceof SpaceError ? error.details ?? null : null, rollbackFailures },
      );
      wrapped.cause = error;
      throw wrapped;
    }
    await removeOne('container', aside);
    await tools.prune();
  };

  const startOnce = async (spaceId: string): Promise<void> => {
    const name = spaceResourceName(spaceId, ROLE_SPACE);
    const aside = spaceResourceName(spaceId, ROLE_SPACE, ASIDE_SUFFIX);
    let container = await inspectOwnContainer(spaceId, name);
    const waiting = await inspectOwnContainer(spaceId, aside);
    if (!container && !waiting) {
      throw new SpaceError('space_not_found', `Space ${spaceId} has no container in Docker`);
    }
    if (container?.State?.Running === true) {
      await startGatekeeper(spaceId);
      return;
    }
    if (waiting) {
      const problem = container ? await removeStoppedContainer(String(container.Id ?? '')) : null;
      if (problem) {
        if ((await inspectOwnContainer(spaceId, name))?.State?.Running === true) {
          await startGatekeeper(spaceId);
          return;
        }
        throw new SpaceError('space_recreate_failed', `Could not remove the unfinished container ${name}: ${problem.message}`);
      }
      await docker(['rename', aside, name], CHANGE_TIMEOUT_MS);
      container = await inspectOwnContainer(spaceId, name);
      if (!container) {
        throw new SpaceError('space_not_found', `Space ${spaceId} lost its container during the repair of a move`);
      }
    }
    if (!container) {
      throw new SpaceError('space_not_found', `Space ${spaceId} has no container in Docker`);
    }
    await ensureImage();
    const toolsVolume = await tools.ensure();
    await startGatekeeper(spaceId);
    const mounted = (container.Mounts ?? []).find((mount) => mount.Destination === TOOLS_MOUNT_PATH)?.Name;
    if (mounted !== toolsVolume) {
      await recreate(spaceId, container, toolsVolume);
      return;
    }
    await docker(['start', name], CHANGE_TIMEOUT_MS);
    await server.waitUntilReady(spaceId);
  };

  const start = async (spaceId: string): Promise<void> => {
    requireSpaceId(spaceId);
    let pending = starting.get(spaceId);
    if (!pending) {
      pending = startOnce(spaceId).finally(() => { starting.delete(spaceId); });
      starting.set(spaceId, pending);
    }
    return pending;
  };

  return {
    id: DOCKER_PLACE_ID,
    check,
    create,
    list,
    exec,
    execArgv,
    connect,
    stop,
    start,
    remove,
    verify,
    readDisk: disk.read,
    cleanUpDisk: disk.cleanUp,
    pullImage,
    imagePulling: () => imagePull !== null,
  };
}
