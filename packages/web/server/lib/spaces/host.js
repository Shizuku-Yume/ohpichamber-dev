// What the host server builds when the isolated-spaces switch is on, and nothing of it when it
// is off: the place, the manager, the dispatcher, the WebSocket forwarder, the journey and the
// hooks the rest of the server takes.
//
// `server/index.js` reads the switch at start and changes it live through the switch route, and
// asks `release.js` first: while the gate is closed no host is built at all. While the feature is
// off this module is never imported for its effect: no place, no manager, no route, no `docker`.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { createCodeIn } from './code-in.js';
import { createCodeOut } from './code-out.js';
import { createSpaceDispatcher } from './dispatcher.js';
import { SpaceError } from './errors.js';
import { createGatekeeperChannel } from './gatekeeper-channel.js';
import { createHostGit } from './host-git.js';
import { createSpaceJourney } from './journey.js';
import { createSpaceManager } from './manager.js';
import { requireSpacesReleased } from './release.js';
import { createSpaceRecords } from './space-records.js';
import { createSpaceNativeArchiveSource } from './space-native-archive.js';
import { createSpaceWebSocketForwarder } from './websocket.js';
import { createDockerPlace } from './places/docker.js';
import { createPlaceRegistry } from './places/registry.js';
import { openCommandStream as openCommandStreamProcess, runCommand as runCommandProcess } from './run-command.js';
import { createSpaceServerChannel } from './space-server.js';
import { createRegistryToolsSource, readHostToolVersions } from './tools.js';

const OWNER_FILE = path.join('spaces', 'owner');

/**
 * The installation id that labels this host's spaces, so two installations that share a Docker
 * daemon never see each other's. Made once, at the first start with the switch on, and kept in
 * the data directory. It is a random token and names nothing about the machine.
 */
export function readOrCreateOwner(dataDir) {
  const file = path.join(dataDir, OWNER_FILE);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (/^[a-z0-9]{16,64}$/.test(existing)) return existing;
  } catch {
    // Made below.
  }
  const owner = crypto.randomBytes(12).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, `${owner}\n`, { encoding: 'utf8', mode: 0o600 });
  return owner;
}

/**
 * `dataDir` is the host's data directory, `dockerPath` the docker CLI to run, `colimaPath` the
 * colima CLI or null, used only after a disk clean-up on a Colima machine, and `gitPath` the
 * host git that moves code in and out, with `hostEnvironment` as its environment: git starts
 * `docker exec` itself, so the PATH in it must find docker. `place` replaces the Docker place,
 * for the tests; `runCommand` and `openCommandStream` are the two ways this module starts a
 * process, injectable for the same reason. `listProjectDirectories` answers the host's registered
 * project paths, so a space's project label can be resolved to the project it was made for;
 * without it every space is marked as of an unknown project. `readIdleStop` and `saveIdleStop`
 * read and keep the user's idle stop setting in the host's settings. `archive` is the chat archive
 * of `space-archive.js`, which a delete saves the space's chats to; without it they go with it.
 * `requireReleased` is the server's release gate, run by the manager and the journey before any
 * place is touched, and by this constructor itself; only the tests open it.
 */
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
}) {
  requireReleased();
  const dockerPlace = place ?? createDockerPlace({
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

  let hub = null;
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
        // The space's own list, read whole; a stopped space that did not start has none to give.
        listChats: async () => {
          if (!running) throw new SpaceError('space_not_running', 'The space is not running');
          return nativeArchiveSource.listChats(spaceId);
        },
        exportChat: (chatId, destination, options) => nativeArchiveSource.exportChat(spaceId, chatId, destination, options),
      },
    }) : null,
    // A key named by an environment variable is read from the host's own environment, now, and
    // its value is kept nowhere (decision 5).
    readHostSecret: (name) => hostEnvironment[name],
    readIdleStop,
    saveIdleStop,
    requireReleased,
    announce: (spaceId, payload) => { hub?.injectEvent({ payload, directory: 'global', spaceId }); },
    logger,
  });

  let sockets = null;

  return {
    manager,
    dispatcher,
    journey,
    /** The places a space can be made on, for the funnel. */
    places: () => registry.list(),
    /** The dispatcher, to mount after the API auth gate and before every route that reads a directory. */
    middleware: dispatcher.middleware,
    /**
     * Makes the WebSocket forwarder, with the host's own auth and origin checks. `upgradeHandler`
     * then takes the upgrades under the prefix, and nothing before this call.
     */
    prepareUpgrades: ({ uiAuthController, isRequestOriginAllowed }) => {
      sockets = createSpaceWebSocketForwarder({ dispatcher, connect: (spaceId) => dockerPlace.connect(spaceId), uiAuthController, isRequestOriginAllowed, logger });
    },
    upgradeHandler: (...args) => sockets?.upgradeHandler(...args),
    /**
     * Takes the host's event hub, which the journey's progress events enter, and says again the
     * grants a running gatekeeper lost to a start the previous host did not finish.
     */
    start: (globalEventHub) => {
      hub = globalEventHub;
      // A closed gate makes the restore refuse; a start must not turn that into an unhandled rejection.
      void journey.restoreLostGrants().catch((error) => {
        logger.warn?.(`[spaces] the grants of running spaces were not restored: ${error?.code ?? error?.message ?? error}`);
      });
    },
    /** For the body parsers: a request to a space keeps its body for the space. */
    skipsBodyParsing: (req) => dispatcher.isSpaceRequestPath(req.path),
    /** For the directory gate: the reason a directory is refused on the host, or null. */
    refuseDirectory: (candidate) => (dispatcher.isSpaceDirectory(candidate)
      ? 'A directory under /spaces/ belongs to an isolated space and is addressed as /api/spaces/<id>/... only'
      : null),
    close: () => {
      sockets?.close();
      dispatcher.close();
    },
  };
}
