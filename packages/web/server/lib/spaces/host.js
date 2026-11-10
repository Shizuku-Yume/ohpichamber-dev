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

<<<<<<< HEAD
=======
  /** One space's whole session list, page by page, or as much of it as the page cap allows. */
  const readSpaceSessions = async (spaceId) => {
    const records = [];
    let cursor = null;
    for (let page = 0; page < SESSION_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({ limit: String(SESSION_PAGE_LIMIT) });
      if (cursor !== null) query.set('cursor', cursor);
      const response = await dispatcher.requestInside(spaceId, { path: `/api/session?${query}`, headers: { accept: 'application/json' }, timeoutMs: SESSION_LIST_TIMEOUT_MS });
      if (response.statusCode !== 200) { response.resume(); throw new Error(`status ${response.statusCode}`); }
      const payload = JSON.parse(await readBody(response, MAX_SESSION_LIST_BYTES));
      const data = Array.isArray(payload) ? payload : payload?.data;
      if (!Array.isArray(data)) throw new Error('the list is not a list');
      records.push(...data);
      const next = nextCursorSchema.safeParse(payload?.cursor?.next);
      if (!next.success || data.length === 0) return { records, complete: true };
      cursor = next.data;
    }
    return { records, complete: false };
  };

  /**
   * The host's session list with every space's after it. Each reachable space is asked once,
   * all of them at the same time; one that does not answer keeps its last known list, marked
   * stale. A host list without spaces goes back exactly as it came.
   */
  const mergeSessionList = async (hostPayload) => {
    const hostRecords = Array.isArray(hostPayload) ? hostPayload : hostPayload?.data;
    if (Array.isArray(hostRecords)) index.observeHostRecords(hostRecords);
    const spaces = await knownSpaces();
    if (spaces.length === 0) return hostPayload;
    await Promise.all(spaces.map(async ({ id: spaceId, state }) => {
      // A space whose place cannot be asked keeps its last list, stale, with no attempt made.
      if (state === 'unreachable') {
        index.markUnreachable(spaceId);
        listReadAt.delete(spaceId);
        return;
      }
      if (now() - (listReadAt.get(spaceId) ?? -Infinity) < LIST_TTL_MS) return;
      try {
        const { records, complete } = await readSpaceSessions(spaceId);
        index.acceptSpaceList(spaceId, records, { complete });
        listReadAt.set(spaceId, now());
      } catch (error) {
        logger.warn?.(`[spaces] the session list of space ${spaceId} did not come: ${error?.code ?? error?.message ?? error}`);
        index.markUnreachable(spaceId);
        // The next merge asks the space again whatever the last good read's age: a space that
        // did not answer during its own restart is otherwise listed as not answering until the
        // read's time runs out, after the restart has long gone through.
        listReadAt.delete(spaceId);
      }
    }));
    // In the place's order, so the merged list reads the same from one call to the next.
    const answers = new Map(index.snapshot().map((entry) => [entry.spaceId, entry]));
    return mergeSessionLists(hostPayload, spaces.flatMap((space) => {
      const answer = answers.get(space.id);
      return answer === undefined ? [] : [{ ...answer, name: space.name, taskTitle: records.read(space.id).record?.taskTitle ?? null, projectDirectory: space.projectDirectory, directory: space.directory }];
    }));
  };

>>>>>>> bc50ba56a
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
<<<<<<< HEAD
      // A closed gate makes the restore refuse; a start must not turn that into an unhandled rejection.
      void journey.restoreLostGrants().catch((error) => {
        logger.warn?.(`[spaces] the grants of running spaces were not restored: ${error?.code ?? error?.message ?? error}`);
      });
=======
      events = createSpaceEventSources({ requestInside: dispatcher.requestInside, index, hub: globalEventHub, broadcastUiEvent, broadcastGlobalUiEvent, logger, now,
        onTaskTitle: (spaceId, title) => {
          try {
            const result = records.setTaskTitle(spaceId, { title, by: 'agent' });
            if (result.applied) globalEventHub.injectEvent({ payload: { type: 'openchamber:space-task-title.updated', properties: { spaceId, taskTitle: result.taskTitle } }, directory: 'global', spaceId });
          } catch (error) {
            logger.warn?.(`[spaces] could not save the task title of space ${spaceId}: ${error?.code ?? error?.message ?? error}`);
          }
        },
      });
      unsubscribeHostEvents = globalEventHub.subscribeEvent((event) => { if (event.spaceId === null) index.observeHostEvent(event.payload); });
      followTimer = setTimer(() => { void follow(); }, FOLLOW_INTERVAL_MS);
      followTimer?.unref?.();
      keepTimer = setTimer(() => { void keeper.tick(); }, KEEP_INTERVAL_MS);
      keepTimer?.unref?.();
      // A running space whose gatekeeper lost its grants, from a start cut short, gets them again.
      void journey.restoreLostGrants();
      return follow();
>>>>>>> bc50ba56a
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
