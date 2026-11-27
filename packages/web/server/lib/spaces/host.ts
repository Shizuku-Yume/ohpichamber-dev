import crypto from 'node:crypto';
import fs from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { z } from 'zod';

import type { RequestOriginChecker } from '../security/request-security.js';
import type { Request } from '../shared/http-contracts.js';
import type { JsonValue } from '../shared/json-values.js';
import { createCodeIn } from './code-in.js';
import { createCodeOut } from './code-out.js';
import { createSpaceDispatcher } from './dispatcher.js';
import type { SpaceDispatcher } from './dispatcher.js';
import { SpaceError } from './errors.js';
import { createGatekeeperChannel } from './gatekeeper-channel.js';
import { createHostGit } from './host-git.js';
import type { IdleStopSetting } from './idle-stop.js';
import { createSpaceJourney } from './journey.js';
import type { JourneyPlace, SpaceJourney } from './journey.js';
import { createSpaceManager } from './manager.js';
import type { SpaceManager, SpacePlace } from './manager.js';
import { requireSpacesReleased } from './release.js';
import type { SpaceArchive } from './space-archive.js';
import { createSpaceRecords } from './space-records.js';
import { createSpaceNativeArchiveSource } from './space-native-archive.js';
import { createSpaceWebSocketForwarder } from './websocket.js';
import type { SpaceWebSocketUiAuthController } from './websocket.js';
import { createDockerPlace } from './places/docker.js';
import { createPlaceRegistry } from './places/registry.js';
import { openCommandStream as openCommandStreamProcess, runCommand as runCommandProcess } from './run-command.js';
import type { CommandStream, RunCommandFn } from './run-command.js';
import { createSpaceServerChannel } from './space-server.js';
import { createRegistryToolsSource, readHostToolVersions } from './tools.js';

const OWNER_FILE = path.join('spaces', 'owner');

const errorDetailSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
});

export interface SpaceEventHub {
  injectEvent: (event: { payload: JsonValue; directory: string; spaceId: string | null }) => void;
}

export interface PrepareSpaceUpgradesOptions {
  uiAuthController: SpaceWebSocketUiAuthController | null | undefined;
  isRequestOriginAllowed: RequestOriginChecker;
}

export interface CreateSpacesHostOptions {
  dataDir: string;
  dockerPath?: string | undefined;
  colimaPath?: string | null | undefined;
  gitPath?: string | undefined;
  hostEnvironment?: NodeJS.ProcessEnv | undefined;
  listProjectDirectories?: (() => Promise<string[]>) | undefined;
  readIdleStop: () => Promise<IdleStopSetting>;
  saveIdleStop: (setting: IdleStopSetting) => Promise<void>;
  archive?: Pick<SpaceArchive, 'saveChats'> | null | undefined;
  requireReleased?: (() => void) | undefined;
  runCommand?: RunCommandFn | undefined;
  openCommandStream?: ((file: string, args: readonly string[]) => CommandStream) | undefined;
  place?: JourneyPlace | null | undefined;
  logger?: {
    info?: ((message: string) => void) | undefined;
    warn?: ((message: string) => void) | undefined;
  } | undefined;
}

export interface SpacesHost {
  manager: SpaceManager;
  dispatcher: SpaceDispatcher;
  journey: SpaceJourney;
  places: () => SpacePlace[];
  middleware: SpaceDispatcher['middleware'];
  prepareUpgrades: (options: PrepareSpaceUpgradesOptions) => void;
  upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  start: (globalEventHub: SpaceEventHub) => void;
  skipsBodyParsing: (req: Pick<Request, 'path'>) => boolean;
  refuseDirectory: (candidate: string) => string | null;
  close: () => void;
}

