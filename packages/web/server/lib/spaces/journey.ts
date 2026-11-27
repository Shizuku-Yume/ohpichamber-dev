import crypto from 'node:crypto';
import fsPromises from 'node:fs/promises';
import { z } from 'zod';

import type { JsonValue } from '../shared/json-values.js';
import type {
  ApplyAsBranchResult,
  ApplyAsChangesResult,
  ApplyStateDescription,
  BringCodeOutResult,
  CodeOutChannel,
} from './code-out.js';
import type { CodeInChannel } from './code-in.js';
import { SpaceError } from './errors.js';
import type { SpaceErrorDetails } from './errors.js';
import type { GatekeeperChannel, GatekeeperJournal } from './gatekeeper-channel.js';
import { DEFAULT_IDLE_STOP, idleStopSchema } from './idle-stop.js';
import type { IdleStopSetting } from './idle-stop.js';
import { ROLE_GATEKEEPER, createSpaceId, hashProjectDirectory, spaceResourceName } from './labels.js';
import { spaceProjectPath, spaceWindowUrl } from './layout.js';
import type {
  PlaceDiskCleanUpResult,
  PlaceDiskUsage,
  PlaceResourceRef,
  SpaceManager,
  SpacePlace,
} from './manager.js';
import { requireSpacesReleased } from './release.js';
import { domainSchema, networkSchema, secretSourceSchema } from './space-records.js';
import type {
  SpaceGrant,
  SpaceNetwork,
  SpaceRecord,
  SpaceRecordReadResult,
  SpaceRecordWriteInput,
} from './space-records.js';
import { createSpaceToken } from './space-server.js';
import { createSpaceSetup, setupCommandsSchema } from './space-setup.js';

const GRANT_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;
const isHttpUrl = (value: string): boolean => {
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
};
const grantProviderSchema = z.string().regex(GRANT_ID_PATTERN);
const grantUpstreamSchema = z.string().url().refine(isHttpUrl, 'http or https');
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== '';

const createRequestSchema = z.object({
  projectDirectory: z.string().min(1),
  name: z.string().trim().min(1),
  start: z.enum(['clean', 'uncommitted']).default('uncommitted'),
  network: networkSchema.default({ mode: 'allowlist', domains: [] }),
  setupCommands: setupCommandsSchema.default([]),
});
const CREATE_REFUSALS = {
  projectDirectory: ['project_not_registered', 'A space is made for a project this OhPiChamber knows. Add the project first, then create the space.'] as const,
  name: ['invalid_space_name', 'A space needs a name.'] as const,
  start: ['invalid_snapshot_mode', 'A space starts from a clean commit or with the uncommitted changes.'] as const,
  network: ['invalid_network', 'The network of a space is allowlist or open, with a list of domain names for the allowlist.'] as const,
  setupCommands: ['invalid_setup_commands', 'The setup commands are a list of at most 100 commands of at most 4000 characters each.'] as const,
};

const refusalForField = (field: PropertyKey | undefined): readonly [string, string] => {
  switch (field) {
    case 'projectDirectory': return CREATE_REFUSALS.projectDirectory;
    case 'name': return CREATE_REFUSALS.name;
    case 'start': return CREATE_REFUSALS.start;
    case 'setupCommands': return CREATE_REFUSALS.setupCommands;
    default: return CREATE_REFUSALS.network;
  }
};

const setupRequestSchema = z.object({ commands: setupCommandsSchema }).strict();

const MAX_SECRET_LENGTH = 8192;
const grantRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('model'),
    provider: grantProviderSchema,
    upstream: grantUpstreamSchema,
    secret: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('typed'), value: z.string().min(1).max(MAX_SECRET_LENGTH) }).strict(),
      secretSourceSchema.options[0],
    ]),
  }).strict(),
  z.object({ kind: z.literal('domain'), upstream: grantUpstreamSchema }).strict(),
]);

interface RestoreGrantsResult {
  restored: string[];
  needsAccess: string[];
}

interface WindowGrantTarget {
  upstream: string;
  header: string | null;
  secret: string | null;
}

const HEADER_BY_PROVIDER = new Map<string, string>([
  ['anthropic', 'x-api-key'],
  ['google', 'x-goog-api-key'],
  ...['openai', 'openrouter', 'groq', 'mistral', 'deepseek', 'xai'].map((provider): [string, string] => [provider, 'authorization']),
]);

const openDomainRequestSchema = z.object({
  domain: z.string().trim().toLowerCase().pipe(domainSchema),
}).strict();

const applyRequestSchema = z.discriminatedUnion('as', [
  z.object({ as: z.literal('branch'), branch: z.string(), removeAfterwards: z.boolean().default(false) }),
  z.object({ as: z.literal('changes'), removeAfterwards: z.boolean().default(false) }),
]);

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  details: z.object({ cause: z.string().nullable().optional() }).nullable().optional(),
});

export interface SpaceRecordsStore {
  read: (spaceId: string) => SpaceRecordReadResult;
  write: (spaceId: string, record: SpaceRecordWriteInput) => SpaceRecord;
  update: (spaceId: string, changes: Partial<SpaceRecord>) => SpaceRecordReadResult;
  remove: (spaceId: string) => void;
}

export interface SpaceServerChannel {
  writeToken: (spaceId: string, token: string) => Promise<string>;
  writeIdleStop: (spaceId: string, setting: IdleStopSetting) => Promise<string>;
}

export interface JourneyPlace extends SpacePlace {
  readDisk: () => Promise<PlaceDiskUsage>;
  cleanUpDisk: () => Promise<PlaceDiskCleanUpResult>;
  pullImage: () => Promise<void>;
  imagePulling: () => boolean;
}

export interface JourneyArchiveChatsInput {
  spaceId: string;
  name: string;
  projectDirectory: string | null;
  running: boolean;
  allowUnsaved: boolean;
}

