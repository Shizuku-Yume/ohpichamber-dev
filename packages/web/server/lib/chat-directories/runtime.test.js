import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatDirectoryCleanupRuntime } from './runtime.js';
import { runtimeSession, snapshot, event, scope } from '../event-stream/canonical-test-fixtures.js';

const temporaryRoots = [];
const runtimes = [];
const locations = new Map();
const page = (items, errors = {}) => ({ items, errors });
const session = (sessionId, directory, fields = {}) => {
  locations.set(sessionId, { ...scope, rootSessionId: sessionId, cwd: directory });
  return { ...runtimeSession({ sessionId, rootSessionId: sessionId, ...fields }), metadata: null, metadataRevision: '0', archiveRevision: '0' };
};
const created = (sessionId, directory) => {
  session(sessionId, directory);
  return [snapshot([], [], { sessionId, rootSessionId: sessionId }), locations.get(sessionId)];
};
const forked = (sessionId) => created(sessionId, locations.get(sessionId).cwd);
const moved = created;
const deleted = (sessionId, deletedSessionIds = [sessionId]) => event(1, { type: 'session.deleted', sessionId, deletedSessionIds });
const quarantined = async (chats) => (await fs.readdir(chats)).filter((name) => name.startsWith('.reclaiming-'));
const exists = async (directory) => fs.lstat(directory).then(() => true, (error) => {
  if (error.code === 'ENOENT') return false;
  throw error;
});
const fixture = async () => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'openchamber-chat-cleanup-')));
  temporaryRoots.push(root);
  const chats = path.join(root, 'chats');
  const directory = path.join(chats, '2026-11-10', `session-${randomUUID()}`);
  const screenshot = path.join(directory, '.openchamber', 'screenshots', 'page.png');
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await fs.writeFile(screenshot, 'screenshot bytes');
  return { root, chats, directory, screenshot };
};

const makeRuntime = ({ roots, sessions = [], eventHub }) => {
  const state = { sessions, owner: Symbol('Native Host') };
  const list = vi.fn(async () => page(state.sessions));
  const logger = { warn: vi.fn() };
  const open = vi.fn(async (sessionId) => {
    const record = state.sessions.find((session) => session.sessionId === sessionId);
    if (!record) throw Object.assign(new Error('Session not found'), { code: 'SESSION_NOT_FOUND' });
    return snapshot([], [], { sessionId, rootSessionId: sessionId });
  });
  const resolveSessionScope = vi.fn(async (sessionId) => locations.get(sessionId));
  const runtime = createChatDirectoryCleanupRuntime({
    roots,
    sessionService: { list, open },
    resolveSessionScope,
    getOwner: () => state.owner,
    logger,
    eventHub,
  });
  runtimes.push(runtime);
  return { runtime, state, list, open, resolveSessionScope, logger };
};

const makeHub = () => {
  const listeners = new Map();
  const subscribe = (name) => (listener) => {
    listeners.set(name, listener);
    return () => listeners.delete(name);
  };
  return {
    listeners,
    emit: (name, ...args) => listeners.get(name)?.(...args),
    subscribeSnapshot: subscribe('snapshot'),
    subscribeEvent: subscribe('event'),
    subscribeStatus: subscribe('status'),
  };
};

it('reclaims confirmed deletions through the captured Canonical hub subscriptions', async () => {
  const { chats, directory } = await fixture();
  const hub = makeHub();
  const { state } = makeRuntime({ roots: [chats], sessions: [session('root', directory)], eventHub: hub });
  await hub.emit('snapshot', ...created('root', directory));
  await hub.emit('status', { type: 'connect' });
  state.sessions = [];
  await hub.emit('event', deleted('root'), locations.get('root'));
  expect(await exists(directory)).toBe(false);
});

it('keeps unknown and disconnected folders, retries on reconnect and detaches on stop', async () => {
  const { chats, directory } = await fixture();
  const hub = makeHub();
  const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)], eventHub: hub });
  await hub.emit('status', { type: 'connect' });
  await hub.emit('event', deleted('unknown'));
  expect(await exists(directory)).toBe(true);
  await hub.emit('status', { type: 'error' });
  state.sessions = [];
  await hub.emit('event', deleted('root'));
  expect(await exists(directory)).toBe(true);
  list.mockImplementationOnce(async () => { throw new Error('inventory unavailable'); });
  await hub.emit('status', { type: 'connect' });
  expect(await exists(directory)).toBe(true);
  await hub.emit('status', { type: 'connect' });
  expect(await exists(directory)).toBe(false);
  await runtime.stop();
  expect(hub.listeners.size).toBe(0);
});

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  locations.clear();
});