export function readOrCreateOwner(dataDir: string): string {
  const file = path.join(dataDir, OWNER_FILE);
  let existing: string | null = null;
  try {
    existing = fs.readFileSync(file, 'utf8').trim();
  } catch {
    existing = null;
  }
  if (existing !== null && /^[a-z0-9]{16,64}$/.test(existing)) return existing;
  const owner = crypto.randomBytes(12).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${owner}\n`, { encoding: 'utf8', mode: 0o600 });
  return owner;
}

export function createSpacesHost({
  dataDir,
  dockerPath = 'docker',
  colimaPath = null,
  gitPath = 'git',
  hostEnvironment = process.env,
  listProjectDirectories = async () => [],
  readIdleStop,
  saveIdleStop,
  archive = null,
  requireReleased = requireSpacesReleased,
  runCommand = runCommandProcess,
  openCommandStream = openCommandStreamProcess,
  place = null,
  logger = console,
}: CreateSpacesHostOptions): SpacesHost {
  requireReleased();
  const dockerPlace: JourneyPlace = place ?? createDockerPlace({
    runCommand,
    openCommandStream,
    dockerPath,
    colimaPath,
    owner: readOrCreateOwner(dataDir),
    toolsSource: createRegistryToolsSource(readHostToolVersions()),
  });
  const registry = createPlaceRegistry([dockerPlace]);
  registry.seal();
  const manager = createSpaceManager({ registry, requireReleased });
  const serverInside = createSpaceServerChannel({ exec: dockerPlace.exec });
  const gatekeeper = createGatekeeperChannel({ exec: dockerPlace.exec });
  const git = createHostGit({ runCommand, gitPath, environment: hostEnvironment });
  const codeIn = createCodeIn({ git, place: dockerPlace });
  const codeOut = createCodeOut({ git, place: dockerPlace });
  const records = createSpaceRecords({ dataDir, logger });

  const listSpaces = () => manager.listSpaces({ placeId: dockerPlace.id });
  const dispatcher = createSpaceDispatcher({
    logger,
    transport: {
      listSpaceIds: async () => (await listSpaces()).map((space) => space.id),
      connect: (spaceId) => dockerPlace.connect(spaceId),
      readToken: (spaceId) => serverInside.readToken(spaceId),
    },
  });

  const nativeArchiveSource = createSpaceNativeArchiveSource({ requestInside: dispatcher.requestInside });

  let hub: SpaceEventHub | null = null;
  const journey = createSpaceJourney({
    manager,
    place: dockerPlace,
    gatekeeper,
    codeIn,
    codeOut,
    records,
    serverInside,
    listProjectDirectories,
    archiveChats: archive ? ({ spaceId, name, projectDirectory, running, allowUnsaved }) => archive.saveChats({
      spaceId,
      name,
      projectDirectory,
      allowUnsaved,
      source: {
        listChats: async () => {
          if (!running) throw new SpaceError('space_not_running', 'The space is not running');
          return nativeArchiveSource.listChats(spaceId);
        },
        exportChat: (chatId, destination, options) => nativeArchiveSource.exportChat(spaceId, chatId, destination, options),
      },
    }) : null,
    readHostSecret: (name) => hostEnvironment[name],
    readIdleStop,
    saveIdleStop,
    requireReleased,
    announce: (spaceId, payload) => { hub?.injectEvent({ payload, directory: 'global', spaceId }); },
    logger,
  });

  let sockets: { upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => void; close: () => void } | null = null;

  return {
    manager,
    dispatcher,
    journey,
    places: () => registry.list(),
    middleware: dispatcher.middleware,
    prepareUpgrades: ({ uiAuthController, isRequestOriginAllowed }: PrepareSpaceUpgradesOptions) => {
      sockets = createSpaceWebSocketForwarder({
        dispatcher,
        connect: (spaceId: string) => dockerPlace.connect(spaceId),
        uiAuthController,
        isRequestOriginAllowed,
        logger,
      });
    },
    upgradeHandler: (req: IncomingMessage, socket: Duplex, head: Buffer) => { sockets?.upgradeHandler(req, socket, head); },
    start: (globalEventHub: SpaceEventHub) => {
      hub = globalEventHub;
      void journey.restoreLostGrants().catch((cause) => {
        const detail = errorDetailSchema.safeParse(cause).data;
        const message = cause instanceof Error ? cause.message : String(cause);
        logger.warn?.(`[spaces] the grants of running spaces were not restored: ${detail?.code ?? detail?.message ?? message}`);
      });
    },
    skipsBodyParsing: (req: Pick<Request, 'path'>) => dispatcher.isSpaceRequestPath(req.path),
    refuseDirectory: (candidate: string) => (dispatcher.isSpaceDirectory(candidate)
      ? 'A directory under /spaces/ belongs to an isolated space and is addressed as /api/spaces/<id>/... only'
      : null),
    close: () => {
      sockets?.close();
      dispatcher.close();
    },
  };
}