export interface JourneyArchiveChatsResult {
  saved: number;
  tooLarge: string[];
  failed: number;
  listed: boolean;
}

export interface JourneyLogger {
  info?: ((message: string) => void) | undefined;
  warn?: ((message: string) => void) | undefined;
}

export interface CreateSpaceJourneyOptions {
  manager: SpaceManager;
  place: JourneyPlace;
  gatekeeper: GatekeeperChannel;
  codeIn: CodeInChannel;
  codeOut: CodeOutChannel;
  records: SpaceRecordsStore;
  serverInside: SpaceServerChannel;
  listProjectDirectories: () => Promise<string[]>;
  archiveChats?: ((input: JourneyArchiveChatsInput) => Promise<JourneyArchiveChatsResult>) | null | undefined;
  readHostSecret?: ((name: string) => string | undefined) | undefined;
  requireReleased?: (() => void) | undefined;
  readIdleStop?: (() => Promise<IdleStopSetting>) | undefined;
  saveIdleStop?: ((setting: IdleStopSetting) => Promise<void>) | undefined;
  folderExists?: ((directory: string) => Promise<boolean>) | undefined;
  announce?: ((spaceId: string, payload: JsonValue) => void) | undefined;
  logger?: JourneyLogger | undefined;
  now?: (() => Date) | undefined;
}

export type SpaceFailure = {
  code: string;
  message: string;
  details: SpaceErrorDetails | null;
  cleanup?: SpaceFailure[] | undefined;
};

export type DescribedGrant = SpaceGrant & { url: string };

export type DescribedSetup =
  | { state: 'queued'; total: number }
  | { state: 'running'; index: number; total: number; command: string }
  | { state: 'interrupted'; total: number }
  | { state: 'done'; total: number }
  | {
    state: 'failed';
    index: number;
    total: number;
    command: string;
    exitCode: number | null;
    timedOut: boolean;
    startedAt: string | null;
    finishedAt: string;
  };

export interface ListedSpace {
  id: string;
  name: string;
  placeId: string;
  projectDirectory: string | null;
  directory: string | null;
  projectFolder: { path: string | null; found: boolean | null };
  created: string;
  state: string;
  stoppedIdle: boolean;
  step: string | null;
  failure: SpaceFailure | null;
  network: SpaceNetwork | null;
  history: string;
  setup: DescribedSetup | null;
  grants: DescribedGrant[];
  access: 'granted' | 'needs_access' | 'unknown' | null;
  needsAccess: string[];
  damaged: boolean;
  damage: 'gatekeeper_gone' | 'repairable' | null;
  missing: string[];
  orphans: PlaceResourceRef[];
}

export interface StartedSpace extends ListedSpace {
  networkRestored: boolean;
  grantsRestored: string[];
  needsAccess: string[];
}

export interface RemoveSpaceResult {
  id: string;
  removed: boolean;
  refsRemoved: boolean | null;
  failures: SpaceFailure[];
  chats: JourneyArchiveChatsResult | null;
}

export interface StopAllSpacesResult {
  stopped: Array<{ id: string; name: string }>;
  stillRunning: Array<{ id: string; name: string } & SpaceFailure>;
  unknown?: SpaceFailure | undefined;
}

export interface CleanUpDiskSummary {
  freedBytes: number;
  kept: Array<{ kind: string; reason: string }>;
  disk: PlaceDiskUsage;
}

export interface ApplySpaceResult {
  brought: BringCodeOutResult;
  applied: ({ status: 'applied' } & ApplyAsBranchResult) | ApplyAsChangesResult;
  removal: RemoveSpaceResult | null;
  kept: SpaceFailure | null;
}

export type CreateSpaceRequest = z.input<typeof createRequestSchema>;
export type GrantAccessRequest = z.input<typeof grantRequestSchema>;
export type OpenDomainRequest = z.input<typeof openDomainRequestSchema>;
export type RunSetupRequest = z.input<typeof setupRequestSchema>;
export type ApplySpaceRequest = z.input<typeof applyRequestSchema>;

export interface SpaceJourney {
  createSpace: (request: CreateSpaceRequest | JsonValue) => Promise<ListedSpace>;
  listSpaces: (options?: { access?: boolean | undefined }) => Promise<ListedSpace[]>;
  startSpace: (spaceId: string) => Promise<StartedSpace>;
  stopSpace: (spaceId: string) => Promise<ListedSpace>;
  restartSpace: (spaceId: string) => Promise<StartedSpace>;
  removeSpace: (spaceId: string, options?: { allowUnsaved?: boolean | undefined }) => Promise<RemoveSpaceResult>;
  stopAllSpaces: () => Promise<StopAllSpacesResult>;
  reopen: () => void;
  grantAccess: (spaceId: string, request: GrantAccessRequest | JsonValue) => Promise<{ grant: DescribedGrant }>;
  openDomain: (spaceId: string, request: OpenDomainRequest | JsonValue) => Promise<{ network: SpaceNetwork }>;
  restoreLostGrants: () => Promise<void>;
  readJournal: (spaceId: string) => Promise<GatekeeperJournal>;
  previewApply: (spaceId: string) => Promise<Omit<BringCodeOutResult, 'result'> & ApplyStateDescription>;
  applySpace: (spaceId: string, request: ApplySpaceRequest | JsonValue) => Promise<ApplySpaceResult>;
  readIdleStopSetting: () => Promise<IdleStopSetting>;
  changeIdleStop: (request: IdleStopSetting | JsonValue) => Promise<IdleStopSetting>;
  runSetup: (spaceId: string, request: RunSetupRequest | JsonValue) => Promise<ListedSpace>;
  readSetup: (spaceId: string) => Promise<{ setup: DescribedSetup | null; output: string | null }>;
  readDisk: (placeId: string) => Promise<PlaceDiskUsage>;
  cleanUpDisk: (placeId: string) => Promise<CleanUpDiskSummary>;
  pullImage: (placeId: string) => Promise<PlaceDiskUsage>;
}