describe('managed chat directory cleanup', () => {
  it('keeps archived forks and nested subagent references, then removes the folder with its last session', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const childDirectory = path.join(directory, '..generated-project');
    const project = path.join(root, 'project');
    await fs.mkdir(childDirectory);
    await fs.mkdir(project);
    const fork = session('fork', directory, { archivedAt: 1 });
    const parent = session('project-parent', project);
    const child = session('subagent', childDirectory, { parentSessionId: parent.sessionId });
    const { runtime, state } = makeRuntime({
      roots: [chats], sessions: [session('root', directory), fork, parent],
    });
    await runtime.onConnected();

    state.sessions = [fork, parent];
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
    state.sessions = [parent, child];
    await runtime.processPayload(deleted('fork'));
    expect(await exists(screenshot)).toBe(true);
    state.sessions = [parent];
    await runtime.processPayload(deleted('subagent'));
    expect(await exists(directory)).toBe(false);
    expect(await exists(project)).toBe(true);
    expect(await exists(chats)).toBe(true);
  });

  it('learns new chats from events and shares one inventory for a deletion burst', async () => {
    const { chats, directory } = await fixture();
    const { runtime, list } = makeRuntime({ roots: [chats] });
    await runtime.onConnected();
    list.mockClear();
    runtime.processSnapshot(...created('root', directory));
    runtime.processSnapshot(...created('child', directory));
    const rootDeletion = runtime.processPayload(deleted('root'));
    const childDeletion = runtime.processPayload(deleted('child'));
    await Promise.all([rootDeletion, childDeletion]);
    expect(await exists(directory)).toBe(false);
    // One inventory before claiming the folder, one fresh read before destroying it.
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('learns a new fork before its source moves away and reclaims the last fork folder', async () => {
    const { root, chats, directory } = await fixture();
    const project = path.join(root, 'project');
    await fs.mkdir(project);
    const source = session('source', directory);
    const fork = session('fork', directory);
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [source] });
    await runtime.onConnected();
    state.sessions = [source, fork];
    await runtime.processSnapshot(...forked('fork'));
    state.sessions = [session('source', project), fork];
    runtime.processSnapshot(...moved('source', project));
    state.sessions = [session('source', project)];
    await runtime.processPayload(deleted('fork'));
    expect(await exists(directory)).toBe(false);
    expect(await exists(project)).toBe(true);
  });

  it('does not learn a directory from a snapshot with a mismatched Host scope', async () => {
    const { root, chats, directory } = await fixture();
    const project = path.join(root, 'project');
    await fs.mkdir(project);
    const source = session('source', project);
    const { runtime } = makeRuntime({ roots: [chats], sessions: [source] });
    await runtime.onConnected();
    const [record, location] = created('fork', directory);
    runtime.processSnapshot(record, { ...location, workspaceId: 'another-workspace' });
    await runtime.processPayload(deleted('fork'));
    expect(await exists(directory)).toBe(true);
    expect(await exists(project)).toBe(true);
  });

  it('does not learn a directory from a malformed snapshot', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime } = makeRuntime({ roots: [chats] });
    await runtime.onConnected();
    const [record, location] = created('root', directory);
    runtime.processSnapshot({ ...record, session: null }, location);
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
  });

  it('handles a canonical cascading deletion in one event', async () => {
    const { chats, directory } = await fixture();
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [
      session('root', directory), session('child', directory, { parentSessionId: 'root' }),
    ] });
    await runtime.onConnected();
    state.sessions = [];
    await runtime.processPayload(deleted('root', ['root', 'child']));
    expect(await exists(directory)).toBe(false);
  });

  it('learns a full canonical session update only with its matching Host scope', async () => {
    const { chats, directory } = await fixture();
    const { runtime } = makeRuntime({ roots: [chats] });
    await runtime.onConnected();
    const [record, location] = created('root', directory);
    runtime.processPayload(event(1, { type: 'session.updated', sessionId: 'root', session: record.session }), location);
    await runtime.processPayload(deleted('root'));
    expect(await exists(directory)).toBe(false);
  });

  it('uses the latest scoped snapshot after a session moves', async () => {
    const first = await fixture();
    const second = await fixture();
    const source = session('source', first.directory);
    const fork = session('fork', first.directory);
    const { runtime, state } = makeRuntime({ roots: [first.chats, second.chats], sessions: [source] });
    await runtime.onConnected();
    state.sessions = [source, fork];
    runtime.processSnapshot(...forked('fork'));
    state.sessions = [source, session('fork', second.directory)];
    runtime.processSnapshot(...moved('fork', second.directory));
    state.sessions = [source];
    await runtime.processPayload(deleted('fork'));
    expect(await exists(second.directory)).toBe(false);
    expect(await exists(first.screenshot)).toBe(true);
  });

  it('uses the complete native inventory including archived references', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const project = path.join(root, 'project');
    await fs.mkdir(project);
    const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [session('archived-fork', directory, { archivedAt: 1 })];
    list.mockImplementation(async () => page([session('other', project), ...state.sessions]));
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
    state.sessions = [];
    await runtime.processPayload(deleted('archived-fork'));
    expect(await exists(directory)).toBe(false);
  });

  for (const [name, answer] of [
    ['failed inventory', () => { throw new Error('Agent Service unavailable'); }],
    ['malformed record', () => page([{ sessionId: 'unresolved-session' }])],
    ['missing error state', () => ({ items: [] })],
    ['partial workspace result', () => page([], { workspace: 'SERVICE_UNAVAILABLE' })],
    ['invalid problem code', () => page([], { workspace: 'unexpected' })],
  ]) {
    it(`keeps files after a ${name} and retries on reconnect`, async () => {
      const { chats, directory, screenshot } = await fixture();
      const { runtime, state, list, logger } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
      await runtime.onConnected();
      state.sessions = [];
      let calls = 0;
      list.mockImplementation(async () => answer(calls++));
      await runtime.processPayload(deleted('root'));
      expect(await exists(screenshot)).toBe(true);
      expect(logger.warn).toHaveBeenCalled();
      list.mockImplementation(async () => page([]));
      await runtime.onConnected();
      expect(await exists(directory)).toBe(false);
    });
  }

  it('rejects partial native aggregation without using its successful records as a complete inventory', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [];
    list.mockImplementationOnce(async () => page([session('other', '/missing/project')], { 'unavailable-workspace': 'SERVICE_UNAVAILABLE' }));
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
    await runtime.onConnected();
    expect(await exists(directory)).toBe(false);
  });

  it('preserves drafts and historical orphans on first load and ignores unknown deletion events', async () => {
    const { chats, directory, screenshot } = await fixture();
    const draft = path.join(chats, '2026-11-10', `session-${randomUUID()}`);
    await fs.mkdir(draft);
    const { runtime, list } = makeRuntime({ roots: [chats] });
    await runtime.onConnected();
    await runtime.processPayload(deleted('unknown-session'));
    expect(await exists(draft)).toBe(true);
    expect(await exists(screenshot)).toBe(true);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('recognizes configured and reference aliases without deleting a referenced folder', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const configured = path.join(root, 'configured-chats');
    const referenceAlias = path.join(root, 'another-alias');
    await fs.symlink(chats, configured, 'junction');
    await fs.symlink(chats, referenceAlias, 'junction');
    const aliasedDirectory = path.join(referenceAlias, path.relative(chats, directory));
    const { runtime, state } = makeRuntime({ roots: [configured], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [session('fork', aliasedDirectory)];
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
    state.sessions = [];
    await runtime.processPayload(deleted('fork'));
    expect(await exists(directory)).toBe(false);
    expect(await exists(configured)).toBe(true);
  });

  it('preserves a missing aliased descendant that an archived session still references', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const alias = path.join(root, 'chat-alias');
    await fs.symlink(directory, alias, 'junction');
    const missingChild = path.join(alias, 'removed-project');
    const archived = session('archived', missingChild, { archivedAt: 1 });
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('root', directory), archived] });
    await runtime.onConnected();
    state.sessions = [archived];
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
    state.sessions = [];
    await runtime.processPayload(deleted('archived'));
    expect(await exists(directory)).toBe(false);
  });

  it('retains cleanup when a reference cannot be resolved and retries after it becomes readable', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const first = path.join(root, 'loop-a');
    const second = path.join(root, 'loop-b');
    await fs.symlink(second, first, 'junction');
    await fs.symlink(first, second, 'junction');
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [session('unreadable-reference', first)];
    await runtime.processPayload(deleted('root'));
    expect(await exists(screenshot)).toBe(true);
    await fs.unlink(second);
    await fs.mkdir(second);
    await runtime.onConnected();
    expect(await exists(directory)).toBe(false);
  });

  for (const link of ['date', 'session']) {
    it(`keeps files behind a symlinked ${link} directory`, async () => {
      const { root, chats, directory, screenshot } = await fixture();
      const outside = path.join(root, 'outside');
      if (link === 'date') {
        await fs.rename(path.dirname(directory), outside);
        await fs.symlink(outside, path.dirname(directory), 'junction');
      } else {
        await fs.rename(directory, outside);
        await fs.symlink(outside, directory, 'junction');
      }
      const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
      await runtime.onConnected();
      state.sessions = [];
      await runtime.processPayload(deleted('root'));
      expect(await exists(screenshot)).toBe(true);
      expect(await exists(outside)).toBe(true);
    });
  }

  it('discards a stale empty inventory when a new session starts using the folder', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [];
    const read = Promise.withResolvers();
    const started = Promise.withResolvers();
    list.mockImplementationOnce(async () => { started.resolve(); return read.promise; });
    const cleanup = runtime.processPayload(deleted('root'));
    await started.promise;
    state.sessions = [session('new-session', directory)];
    runtime.processSnapshot(...created('new-session', directory));
    read.resolve(page([]));
    await cleanup;
    expect(await exists(screenshot)).toBe(true);
    state.sessions = [];
    await runtime.processPayload(deleted('new-session'));
    expect(await exists(directory)).toBe(false);
  });

  it('preserves a replacement folder when failed cleanup is retried', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [];
    list.mockImplementationOnce(async () => { throw new Error('Agent Service unavailable'); });
    await runtime.processPayload(deleted('root'));
    const previous = `${directory}-preserved`;
    await fs.rename(directory, previous);
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await fs.writeFile(screenshot, 'replacement files');
    await runtime.onConnected();
    expect(await fs.readFile(screenshot, 'utf8')).toBe('replacement files');
    expect(await exists(previous)).toBe(true);
  });

  it('does not adopt a replacement after a failed first inspection', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    const preservedChats = path.join(root, 'preserved-chats');
    const loop = path.join(root, 'loop');
    await fs.rename(chats, preservedChats);
    await fs.symlink(loop, chats, 'junction');
    await fs.symlink(chats, loop, 'junction');
    state.sessions = [];
    await runtime.processPayload(deleted('root'));
    await fs.unlink(chats);
    await fs.unlink(loop);
    await fs.rename(preservedChats, chats);
    const previous = `${directory}-preserved`;
    await fs.rename(directory, previous);
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await fs.writeFile(screenshot, 'replacement after failed inspection');
    await runtime.onConnected();
    expect(await fs.readFile(screenshot, 'utf8')).toBe('replacement after failed inspection');
    expect(await exists(previous)).toBe(true);
  });

  it('retains the original folder identity when a session event overtakes inspection', async () => {
    const { root, chats, directory, screenshot } = await fixture();
    const project = path.join(root, 'project');
    await fs.mkdir(project);
    const source = session('other-source', project);
    const fork = session('other-fork', project);
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('root', directory), source] });
    await runtime.onConnected();
    state.sessions = [source];
    const originalLstat = fs.lstat.bind(fs);
    const inspected = Promise.withResolvers();
    const release = Promise.withResolvers();
    let delayed = false;
    const stat = vi.spyOn(fs, 'lstat').mockImplementation(async (target, options) => {
      const identity = await originalLstat(target, options);
      if (target === directory && !delayed) {
        delayed = true;
        inspected.resolve();
        await release.promise;
      }
      return identity;
    });
    try {
      const cleanup = runtime.processPayload(deleted('root'));
      await inspected.promise;
      const previous = `${directory}-preserved`;
      await fs.rename(directory, previous);
      await fs.mkdir(path.dirname(screenshot), { recursive: true });
      await fs.writeFile(screenshot, 'replacement during inspection');
      state.sessions = [source, fork];
      const learning = runtime.processSnapshot(...forked(fork.sessionId));
      release.resolve();
      await Promise.all([cleanup, learning]);
      expect(await fs.readFile(screenshot, 'utf8')).toBe('replacement during inspection');
      expect(await exists(previous)).toBe(true);
    } finally {
      release.resolve();
      stat.mockRestore();
    }
  });

  for (const [phase, method, failAt, code] of [
    ['initial inspection', 'realpath', 1, 'EIO'],
    ['identity check', 'lstat', 2, 'ENOENT'],
    ['claim', 'rename', 1, null],
  ]) {
    it(`keeps the new owner's cleanup after a stale ${phase} completion`, async () => {
      const { chats, directory, screenshot } = await fixture();
      const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('old', directory)] });
      await runtime.onConnected();
      state.sessions = [];
      const original = fs[method].bind(fs);
      const started = Promise.withResolvers();
      const release = Promise.withResolvers();
      let reads = 0;
      const inspection = vi.spyOn(fs, method).mockImplementation(async (target, options) => {
        if (target === directory && ++reads === failAt) {
          if (method === 'rename') await original(target, options);
          started.resolve();
          await release.promise;
          if (code) throw Object.assign(new Error('Stale filesystem read'), { code });
          return;
        }
        return original(target, options);
      });
      try {
        const oldDeletion = runtime.processPayload(deleted('old'));
        await started.promise;
        state.owner = Symbol('new managed process');
        if (phase === 'identity check') {
          await fs.rename(directory, `${directory}-preserved`);
        }
        if (phase !== 'initial inspection') {
          await fs.mkdir(path.dirname(screenshot), { recursive: true });
          await fs.writeFile(screenshot, 'new owner files');
        }
        runtime.processSnapshot(...created('new', directory));
        const newDeletion = runtime.processPayload(deleted('new'));
        release.resolve();
        await Promise.all([oldDeletion, newDeletion]);
        await runtime.onConnected();
        expect(await exists(directory)).toBe(false);
        if (phase === 'identity check') expect(await exists(`${directory}-preserved`)).toBe(true);
        if (phase === 'claim') {
          // The old owner lost its authority while holding the folder, and the
          // new owner's files took the name, so the original stays aside.
          const [kept] = await quarantined(chats);
          expect(await fs.readFile(path.join(chats, kept, path.basename(directory), '.openchamber', 'screenshots', 'page.png'), 'utf8'))
            .toBe('screenshot bytes');
        }
      } finally {
        release.resolve();
        inspection.mockRestore();
      }
    });
  }

  for (const change of ['shutdown', 'unavailable Host', 'another Host owner']) {
    it(`preserves files when ${change} overtakes an inventory read`, async () => {
      const { chats, directory, screenshot } = await fixture();
      const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
      await runtime.onConnected();
      state.sessions = [];
      const read = Promise.withResolvers();
      const started = Promise.withResolvers();
      list.mockImplementationOnce(async () => { started.resolve(); return read.promise; });
      const cleanup = runtime.processPayload(deleted('root'));
      await started.promise;
      const stopping = change === 'shutdown' ? runtime.stop() : null;
      if (change !== 'shutdown') state.owner = change === 'unavailable Host' ? null : Symbol('new process');
      read.resolve(page([]));
      await Promise.all([cleanup, stopping]);
      expect(await exists(screenshot)).toBe(true);
    });
  }
  for (const change of ['archived', 'renamed']) {
    it(`keeps a folder whose reference is ${change} during native aggregation`, async () => {
      const { root, chats, directory, screenshot } = await fixture();
      const project = path.join(root, 'project');
      await fs.mkdir(project);
      const others = Array.from({ length: 250 }, (_, index) => (
        session(`other-${String(index).padStart(3, '0')}`, project, { updatedAt: 1_000 + index })
      ));
      const fork = session('fork', directory, { updatedAt: 1_020 });
      const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory), fork, ...others] });
      await runtime.onConnected();
      state.sessions = [fork, ...others];
      list.mockImplementationOnce(async () => {
        const items = structuredClone(state.sessions);
        fork.updatedAt = 2_000;
        if (change === 'archived') fork.archivedAt = 2_000;
        if (change === 'renamed') fork.title = 'Renamed';
        runtime.processPayload(event(1, { type: 'session.updated', sessionId: 'fork', title: 'Updated' }));
        return page(items);
      });
      await runtime.processPayload(deleted('root'));
      expect(await fs.readFile(screenshot, 'utf8')).toBe('screenshot bytes');

      state.sessions = others;
      await runtime.processPayload(deleted('fork'));
      expect(await exists(directory)).toBe(false);
      expect(await quarantined(chats)).toEqual([]);
    });
  }

  it('reads a session the stream wrote to during the inventory when the list missed it', async () => {
    const { chats, directory, screenshot } = await fixture();
    const fork = session('fork', directory, { archivedAt: 1 });
    const { runtime, state, list, open } = makeRuntime({ roots: [chats], sessions: [session('root', directory), fork] });
    await runtime.onConnected();
    state.sessions = [fork];
    list.mockImplementationOnce(async () => {
      runtime.processPayload(event(1, { type: 'session.updated', sessionId: 'fork', archivedAt: 1, archiveRevision: '1' }));
      return page([]);
    });
    await runtime.processPayload(deleted('root'));
    expect(open).toHaveBeenCalledWith('fork', expect.anything());
    expect(await fs.readFile(screenshot, 'utf8')).toBe('screenshot bytes');
  });

  it('removes nothing while the event stream is down and rereads after reconnecting', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [];
    list.mockImplementationOnce(async () => {
      runtime.onDisconnected();
      return page([]);
    });
    await runtime.processPayload(deleted('root'));
    // Created while no events arrive.
    state.sessions = [session('created-in-gap', directory)];
    expect(await fs.readFile(screenshot, 'utf8')).toBe('screenshot bytes');
    expect(await quarantined(chats)).toEqual([]);

    await runtime.onConnected();
    expect(await fs.readFile(screenshot, 'utf8')).toBe('screenshot bytes');
    state.sessions = [];
    await runtime.processPayload(deleted('created-in-gap'));
    expect(await exists(directory)).toBe(false);
  });

  for (const change of ['reference', 'replacement', 'reference and replacement']) {
    it(`protects files when a ${change} appears while the folder is claimed`, async () => {
      const { chats, directory, screenshot } = await fixture();
      const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
      await runtime.onConnected();
      state.sessions = [];
      const paused = Promise.withResolvers();
      const resume = Promise.withResolvers();
      list.mockImplementationOnce(async () => page([]));
      list.mockImplementationOnce(async () => {
        paused.resolve();
        await resume.promise;
        return page(state.sessions);
      });
      const cleanup = runtime.processPayload(deleted('root'));
      await paused.promise;
      expect(await exists(directory)).toBe(false);
      if (change.includes('replacement')) {
        await fs.mkdir(path.dirname(screenshot), { recursive: true });
        await fs.writeFile(screenshot, 'replacement bytes');
      }
      if (change.includes('reference')) state.sessions = [session('new-session', directory)];
      resume.resolve();
      await cleanup;

      const kept = await quarantined(chats);
      if (change === 'reference') {
        expect(await fs.readFile(screenshot, 'utf8')).toBe('screenshot bytes');
        expect(kept).toEqual([]);
      } else if (change === 'replacement') {
        expect(await fs.readFile(screenshot, 'utf8')).toBe('replacement bytes');
        expect(kept).toEqual([]);
      } else {
        expect(await fs.readFile(screenshot, 'utf8')).toBe('replacement bytes');
        expect(await fs.readFile(path.join(chats, kept[0], path.basename(directory), '.openchamber', 'screenshots', 'page.png'), 'utf8'))
          .toBe('screenshot bytes');
      }
    });
  }

  it('retries a failed removal by its quarantine path after reconnecting', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime, state } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [];
    const remove = vi.spyOn(fs, 'rm').mockImplementationOnce(async () => {
      throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    });
    try {
      await runtime.processPayload(deleted('root'));
    } finally {
      remove.mockRestore();
    }
    expect(await quarantined(chats)).toHaveLength(1);
    await fs.mkdir(path.dirname(screenshot), { recursive: true });
    await fs.writeFile(screenshot, 'replacement bytes');

    runtime.onDisconnected();
    await runtime.onConnected();
    expect(await quarantined(chats)).toEqual([]);
    expect(await fs.readFile(screenshot, 'utf8')).toBe('replacement bytes');
  });

  it('puts a claimed folder back when the stream drops before destruction', async () => {
    const { chats, directory, screenshot } = await fixture();
    const { runtime, state, list } = makeRuntime({ roots: [chats], sessions: [session('root', directory)] });
    await runtime.onConnected();
    state.sessions = [];
    list.mockImplementationOnce(async () => page([]));
    list.mockImplementationOnce(async () => {
      runtime.onDisconnected();
      return page([]);
    });
    await runtime.processPayload(deleted('root'));
    expect(await fs.readFile(screenshot, 'utf8')).toBe('screenshot bytes');
    expect(await quarantined(chats)).toEqual([]);
    await runtime.onConnected();
    expect(await exists(directory)).toBe(false);
  });
});