interface PendingEntry {
  id: string;
  name: string;
  placeId: string;
  projectDirectory: string;
  directory: string;
  created: string;
  state: string;
  step: string;
  failure: SpaceFailure | null;
  network: SpaceNetwork;
  setupTotal: number;
  identityCopied?: { name: boolean; email: boolean } | undefined;
}

const failureOf = (cause: unknown): SpaceFailure => {
  const detail = errorDetailSchema.safeParse(cause).data;
  const message = cause instanceof Error ? cause.message : (detail?.message ?? String(cause));
  return {
    code: cause instanceof SpaceError ? cause.code : 'space_journey_failed',
    message,
    details: cause instanceof SpaceError ? cause.details ?? null : null,
  };
};

const shortErrorReason = (cause: unknown): string => {
  if (cause instanceof SpaceError) return cause.code;
  const detail = errorDetailSchema.safeParse(cause).data;
  const fallback = cause instanceof Error ? cause.message : String(cause);
  return String(detail?.code ?? detail?.message ?? fallback);
};

export function createSpaceJourney({
  manager,
  place,
  gatekeeper,
  codeIn,
  codeOut,
  records,
  serverInside,
  listProjectDirectories,
  archiveChats = null,
  readHostSecret = () => undefined,
  requireReleased = requireSpacesReleased,
  readIdleStop = async () => ({ ...DEFAULT_IDLE_STOP }),
  saveIdleStop = async () => { },
  folderExists = async (directory: string) => (await fsPromises.stat(directory).catch(() => null))?.isDirectory() === true,
  announce = () => { },
  logger = console,
  now = () => new Date(),
}: CreateSpaceJourneyOptions): SpaceJourney {
  const pending = new Map<string, PendingEntry>();
  const busy = new Set<string>();
  let closing = false;
  let idleStopTurn: Promise<void> = Promise.resolve();
  const strayStops = new Map<string, Promise<void>>();

  const setup = createSpaceSetup({
    exec: place.exec,
    records,
    announce: (spaceId: string) => announce(spaceId, { type: 'openchamber:space-setup', properties: { spaceId, timestamp: now().getTime() } }),
    logger,
    now,
  });

  const exclusive = async <Result>(spaceId: string, work: () => Promise<Result>): Promise<Result> => {
    if (busy.has(spaceId)) throw new SpaceError('space_busy', 'Another action on this space is still running. Wait for it to finish.');
    busy.add(spaceId);
    try {
      return await work();
    } finally {
      busy.delete(spaceId);
    }
  };

  const requireNotPending = (spaceId: string): void => {
    const waiting = pending.get(spaceId);
    if (!waiting) return;
    if (waiting.state === 'failed') throw new SpaceError('space_creation_failed', 'Making this space failed. Dismiss it, then create a new one.');
    throw new SpaceError('space_preparing', 'This space is still being made.');
  };

  const registeredProjects = async (): Promise<Map<string, string>> => {
    const directories = await listProjectDirectories();
    return new Map(directories.map((directory) => [hashProjectDirectory(directory), directory]));
  };

  const requireRegisteredProject = async (directory: string): Promise<string> => {
    const projects = await registeredProjects();
    if (projects.get(hashProjectDirectory(directory)) !== directory) {
      const [code, message] = CREATE_REFUSALS.projectDirectory;
      throw new SpaceError(code, message);
    }
    return directory;
  };

  const progress = (entry: PendingEntry, step: string, failure: SpaceFailure | null = null): void => {
    entry.step = step;
    entry.state = step === 'failed' ? 'failed' : step === 'ready' ? 'running' : 'preparing';
    entry.failure = failure;
    announce(entry.id, { type: 'openchamber:space-progress', properties: { spaceId: entry.id, step, failure, timestamp: now().getTime() } });
  };

  interface RemoveEverythingOutcome {
    removed: boolean;
    refsRemoved: boolean | null;
    failures: SpaceFailure[];
  }

  const removeEverything = async (
    spaceId: string,
    repository: string | null | undefined,
  ): Promise<RemoveEverythingOutcome> => {
    const outcome: RemoveEverythingOutcome = {
      removed: false,
      refsRemoved: null,
      failures: [],
    };
    try {
      await manager.removeSpace({ placeId: place.id, spaceId });
      outcome.removed = true;
    } catch (error) {
      outcome.failures.push(failureOf(error));
    }
    if (repository) {
      try {
        await codeIn.removeSpaceRefs({ repository, spaceId });
        outcome.refsRemoved = true;
      } catch (error) {
        outcome.refsRemoved = false;
        if (error instanceof SpaceError && error.code === 'project_folder_missing') {
          logger.warn?.(`[spaces] the service refs of space ${spaceId} stay in its project folder, which is no longer at its path`);
        } else {
          outcome.failures.push(failureOf(error));
        }
      }
    }
    records.remove(spaceId);
    return outcome;
  };

  const writeIdleStop = async (spaceId: string, setting: IdleStopSetting): Promise<void> => {
    try {
      await serverInside.writeIdleStop(spaceId, setting);
    } catch (error) {
      logger.warn?.(`[spaces] space ${spaceId} keeps its idle stop setting: ${shortErrorReason(error)}`);
    }
  };

  const deliverIdleStop = (spaceId: string): Promise<void> => {
    const delivery = idleStopTurn.then(async () => writeIdleStop(spaceId, await readIdleStop()));
    idleStopTurn = delivery.catch(() => { });
    return delivery.catch((cause) => {
      logger.warn?.(`[spaces] space ${spaceId} keeps its idle stop setting: ${shortErrorReason(cause)}`);
    });
  };

  const sendHistoryInBackground = ({
    repository,
    spaceId,
    spacePath,
    base,
  }: {
    repository: string;
    spaceId: string;
    spacePath: string;
    base: string;
  }): void => {
    codeIn.sendHistory({ repository, spaceId, spacePath, base })
      .then((result) => { records.update(spaceId, { history: result.status }); })
      .catch((cause) => {
        const detail = errorDetailSchema.safeParse(cause).data;
        const reason = detail?.details?.cause ?? detail?.code ?? detail?.message ?? String(cause);
        logger.warn?.(`[spaces] the history of space ${spaceId} did not arrive: ${reason}`);
        records.update(spaceId, { history: 'failed' });
      });
  };

  const prepare = async (
    entry: PendingEntry,
    {
      projectDirectory,
      name,
      start,
      network,
      setupCommands,
    }: {
      projectDirectory: string;
      name: string;
      start: 'clean' | 'uncommitted';
      network: SpaceNetwork;
      setupCommands: string[];
    },
  ): Promise<void> => {
    let created = false;
    try {
      progress(entry, 'checking_place');
      const check = await place.check();
      if (!check.available) throw new SpaceError(check.code, check.message);
      if (network.mode === 'allowlist' && check.hostIsolation !== true) {
        throw new SpaceError(
          'place_cannot_restrict_network',
          'This place cannot keep a space away from the machine it runs on, so an allowlist would not hold. Use a newer Docker engine, or choose the open network with that in mind.',
        );
      }
      progress(entry, 'creating');
      await manager.createSpace({ id: entry.id, placeId: place.id, projectDirectory, name });
      created = true;
      records.write(entry.id, { network, repository: projectDirectory });
      progress(entry, 'setting_network');
      await gatekeeper.setNetwork(entry.id, network);
      progress(entry, 'bringing_code');
      const arrived = await codeIn.bringCodeIn({ repository: projectDirectory, spaceId: entry.id, mode: start });
      records.update(entry.id, { spacePath: arrived.spacePath, base: arrived.base });
      entry.identityCopied = arrived.identityCopied;
      await deliverIdleStop(entry.id);
      pending.delete(entry.id);
      progress(entry, 'ready');
      if (setupCommands.length > 0) setup.start(entry.id, { projectPath: arrived.spacePath, commands: setupCommands });
      sendHistoryInBackground({ repository: projectDirectory, spaceId: entry.id, spacePath: arrived.spacePath, base: arrived.base });
    } catch (error) {
      const failure = failureOf(error);
      if (created) {
        const cleanup = await removeEverything(entry.id, projectDirectory);
        if (cleanup.failures.length > 0) failure.cleanup = cleanup.failures;
      }
      logger.warn?.(`[spaces] creating space ${entry.id} failed at ${entry.step}: ${failure.code}`);
      progress(entry, 'failed', failure);
    }
  };

  const describePending = (entry: PendingEntry): ListedSpace => ({
    id: entry.id,
    name: entry.name,
    placeId: entry.placeId,
    projectDirectory: entry.projectDirectory,
    directory: entry.directory,
    projectFolder: { path: entry.projectDirectory, found: null },
    created: entry.created,
    state: entry.state,
    stoppedIdle: false,
    step: entry.step,
    failure: entry.failure,
    network: entry.network,
    history: 'pending',
    setup: entry.setupTotal > 0 ? { state: 'queued', total: entry.setupTotal } : null,
    grants: [],
    access: null,
    needsAccess: [],
    damaged: false,
    damage: null,
    missing: [],
    orphans: [],
  });

  const createSpace = async (request: CreateSpaceRequest | JsonValue): Promise<ListedSpace> => {
    requireReleased();
    if (closing) throw new SpaceError('isolated_spaces_off', 'Isolated spaces are being turned off.');
    const parsed = createRequestSchema.safeParse(request ?? {});
    if (!parsed.success) {
      const [code, message] = refusalForField(parsed.error.issues[0]?.path?.[0]);
      throw new SpaceError(code, message);
    }
    const { name, start, network, setupCommands } = parsed.data;
    const projectDirectory = await requireRegisteredProject(parsed.data.projectDirectory);
    const id = createSpaceId();
    const entry: PendingEntry = {
      id,
      name,
      placeId: place.id,
      projectDirectory,
      directory: spaceProjectPath(id, projectDirectory),
      created: now().toISOString(),
      state: 'preparing',
      step: 'checking_place',
      failure: null,
      network,
      setupTotal: setupCommands.length,
    };
    pending.set(entry.id, entry);
    void prepare(entry, { projectDirectory, name, start, network, setupCommands });
    return describePending(entry);
  };

  const describeGrant = (grant: SpaceGrant): DescribedGrant => ({ ...grant, url: spaceWindowUrl(grant.id) });

  const deliverGrant = async (spaceId: string, grant: SpaceGrant): Promise<boolean> => {
    let secret: string | null = null;
    const header = grant.kind === 'model' ? grant.header : null;
    if (grant.kind === 'model') {
      if (grant.source.kind === 'typed') return false;
      secret = readHostSecret(grant.source.name) ?? null;
      if (secret === null || secret === '') return false;
    }
    try {
      await gatekeeper.addGrant(spaceId, { id: grant.id, upstream: grant.upstream, header, secret });
      return true;
    } catch (error) {
      logger.warn?.(`[spaces] the grant ${grant.id} of space ${spaceId} could not be said again: ${shortErrorReason(error)}`);
      return false;
    }
  };

  const restoreGrants = async (spaceId: string, grants: readonly SpaceGrant[]): Promise<{ restored: string[]; needsAccess: string[] }> => {
    const restored: string[] = [];
    const needsAccess: string[] = [];
    for (const grant of grants) {
      (await deliverGrant(spaceId, grant) ? restored : needsAccess).push(grant.id);
    }
    return { restored, needsAccess };
  };

  const restoreLostGrants = async (): Promise<void> => {
    requireReleased();
    let spaces;
    try {
      spaces = await manager.listSpaces({ placeId: place.id });
    } catch (error) {
      logger.warn?.(`[spaces] could not list the spaces to say their grants again: ${shortErrorReason(error)}`);
      return;
    }
    for (const space of spaces) {
      if (space.state !== 'running' || busy.has(space.id)) continue;
      const grants = (records.read(space.id).record?.grants ?? []).filter((grant) => grant.kind !== 'model' || grant.source.kind === 'env');
      if (grants.length === 0) continue;
      let held: Set<string>;
      try {
        held = new Set((await gatekeeper.readPolicy(space.id)).grants);
      } catch (error) {
        logger.warn?.(`[spaces] the gatekeeper of space ${space.id} did not say what it holds: ${shortErrorReason(error)}`);
        continue;
      }
      const lost = grants.filter((grant) => !held.has(grant.id));
      if (lost.length === 0) continue;
      try {
        const { restored } = await exclusive(space.id, () => restoreGrants(space.id, lost));
        if (restored.length > 0) logger.info?.(`[spaces] said the grants ${restored.join(', ')} of space ${space.id} again`);
      } catch (error) {
        logger.warn?.(`[spaces] the grants of space ${space.id} were not said again: ${shortErrorReason(error)}`);
      }
    }
  };

  const readAccess = async (
    space: { id: string; state: string },
    grants: readonly SpaceGrant[],
  ): Promise<{ access: 'granted' | 'needs_access' | 'unknown' | null; needsAccess: string[] }> => {
    if (space.state !== 'running' || grants.length === 0 || busy.has(space.id)) return { access: null, needsAccess: [] };
    try {
      const held = new Set((await gatekeeper.readPolicy(space.id)).grants);
      const needsAccess = grants.filter((grant) => !held.has(grant.id)).map((grant) => grant.id);
      return { access: needsAccess.length === 0 ? 'granted' : 'needs_access', needsAccess };
    } catch (error) {
      logger.warn?.(`[spaces] the gatekeeper of space ${space.id} did not say what it holds: ${shortErrorReason(error)}`);
      return { access: 'unknown', needsAccess: [] };
    }
  };

  const readDamage = async (
    space: { id: string; damaged: boolean; missing: readonly string[] },
  ): Promise<'gatekeeper_gone' | 'repairable' | null> => {
    if (!space.damaged) return null;
    if (!space.missing.includes(spaceResourceName(space.id, ROLE_GATEKEEPER))) return 'repairable';
    try {
      const violations = await place.verify(space.id);
      return violations.some((violation) => violation.check === 'gatekeeper_missing') ? 'gatekeeper_gone' : 'repairable';
    } catch (error) {
      if (error instanceof SpaceError && error.code === 'gatekeeper_missing') return 'gatekeeper_gone';
      logger.warn?.(`[spaces] space ${space.id} could not be verified: ${shortErrorReason(error)}`);
      return 'repairable';
    }
  };

  const stopStrayGatekeeper = (spaceId: string): void => {
    if (busy.has(spaceId) || strayStops.has(spaceId)) return;
    const stopping = manager.stopSpace({ placeId: place.id, spaceId })
      .catch((cause) => {
        logger.warn?.(`[spaces] the gatekeeper beside stopped space ${spaceId} still runs: ${shortErrorReason(cause)}`);
      })
      .finally(() => { strayStops.delete(spaceId); });
    strayStops.set(spaceId, stopping);
  };

  const listSpaces = async ({ access = false }: { access?: boolean | undefined } = {}): Promise<ListedSpace[]> => {
    const [spaces, projects] = await Promise.all([manager.listSpaces({ placeId: place.id }), registeredProjects()]);
    const listed = await Promise.all(spaces.map(async (space): Promise<ListedSpace> => {
      const projectDirectory = projects.get(space.project) ?? null;
      const { record } = records.read(space.id);
      const grants = record?.grants ?? [];
      const projectPath = record?.repository ?? projectDirectory;
      const codeNeverArrived = record !== null && record.spacePath === null;
      return {
        id: space.id,
        name: space.name,
        placeId: space.placeId,
        projectDirectory,
        directory: projectDirectory === null ? null : spaceProjectPath(space.id, projectDirectory),
        projectFolder: { path: projectPath, found: projectPath === null ? null : await folderExists(projectPath) },
        created: space.created,
        state: codeNeverArrived ? 'failed' : space.state,
        stoppedIdle: space.stoppedIdle === true,
        step: codeNeverArrived ? 'failed' : null,
        failure: codeNeverArrived
          ? { code: 'space_code_never_arrived', message: 'OhPiChamber closed before the code arrived. Delete the space and create it again.', details: null }
          : null,
        network: record?.network ?? null,
        history: record?.history ?? 'unknown',
        setup: setup.describe(space.id, record),
        grants: grants.map(describeGrant),
        ...(access ? await readAccess(space, grants) : { access: null, needsAccess: [] }),
        damaged: space.damaged,
        damage: await readDamage(space),
        missing: space.missing,
        orphans: space.orphans,
      };
    }));
    for (const space of spaces) {
      if (space.state === 'exited' && space.gatekeeperRunning === true && !pending.has(space.id)) stopStrayGatekeeper(space.id);
    }
    const waiting = new Map(Array.from(pending.values(), (entry) => [entry.id, describePending(entry)]));
    const merged = listed.map((space) => waiting.get(space.id) ?? space);
    const known = new Set(listed.map((space) => space.id));
    return [...merged, ...Array.from(waiting.values()).filter((entry) => !known.has(entry.id))];
  };

  const requireListed = async (spaceId: string): Promise<ListedSpace> => {
    const space = (await listSpaces()).find((entry) => entry.id === spaceId);
    if (!space) throw new SpaceError('space_not_found', `There is no space ${spaceId}`);
    return space;
  };

  const startUnlocked = async (spaceId: string): Promise<StartedSpace> => {
    if (closing) throw new SpaceError('isolated_spaces_off', 'Isolated spaces are being turned off.');
    requireReleased();
    requireNotPending(spaceId);
    await strayStops.get(spaceId);
    await manager.startSpace({ placeId: place.id, spaceId });
    const { record } = records.read(spaceId);
    let networkRestored = false;
    let grants: RestoreGrantsResult = { restored: [], needsAccess: [] };
    if (record) {
      await gatekeeper.setNetwork(spaceId, record.network);
      networkRestored = true;
      grants = await restoreGrants(spaceId, record.grants);
      if ((record.history === 'pending' || record.history === 'failed') && record.repository && record.spacePath && record.base) {
        sendHistoryInBackground({ repository: record.repository, spaceId, spacePath: record.spacePath, base: record.base });
      }
    }
    await deliverIdleStop(spaceId);
    return { ...(await requireListed(spaceId)), networkRestored, grantsRestored: grants.restored, needsAccess: grants.needsAccess };
  };

  const startSpace = (spaceId: string): Promise<StartedSpace> => exclusive(spaceId, () => startUnlocked(spaceId));

  const restartSpace = (spaceId: string): Promise<StartedSpace> => exclusive(spaceId, async () => {
    if (closing) throw new SpaceError('isolated_spaces_off', 'Isolated spaces are being turned off.');
    requireReleased();
    requireNotPending(spaceId);
    const space = await requireListed(spaceId);
    if (space.state !== 'running') throw new SpaceError('space_not_running', 'This space is stopped. Start it instead.');
    try {
      await serverInside.writeToken(spaceId, createSpaceToken());
    } catch (error) {
      logger.warn?.(`[spaces] the server inside space ${spaceId} keeps its token: ${shortErrorReason(error)}`);
    }
    await manager.stopSpace({ placeId: place.id, spaceId });
    return startUnlocked(spaceId);
  });

  const grantUnlocked = (spaceId: string, request: GrantAccessRequest | JsonValue): Promise<{ grant: DescribedGrant }> =>
    exclusive(spaceId, async () => {
      requireNotPending(spaceId);
      const parsed = grantRequestSchema.safeParse(request ?? {});
      if (!parsed.success) {
        throw new SpaceError('invalid_grant_request', 'A grant is a model key for a provider, typed or named by a host environment variable, or an opened domain.');
      }
      const space = await requireListed(spaceId);
      if (space.state !== 'running') {
        throw new SpaceError('space_not_running', 'A grant goes to the gatekeeper of a running space. Start the space, then grant.');
      }
      const current = records.read(spaceId);
      if (current.status !== 'ok') {
        throw new SpaceError(
          'space_record_unreadable',
          'The host\'s record of this space cannot be read, so a grant could not be remembered. Remove the space and create it again.',
        );
      }

      const asked = parsed.data;
      let grant: SpaceGrant;
      let window: WindowGrantTarget;
      if (asked.kind === 'model') {
        const header = HEADER_BY_PROVIDER.get(asked.provider);
        if (header === undefined) {
          throw new SpaceError(
            'provider_not_supported',
            `A key for ${asked.provider} cannot be given through the network filter yet: it reads its key in a way the network filter does not know.`,
          );
        }
        const source = asked.secret.kind === 'typed' ? { kind: 'typed' as const } : { kind: 'env' as const, name: asked.secret.name };
        const secret = asked.secret.kind === 'typed' ? asked.secret.value : readHostSecret(asked.secret.name);
        if (!isNonEmptyString(secret)) {
          const name = asked.secret.kind === 'env' ? asked.secret.name : '';
          throw new SpaceError('secret_source_missing', `The environment variable ${name} is not set for OhPiChamber, so there is no key to give.`);
        }
        grant = { kind: 'model', id: asked.provider, provider: asked.provider, upstream: asked.upstream, header, source };
        window = { upstream: grant.upstream, header, secret };
      } else {
        grant = { kind: 'domain', id: `open-${crypto.randomBytes(6).toString('hex')}`, upstream: asked.upstream };
        window = { upstream: grant.upstream, header: null, secret: null };
      }
      await gatekeeper.addGrant(spaceId, { id: grant.id, ...window });
      const grants = [...current.record.grants.filter((entry) => entry.id !== grant.id), grant];
      if (records.update(spaceId, { grants }).status !== 'ok') {
        throw new SpaceError(
          'space_record_unreadable',
          'The grant reached the network filter and could not be remembered, so it is gone at the next start. Remove the space and create it again.',
        );
      }
      return { grant: describeGrant(grant) };
    });

  const grantAccess = async (spaceId: string, request: GrantAccessRequest | JsonValue): Promise<{ grant: DescribedGrant }> => {
    requireReleased();
    return grantUnlocked(spaceId, request);
  };

  const openDomain = async (spaceId: string, request: OpenDomainRequest | JsonValue): Promise<{ network: SpaceNetwork }> => {
    requireReleased();
    return exclusive(spaceId, async () => {
      requireNotPending(spaceId);
      const parsed = openDomainRequestSchema.safeParse(request ?? {});
      if (!parsed.success) throw new SpaceError('invalid_domain', 'A domain is a name such as registry.npmjs.org: letters, digits and hyphens, with a dot.');
      const { domain } = parsed.data;
      const space = await requireListed(spaceId);
      if (space.state !== 'running') throw new SpaceError('space_not_running', 'A domain is opened by the gatekeeper of a running space. Start the space, then open it.');
      const current = records.read(spaceId);
      if (current.status !== 'ok') {
        throw new SpaceError(
          'space_record_unreadable',
          'The host\'s record of this space cannot be read, so an opened domain could not be remembered. Remove the space and create it again.',
        );
      }
      const { network } = current.record;
      if (network.mode === 'open') throw new SpaceError('network_is_open', 'The network of this space is open, so there is no list to add a domain to.');
      if (network.domains.includes(domain)) return { network };
      const next = networkSchema.safeParse({ mode: network.mode, domains: [...network.domains, domain] });
      if (!next.success) throw new SpaceError('too_many_domains', 'This space already has as many opened domains as a list holds.');
      await gatekeeper.setNetwork(spaceId, next.data);
      if (records.update(spaceId, { network: next.data }).status !== 'ok') {
        throw new SpaceError(
          'space_record_unreadable',
          'The domain is open now and could not be remembered, so it closes at the next start. Remove the space and create it again.',
        );
      }
      return { network: next.data };
    });
  };

  const runSetup = (spaceId: string, request: RunSetupRequest | JsonValue): Promise<ListedSpace> => exclusive(spaceId, async () => {
    requireNotPending(spaceId);
    const parsed = setupRequestSchema.safeParse(request ?? {});
    if (!parsed.success) {
      const [code, message] = CREATE_REFUSALS.setupCommands;
      throw new SpaceError(code, message);
    }
    const space = await requireListed(spaceId);
    if (space.state !== 'running') throw new SpaceError('space_not_running', 'The setup commands run inside a running space. Start the space.');
    const { record } = records.read(spaceId);
    if (!record?.spacePath) {
      throw new SpaceError(
        'space_record_unreadable',
        'The host\'s record of this space cannot be read, so it does not know where the project is inside. Remove the space and create it again.',
      );
    }
    setup.start(spaceId, { projectPath: record.spacePath, commands: parsed.data.commands });
    return requireListed(spaceId);
  });

  const readSetup = async (spaceId: string): Promise<{ setup: DescribedSetup | null; output: string | null }> => {
    const space = await requireListed(spaceId);
    return { setup: space.setup, output: setup.outputOf(records.read(spaceId).record) };
  };

  const stopSpace = (spaceId: string): Promise<ListedSpace> => exclusive(spaceId, async () => {
    requireNotPending(spaceId);
    await manager.stopSpace({ placeId: place.id, spaceId });
    return requireListed(spaceId);
  });

  const saveChatsOf = async (space: ListedSpace, allowUnsaved: boolean): Promise<JourneyArchiveChatsResult | null> => {
    if (!archiveChats) return null;
    let running = space.state === 'running';
    let started = false;
    if (!running && space.state === 'exited') {
      try {
        await manager.startSpace({ placeId: place.id, spaceId: space.id });
        running = true;
        started = true;
      } catch (error) {
        logger.warn?.(`[spaces] space ${space.id} did not start to give its chats: ${shortErrorReason(error)}`);
      }
    }
    try {
      return await archiveChats({ spaceId: space.id, name: space.name, projectDirectory: space.projectDirectory ?? null, running, allowUnsaved });
    } catch (error) {
      if (started) {
        await manager.stopSpace({ placeId: place.id, spaceId: space.id }).catch((cause) => {
          logger.warn?.(`[spaces] space ${space.id} started for its chats is still running: ${shortErrorReason(cause)}`);
        });
      }
      throw error;
    }
  };

  const removeUnlocked = async (
    spaceId: string,
    { allowUnsaved = false }: { allowUnsaved?: boolean | undefined } = {},
  ): Promise<RemoveSpaceResult> => {
    const waiting = pending.get(spaceId);
    if (waiting) {
      if (waiting.state !== 'failed') throw new SpaceError('space_preparing', 'This space is still being made. Wait for it, then remove it.');
      pending.delete(spaceId);
      const still = (await manager.listSpaces({ placeId: place.id })).some((space) => space.id === spaceId);
      if (!still) return { id: spaceId, removed: true, refsRemoved: null, failures: [], chats: null };
      return { id: spaceId, ...(await removeEverything(spaceId, waiting.projectDirectory)), chats: null };
    }
    const space = await requireListed(spaceId);
    const chats = space.state === 'failed' ? null : await saveChatsOf(space, allowUnsaved);
    const { record } = records.read(spaceId);
    const outcome = await removeEverything(spaceId, record?.repository ?? space.projectDirectory);
    return { id: spaceId, ...outcome, chats };
  };

  const removeSpace = (spaceId: string, options?: { allowUnsaved?: boolean | undefined }): Promise<RemoveSpaceResult> =>
    exclusive(spaceId, () => removeUnlocked(spaceId, options));

  const stopAllSpaces = async (): Promise<StopAllSpacesResult> => {
    const preparing = Array.from(pending.values()).filter((entry) => entry.state === 'preparing');
    if (preparing.length > 0) {
      throw new SpaceError(
        'space_preparing',
        `${preparing.length === 1 ? 'A space is' : `${preparing.length} spaces are`} still being made. Wait for that to finish first.`,
        { spaces: preparing.map((entry) => entry.id) },
      );
    }
    closing = true;
    let spaces;
    try {
      spaces = await manager.listSpaces({ placeId: place.id });
    } catch (error) {
      logger.warn?.(`[spaces] turning off without knowing which spaces run: ${shortErrorReason(error)}`);
      return { stopped: [], stillRunning: [], unknown: failureOf(error) };
    }
    const stopped: Array<{ id: string; name: string }> = [];
    const stillRunning: Array<{ id: string; name: string } & SpaceFailure> = [];
    for (const space of spaces) {
      if (space.state !== 'running') {
        if (space.gatekeeperRunning === true && !busy.has(space.id)) {
          await manager.stopSpace({ placeId: place.id, spaceId: space.id }).catch(() => { });
        }
        continue;
      }
      try {
        await manager.stopSpace({ placeId: place.id, spaceId: space.id });
        stopped.push({ id: space.id, name: space.name });
      } catch (error) {
        stillRunning.push({ id: space.id, name: space.name, ...failureOf(error) });
      }
    }
    return { stopped, stillRunning };
  };

  const readIdleStopSetting = (): Promise<IdleStopSetting> => readIdleStop();

  const changeIdleStop = (request: IdleStopSetting | JsonValue): Promise<IdleStopSetting> => {
    const parsed = idleStopSchema.safeParse(request ?? {});
    if (!parsed.success) {
      return Promise.reject(new SpaceError('invalid_idle_stop', 'The idle stop is on or off, with a whole number of hours from 1 to 168.'));
    }
    const setting = parsed.data;
    const change = idleStopTurn.then(async () => {
      await saveIdleStop(setting);
      const spaces = await manager.listSpaces({ placeId: place.id });
      for (const space of spaces) {
        if (space.state === 'running' && !pending.has(space.id)) await writeIdleStop(space.id, setting);
      }
      return setting;
    });
    idleStopTurn = change.then(() => undefined, () => undefined);
    return change;
  };

  const requirePlace = (placeId: string): void => {
    if (placeId !== place.id) throw new SpaceError('place_not_found', `There is no place ${placeId}`);
  };

  const readDisk = async (placeId: string): Promise<PlaceDiskUsage> => {
    requirePlace(placeId);
    return place.readDisk();
  };

  const cleanUpDisk = async (placeId: string): Promise<CleanUpDiskSummary> => {
    requirePlace(placeId);
    if (Array.from(pending.values()).some((entry) => entry.state === 'preparing')) {
      throw new SpaceError('space_preparing', 'A space is being made. Clean up when it is ready.');
    }
    if (place.imagePulling()) {
      throw new SpaceError('image_pulling', 'The image is being downloaded. Clean up when it is done.');
    }
    const { freedBytes, kept, machine } = await place.cleanUpDisk();
    for (const item of kept.filter((entry) => entry.reason === 'failed')) {
      logger.warn?.(`[spaces] clean-up could not remove ${item.kind} ${item.name}: ${item.message}`);
    }
    if (machine.state === 'failed') logger.warn?.(`[spaces] the Colima machine did not trim its disk: ${machine.message}`);
    if (machine.state === 'trimmed') logger.info?.('[spaces] the Colima machine trimmed its disk after a clean-up');
    return { freedBytes, kept: kept.map(({ kind, reason }) => ({ kind, reason })), disk: await place.readDisk() };
  };

  const pullImage = async (placeId: string): Promise<PlaceDiskUsage> => {
    requirePlace(placeId);
    place.pullImage().catch((cause) => {
      logger.warn?.(`[spaces] the image download failed: ${shortErrorReason(cause)}`);
    });
    return place.readDisk();
  };

  const reopen = (): void => { closing = false; };

  const readJournal = (spaceId: string): Promise<GatekeeperJournal> => exclusive(spaceId, async () => {
    const space = await requireListed(spaceId);
    if (space.state !== 'running') {
      throw new SpaceError(
        'space_not_running',
        'The journal lives in the memory of the space\'s gatekeeper and is gone with a stop. Start the space to record new attempts.',
      );
    }
    return gatekeeper.readJournal(spaceId);
  });

  const requireRepository = async (spaceId: string): Promise<{ space: ListedSpace; repository: string; spacePath: string }> => {
    requireNotPending(spaceId);
    const space = await requireListed(spaceId);
    const { record } = records.read(spaceId);
    const repository = record?.repository ?? space.projectDirectory;
    if (!repository) {
      throw new SpaceError('project_not_registered', 'The project this space was made for is no longer registered, so its work has nowhere to go.');
    }
    if (space.state !== 'running') throw new SpaceError('space_not_running', 'The space is stopped. Start it to apply its work.');
    const resolvedSpacePath = record?.spacePath ?? space.directory;
    if (!resolvedSpacePath) {
      throw new SpaceError('space_record_unreadable', 'The host does not know where the project lives inside this space.');
    }
    return { space, repository, spacePath: resolvedSpacePath };
  };

  const previewApply = (spaceId: string): Promise<Omit<BringCodeOutResult, 'result'> & ApplyStateDescription> =>
    exclusive(spaceId, async () => {
      const { repository, spacePath } = await requireRepository(spaceId);
      const brought = await codeOut.bringCodeOut({ repository, spaceId, spacePath });
      const state = await codeOut.describeApplyState({ repository, spaceId });
      return { ...brought, ...state };
    });

  const applySpace = (spaceId: string, request: ApplySpaceRequest | JsonValue): Promise<ApplySpaceResult> =>
    exclusive(spaceId, async () => {
      const parsed = applyRequestSchema.safeParse(request ?? {});
      if (!parsed.success) {
        throw new SpaceError('invalid_apply_request', 'The work is applied as a branch, with its name, or as uncommitted changes.');
      }
      const { as, removeAfterwards } = parsed.data;
      const branch = parsed.data.as === 'branch' ? parsed.data.branch : null;
      const { repository, spacePath } = await requireRepository(spaceId);
      const brought = await codeOut.bringCodeOut({ repository, spaceId, spacePath });
      const applied: ApplySpaceResult['applied'] = as === 'branch' && branch !== null
        ? { status: 'applied', ...(await codeOut.applyAsBranch({ repository, spaceId, branch })) }
        : await codeOut.applyAsChanges({ repository, spaceId });
      let removal: RemoveSpaceResult | null = null;
      let kept: SpaceFailure | null = null;
      if (removeAfterwards && applied.status === 'applied') {
        try {
          removal = await removeUnlocked(spaceId);
        } catch (error) {
          if (!(error instanceof SpaceError) || error.code !== 'chats_not_saved') throw error;
          kept = failureOf(error);
        }
      }
      return { brought, applied, removal, kept };
    });

  return {
    createSpace,
    listSpaces,
    startSpace,
    stopSpace,
    restartSpace,
    removeSpace,
    stopAllSpaces,
    reopen,
    grantAccess,
    openDomain,
    restoreLostGrants,
    readJournal,
    previewApply,
    applySpace,
    readIdleStopSetting,
    changeIdleStop,
    runSetup,
    readSetup,
    readDisk,
    cleanUpDisk,
    pullImage,
  };
}
