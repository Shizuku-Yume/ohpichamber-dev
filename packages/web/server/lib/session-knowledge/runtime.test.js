import { describe, expect, test } from 'bun:test';

<<<<<<< HEAD
import { buildKnowledgeSignature, buildKnowledgeText, createSessionKnowledgeRuntime } from './runtime.js';
=======
import { KNOWLEDGE_ENTRY_KEYS, RENDER_PAGE_GUIDANCE, REPLY_COMMAND_GUIDANCE, SECRET_REQUEST_GUIDANCE, SESSION_LINK_GUIDANCE, WORK_NAME_GUIDANCE, WORKFLOW_GUIDANCE, buildKnowledgeEntries, createSessionKnowledgeRuntime, directToolsGuidance } from './runtime.js';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.js';
>>>>>>> bc50ba56a

const DIRECTORY = '/work/project';
const PROJECT_ID = 'path_project';
const PINS = { notes: ['n1'], plans: ['p1'] };
<<<<<<< HEAD
=======
const NO_PINS = { notes: [], plans: [] };
const {
  checkout: CHECKOUT,
  pinned: PINNED,
  memory: MEMORY,
  guidance: GUIDANCE,
  responseStyle: RESPONSE_STYLE,
} = KNOWLEDGE_ENTRY_KEYS;
>>>>>>> bc50ba56a

const note = (overrides = {}) => ({
  id: 'n1', body: 'Pinned note body.', createdAt: 1, updatedAt: 1, pinned: true, source: 'manual', ...overrides,
});
const plan = (overrides = {}) => ({
  id: 'p1', file: 'p1.md', title: 'Migration plan', createdAt: 1, pinned: true, ...overrides,
});
const memory = (overrides = {}) => ({
  id: 'm1', title: 'Uses bun', body: 'Full text.', type: 'fact', createdAt: 1, updatedAt: 1, ...overrides,
});

const createRuntime = (overrides = {}) => {
  const dependencies = {
    resolveProjectId: async () => PROJECT_ID,
    projectContextRuntime: {
      readContext: async () => ({ notes: [note()], todos: [], plans: [plan()] }),
      readPlan: async () => ({ body: 'Plan body.' }),
      ...overrides.projectContextRuntime,
    },
    agentMemoryRuntime: {
      readAll: async () => ({ global: [memory()], project: [], globalFailed: false, projectFailed: false }),
      ...overrides.agentMemoryRuntime,
    },
  };
<<<<<<< HEAD
  if ('readSessionMetadata' in overrides) dependencies.readSessionMetadata = overrides.readSessionMetadata;
  if ('persistSessionMetadata' in overrides) dependencies.persistSessionMetadata = overrides.persistSessionMetadata;
  if ('isAgentMemoryEnabled' in overrides) dependencies.isAgentMemoryEnabled = overrides.isAgentMemoryEnabled;
  if ('isSessionLinkingAvailable' in overrides) dependencies.isSessionLinkingAvailable = overrides.isSessionLinkingAvailable;
  if ('isPageRenderingAvailable' in overrides) dependencies.isPageRenderingAvailable = overrides.isPageRenderingAvailable;
  if ('isWorkflowAvailable' in overrides) dependencies.isWorkflowAvailable = overrides.isWorkflowAvailable;
=======
  for (const key of [
    'readSessionMetadata', 'persistSessionMetadata', 'isAgentMemoryEnabled', 'isMemoryToolAvailable', 'isSessionLinkingAvailable',
    'isPageRenderingAvailable', 'isSecretRequestAvailable', 'isWorkflowAvailable', 'readCheckoutBranch', 'readPlaceholderBranch', 'instructionEntries', 'isWorkNamingAvailable',
  ]) {
    if (key in overrides) dependencies[key] = overrides[key];
  }
>>>>>>> bc50ba56a
  return createSessionKnowledgeRuntime(dependencies);
};

/** An in-memory stand-in for `session-metadata-store.js`. */
const createMetadataStub = (initial = {}) => {
  const state = { ...initial };
  const patches = [];
  return {
    patches,
    readSessionMetadata: async (sessionId) => state[sessionId] ?? {},
    persistSessionMetadata: async (sessionId, directory, patch) => {
      patches.push({ sessionId, directory, patch });
      const openchamber = { ...(state[sessionId]?.openchamber ?? {}), ...(patch.openchamber ?? {}) };
      state[sessionId] = { ...(state[sessionId] ?? {}), openchamber };
    },
  };
};

describe('what the session is owed', () => {
  test('carries pinned notes and pinned plan bodies', async () => {
    const { text } = await createRuntime().resolvePending(DIRECTORY, '', PINS);

<<<<<<< HEAD
    expect(text).toContain('Pinned note body.');
    expect(text).toContain('Migration plan');
    expect(text).toContain('Plan body.');
  });

  test('never copies memory titles, memory guidance or session-link guidance into the prompt', async () => {
    const runtime = createRuntime({
      agentMemoryRuntime: {
        readAll: async () => ({
          global: [memory({ title: 'Uses bun' }), memory({ id: 'm2', title: 'Remember the deploy flag' })],
          project: [memory({ id: 'm3', title: 'Project memory title' })],
          globalFailed: false, projectFailed: false,
        }),
=======
const pinnedStore = () => createMetadataStub({
  ses_a: { openchamber: { project_context_pins: PINS } },
});

describe('writing the knowledge into a session', () => {
  test('puts each source under its own key and removes the empty ones', async () => {
    const instructionEntries = createEntriesStub();
    const runtime = createRuntime({ ...pinnedStore(), instructionEntries });

    expect(await runtime.sync('ses_a', DIRECTORY, 'Keep replies short.')).toBe(true);

    expect(instructionEntries.held.get(PINNED)).toContain('Pinned note body.');
    expect(instructionEntries.held.get(PINNED)).toContain('Plan body.');
    expect(instructionEntries.held.get(MEMORY)).toContain('Uses bun');
    expect(instructionEntries.held.get(RESPONSE_STYLE)).toBe('Keep replies short.');
    // No tool: no guidance and no branch, so those keys are cleared.
    expect(instructionEntries.calls).toContainEqual(['remove', 'ses_a', DIRECTORY, GUIDANCE]);
    expect(instructionEntries.calls).toContainEqual(['remove', 'ses_a', DIRECTORY, CHECKOUT]);
  });

  test('an unpinned note takes its entry away', async () => {
    const instructionEntries = createEntriesStub();
    const store = pinnedStore();
    const runtime = createRuntime({ ...store, instructionEntries, isMemoryToolAvailable: async () => false });
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.has(PINNED)).toBe(true);

    await runtime.setPin('ses_a', DIRECTORY, 'note', 'n1', false);
    await runtime.setPin('ses_a', DIRECTORY, 'plan', 'p1', false);
    await runtime.sync('ses_a', DIRECTORY);

    expect(instructionEntries.held.has(PINNED)).toBe(false);
  });

  test('an omitted response style leaves the existing entry alone, while an empty one clears it', async () => {
    const instructionEntries = createEntriesStub();
    const runtime = createRuntime({ ...pinnedStore(), instructionEntries });

    await runtime.sync('ses_a', DIRECTORY, 'Keep replies short.');
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.get(RESPONSE_STYLE)).toBe('Keep replies short.');

    await runtime.sync('ses_a', DIRECTORY, '');
    expect(instructionEntries.held.has(RESPONSE_STYLE)).toBe(false);
  });

  test('serialises concurrent syncs for one session', async () => {
    const held = new Map();
    const calls = [];
    let releaseFirst;
    let firstPutStarted;
    const firstPut = new Promise((resolve) => { firstPutStarted = resolve; });
    let first = true;
    const instructionEntries = {
      put: async (sessionId, directory, key, value) => {
        calls.push([sessionId, directory, key, value]);
        if (first) {
          first = false;
          firstPutStarted();
          await new Promise((resolve) => { releaseFirst = resolve; });
        }
        held.set(key, value);
      },
      remove: async (_sessionId, _directory, key) => { held.delete(key); },
    };
    const runtime = createRuntime({ ...pinnedStore(), instructionEntries });
    const firstSync = runtime.sync('ses_a', DIRECTORY, 'old style');
    await firstPut;
    const secondSync = runtime.sync('ses_a', DIRECTORY, 'new style');

    expect(calls.filter((call) => call[2] === RESPONSE_STYLE).map((call) => call[3])).toEqual(['old style']);
    releaseFirst();
    await firstSync;
    await secondSync;

    expect(held.get(RESPONSE_STYLE)).toBe('new style');
    expect(calls.filter((call) => call[2] === RESPONSE_STYLE).map((call) => call[3])).toEqual(['old style', 'new style']);
  });

  test('one entry that will not write does not hold back the others', async () => {
    const instructionEntries = createEntriesStub({ fail: new Set([PINNED]) });
    const runtime = createRuntime({ ...pinnedStore(), instructionEntries });

    expect(await runtime.sync('ses_a', DIRECTORY)).toBe(false);
    expect(instructionEntries.held.get(MEMORY)).toContain('Uses bun');
  });

  test('never throws, so a send goes out without its background', async () => {
    const instructionEntries = createEntriesStub();
    const runtime = createRuntime({
      ...pinnedStore(),
      instructionEntries,
      projectContextRuntime: { readContext: async () => { throw new Error('unreadable'); } },
      agentMemoryRuntime: { readAll: async () => { throw new Error('unreadable'); } },
      isSessionLinkingAvailable: async () => { throw new Error('settings unreadable'); },
    });
    await expect(runtime.sync('ses_a', DIRECTORY)).resolves.toBe(true);

    const broken = createSessionKnowledgeRuntime({ instructionEntries, readSessionMetadata: async () => ({}) });
    await expect(broken.sync('ses_a', DIRECTORY)).resolves.toBe(false);
    await expect(runtime.sync('', DIRECTORY)).resolves.toBe(false);
  });

  test('does nothing without OpenCode wired', async () => {
    expect(await createRuntime(pinnedStore()).sync('ses_a', DIRECTORY)).toBe(false);
  });
});

describe('when to link', () => {
  test('is told in a session whose agent has the tool, even with nothing else to tell', async () => {
    const runtime = createRuntime({
      isSessionLinkingAvailable: async () => true,
      isMemoryToolAvailable: async () => false,
      projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
    });
    const entries = await entriesFor(runtime, NO_PINS);

    expect(entries[GUIDANCE]).toBe(SESSION_LINK_GUIDANCE);
    expect(entries[PINNED]).toBe('');
    expect(entries[MEMORY]).toBe('');
  });

  test('asks for the task name in the language of the user, the branch in English', () => {
    expect(WORK_NAME_GUIDANCE).toContain("in the language of the user's latest message");
    expect(WORK_NAME_GUIDANCE).toContain('A branch name stays in English.');
  });

  test('naming guidance is restricted to linked worktrees and spaces', async () => {
    const runtime = createRuntime({
      isSessionLinkingAvailable: async () => true,
      isWorkNamingAvailable: async (directory) => directory === '/linked' || directory === '/spaces/abcdef123456/project',
    });
    for (const directory of ['/linked', '/spaces/abcdef123456/project']) {
      expect((await entriesFor(runtime, NO_PINS, directory))[GUIDANCE]).toContain(WORK_NAME_GUIDANCE);
    }
    for (const directory of ['/main', '/plain']) {
      expect((await entriesFor(runtime, NO_PINS, directory))[GUIDANCE]).not.toContain(WORK_NAME_GUIDANCE);
    }
    expect((await entriesFor(createRuntime({ isSessionLinkingAvailable: async () => true, isWorkNamingAvailable: async () => { throw new Error('unavailable'); } })))[GUIDANCE]).not.toContain(WORK_NAME_GUIDANCE);
  });

  test('is left out without the tool, or when the check fails', async () => {
    for (const isSessionLinkingAvailable of [async () => false, async () => { throw new Error('settings unreadable'); }]) {
      const entries = await entriesFor(createRuntime({ isSessionLinkingAvailable }));
      expect(entries[GUIDANCE]).toBe('');
    }
  });
});

describe('when to draw a page', () => {
  const bare = {
    isMemoryToolAvailable: async () => false,
    projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
  };

  test('is told in a session whose agent has the render tool', async () => {
    const entries = await entriesFor(createRuntime({ ...bare, isPageRenderingAvailable: async () => true }), NO_PINS);

    expect(entries[GUIDANCE]).toBe(`${UI_BLOCKS_GUIDANCE}\n\n${RENDER_PAGE_GUIDANCE}\n\n${REPLY_COMMAND_GUIDANCE}\n\n${directToolsGuidance(['openchamber_render'])}`);
    expect(entries[GUIDANCE]).toContain('Not for a few numbers');
    expect(entries[GUIDANCE]).toContain('root = Stack([...])');
  });

  test('is left out without the tool, or when the check fails', async () => {
    for (const isPageRenderingAvailable of [async () => false, async () => { throw new Error('settings unreadable'); }]) {
      const entries = await entriesFor(createRuntime({ ...bare, isPageRenderingAvailable }), NO_PINS);
      expect(entries[GUIDANCE]).toBe('');
    }
  });
});

describe('when to ask for a secret', () => {
  const bare = {
    isMemoryToolAvailable: async () => false,
    projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
  };

  test('is told only in a session whose agent has the secret tool', async () => {
    const withTool = await entriesFor(createRuntime({ ...bare, isSecretRequestAvailable: async () => true }), NO_PINS);
    expect(withTool[GUIDANCE]).toBe(`${SECRET_REQUEST_GUIDANCE}\n\n${directToolsGuidance(['openchamber_secret'])}`);

    const without = await entriesFor(createRuntime({ ...bare, isSecretRequestAvailable: async () => { throw new Error('settings unreadable'); } }), NO_PINS);
    expect(without[GUIDANCE]).toBe('');
  });
});

describe('when to offer a workflow', () => {
  const bare = {
    isMemoryToolAvailable: async () => false,
    projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
  };

  test('is told only in a session whose agent has the workflow tool', async () => {
    const withTool = await entriesFor(createRuntime({ ...bare, isWorkflowAvailable: async () => true }), NO_PINS);
    expect(withTool[GUIDANCE]).toBe(`${WORKFLOW_GUIDANCE}\n\n${directToolsGuidance(['openchamber_workflow'])}`);
    expect(withTool[GUIDANCE]).toContain('never start one unasked');

    const without = await entriesFor(createRuntime({ ...bare, isWorkflowAvailable: async () => { throw new Error('settings unreadable'); } }), NO_PINS);
    expect(without[GUIDANCE]).toBe('');
  });
});

describe('where the managed tools are called', () => {
  test('names the direct tools the session has, and none for tools behind Code Mode', async () => {
    const control = await entriesFor(createRuntime({ isSessionLinkingAvailable: async () => true }));
    expect(control[GUIDANCE]).not.toContain('direct tool');
    const all = await entriesFor(createRuntime({ isPageRenderingAvailable: async () => true, isSecretRequestAvailable: async () => true, isWorkflowAvailable: async () => true }));
    expect(all[GUIDANCE]).toContain('openchamber_render, openchamber_secret, openchamber_workflow are direct tool calls: never call them from inside a Code Mode execute script');
    expect(directToolsGuidance(['openchamber_render'])).toBe('openchamber_render is a direct tool call: never call it from inside a Code Mode execute script, where it does not exist.');
  });
});

describe('the worktree move', () => {
  test('is introduced by the tool description, never told as a rule in the session', async () => {
    const entries = await entriesFor(createRuntime({ isSessionLinkingAvailable: async () => true }));
    expect(entries[GUIDANCE]).not.toContain('moveToWorktree');
  });
});

describe('which branch the session works on', () => {
  const runtimeOn = (branch, overrides = {}) => createRuntime({
    isSessionLinkingAvailable: async () => true,
    isMemoryToolAvailable: async () => false,
    readCheckoutBranch: async () => {
      if (branch instanceof Error) throw branch;
      return branch;
    },
    ...overrides,
  });

  test('names the directory and the branch', async () => {
    const entries = await entriesFor(runtimeOn('main'));
    expect(entries[CHECKOUT]).toBe('This session works in `/work/project`, on branch `main`.');
  });

  test('a switched branch changes the entry, which OpenCode announces to the agent', async () => {
    const instructionEntries = createEntriesStub();
    let branch = 'main';
    const runtime = runtimeOn(null, {
      ...pinnedStore(),
      instructionEntries,
      readCheckoutBranch: async () => branch,
    });
    await runtime.sync('ses_a', DIRECTORY);
    const before = instructionEntries.held.get(CHECKOUT);

    branch = 'fix/other-session';
    await runtime.sync('ses_a', DIRECTORY);

    expect(instructionEntries.held.get(CHECKOUT)).not.toBe(before);
    expect(instructionEntries.held.get(CHECKOUT)).toContain('`fix/other-session`');
  });

  test('a session that moved to another directory names the new one', async () => {
    const entries = await entriesFor(runtimeOn('feat/moved'), PINS, '/work/project-worktree');
    expect(entries[CHECKOUT]).toBe('This session works in `/work/project-worktree`, on branch `feat/moved`.');
  });

  test('a branch that cannot be read keeps what the session holds', async () => {
    for (const unreadable of [null, new Error('git failed')]) {
      const entries = await entriesFor(runtimeOn(unreadable));
      expect(entries).not.toHaveProperty(CHECKOUT);
    }
  });

  test('an empty branch replaces the old branch and directory; a failed read preserves it', async () => {
    const instructionEntries = createEntriesStub();
    let branch = 'main';
    const runtime = runtimeOn(null, {
      ...pinnedStore(),
      instructionEntries,
      readCheckoutBranch: async () => {
        if (branch instanceof Error) throw branch;
        return branch;
>>>>>>> bc50ba56a
      },
      isSessionLinkingAvailable: async () => true,
    });

    const { text } = await runtime.resolvePending(DIRECTORY, '', PINS);

    expect(text).toContain('Pinned note body.');
    for (const forbidden of ['Uses bun', 'Remember the deploy flag', 'Project memory title', 'Save to it in the moment', 'session.link', 'Whenever the user gives']) {
      expect(text).not.toContain(forbidden);
    }
  });

  test('memory being on does not create an otherwise empty delivery', async () => {
    const runtime = createRuntime({
      projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
      agentMemoryRuntime: { readAll: async () => ({ global: [memory()], project: [], globalFailed: false, projectFailed: false }) },
      isSessionLinkingAvailable: async () => true,
    });

    const { text, signature } = await runtime.resolvePending(DIRECTORY, '');

    expect(text).toBe('');
    expect(signature).toBe('');
  });

  test('unpinned notes and plans stay out', async () => {
    const runtime = createRuntime({
<<<<<<< HEAD
      projectContextRuntime: {
        readContext: async () => ({ notes: [note({ pinned: false })], todos: [], plans: [] }),
=======
      projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
      isMemoryToolAvailable: async () => false,
    });
    const entries = await entriesFor(runtime, NO_PINS);
    expect(Object.values(entries).every((text) => text === '')).toBe(true);
  });

  test('an empty memory store still tells the session when to save', async () => {
    const runtime = createRuntime({
      agentMemoryRuntime: {
        readAll: async () => ({ global: [], project: [], globalFailed: false, projectFailed: false }),
>>>>>>> bc50ba56a
      },
    });

    const { text } = await runtime.resolvePending(DIRECTORY, '', { notes: [], plans: [] });

    expect(text).toBe('');
  });
});

describe('what has already been delivered', () => {
  test('owes nothing when the signature matches', async () => {
    const runtime = createRuntime();
    const first = await runtime.resolvePending(DIRECTORY, '', PINS);

    const second = await runtime.resolvePending(DIRECTORY, first.signature, PINS);

    expect(second.text).toBe('');
    expect(second.signature).toBe(first.signature);
  });

  test('an edited note owes the block again', () => {
    const before = buildKnowledgeSignature({ notes: [note()], plans: [] });
    const after = buildKnowledgeSignature({ notes: [note({ updatedAt: 2 })], plans: [] });

    expect(after).not.toBe(before);
  });

  test('the same pins in a different order are the same signature', () => {
    const a = buildKnowledgeSignature({ notes: [note({ id: 'a' }), note({ id: 'b' })], plans: [] });
    const b = buildKnowledgeSignature({ notes: [note({ id: 'b' }), note({ id: 'a' })], plans: [] });

    expect(a).toBe(b);
  });

  test('memory changes do not change the delivered signature', () => {
    expect(buildKnowledgeSignature({ notes: [], plans: [] })).toBe('');
  });
});

describe('when a source will not load', () => {
  test('a broken memory store does not affect pinned notes', async () => {
    const runtime = createRuntime({
      agentMemoryRuntime: { readAll: async () => { throw new Error('unreadable'); } },
    });

    const { text } = await runtime.resolvePending(DIRECTORY, '', PINS);

    expect(text).toContain('Pinned note body.');
  });

  test('an unreadable plan is marked, not dropped', async () => {
    const runtime = createRuntime({
      projectContextRuntime: {
        readContext: async () => ({ notes: [], todos: [], plans: [plan()] }),
        readPlan: async () => { throw new Error('gone'); },
      },
    });

    const { text } = await runtime.resolvePending(DIRECTORY, '', PINS);

    expect(text).toContain('Migration plan');
    expect(text).toContain('plan content unavailable');
  });

  test('a broken project context delivers nothing rather than failing the send', async () => {
    const runtime = createRuntime({
      projectContextRuntime: { readContext: async () => { throw new Error('unreadable'); } },
    });

    const { text } = await runtime.resolvePending(DIRECTORY, '', PINS);

    expect(text).toBe('');
  });
});

<<<<<<< HEAD
describe('the panel summary', () => {
  test('still reports pinned names and memory counts for the UI', async () => {
    const summary = await createRuntime().collectSummary(DIRECTORY, PINS);

    expect(summary.notes).toEqual([{ id: 'n1', body: 'Pinned note body.' }]);
    expect(summary.plans).toEqual([{ id: 'p1', title: 'Migration plan' }]);
    expect(summary.memory).toEqual({ global: 1, project: 0 });
  });

  test('leaves memory out of the summary while the feature is off', async () => {
    const runtime = createRuntime({ isAgentMemoryEnabled: async () => false });

    const summary = await runtime.collectSummary(DIRECTORY, PINS);

    expect(summary.memory).toEqual({ global: 0, project: 0 });
    expect(summary.notes).toHaveLength(1);
  });

  test('an unreadable memory store shows zero rather than guessing', async () => {
    const runtime = createRuntime({
      agentMemoryRuntime: { readAll: async () => { throw new Error('unreadable'); } },
=======
describe('the memory switch', () => {
  test('memory is left out entirely while the session has no memory tool', async () => {
    const entries = await entriesFor(createRuntime({ isMemoryToolAvailable: async () => false }));
    expect(entries[MEMORY]).toBe('');
    expect(entries[PINNED]).toContain('Pinned note body.');
  });

  test('the panel still counts memory while the session has no tool to save with', async () => {
    const runtime = createRuntime({
      isAgentMemoryEnabled: async () => true,
      isMemoryToolAvailable: async () => false,
    });
    expect((await entriesFor(runtime))[MEMORY]).toBe('');
    expect((await runtime.collectSummary(DIRECTORY)).memory).toEqual({ global: 1, project: 0 });
  });

  test('an unreadable setting keeps memory out rather than guessing', async () => {
    const runtime = createRuntime({
      isMemoryToolAvailable: async () => { throw new Error('settings unreadable'); },
>>>>>>> bc50ba56a
    });

    const summary = await runtime.collectSummary(DIRECTORY, PINS);

    expect(summary.memory).toEqual({ global: 0, project: 0 });
  });
});

describe('reading what a session was told', () => {
  test('project context pins are isolated in each session metadata record', () => {
    const runtime = createRuntime();

    expect(runtime.readPins({
      metadata: { openchamber: { project_context_pins: { notes: ['n1'], plans: [] } } },
    })).toEqual({ notes: ['n1'], plans: [] });
    expect(runtime.readPins({
      metadata: { openchamber: { project_context_pins: { notes: [], plans: ['p1'] } } },
    })).toEqual({ notes: [], plans: ['p1'] });
    expect(runtime.readPins({})).toEqual({ notes: [], plans: [] });
  });

  test('pins into OpenChamber\'s own store and invalidates the delivered signature', async () => {
    const store = createMetadataStub({
      ses_a: { openchamber: { project_context_pins: { notes: [], plans: [] }, knowledge_context_delivered: 'old' } },
    });
    const runtime = createRuntime(store);

    await expect(runtime.setPin('ses_a', DIRECTORY, 'note', 'n1', true)).resolves.toEqual({ notes: ['n1'], plans: [] });

    expect(store.patches).toEqual([{
      sessionId: 'ses_a',
      directory: DIRECTORY,
      patch: {
        openchamber: {
          project_context_pins: { notes: ['n1'], plans: [] },
          knowledge_context_delivered: '',
        },
      },
    }]);
  });

  test('unpins the same way', async () => {
    const store = createMetadataStub({
      ses_a: { openchamber: { project_context_pins: { notes: ['n1', 'n2'], plans: [] } } },
    });
    const runtime = createRuntime(store);

    await expect(runtime.setPin('ses_a', DIRECTORY, 'note', 'n1', false)).resolves.toEqual({ notes: ['n2'], plans: [] });
  });

  test('records delivery as a merge patch, leaving neighbouring state alone', async () => {
    const store = createMetadataStub();
    const runtime = createRuntime(store);

    await runtime.recordDelivered('ses_a', DIRECTORY, 'sig-1');

    expect(store.patches).toEqual([{
      sessionId: 'ses_a',
      directory: DIRECTORY,
      patch: { openchamber: { knowledge_context_delivered: 'sig-1' } },
    }]);
  });

  test('says so plainly when no metadata store is wired', async () => {
    const runtime = createRuntime();
    await expect(runtime.setPin('ses_a', DIRECTORY, 'note', 'n1', true)).rejects.toThrow(/session metadata store/);
    await expect(runtime.recordDelivered('ses_a', DIRECTORY, 'sig')).rejects.toThrow(/session metadata store/);
  });

  test('finds the signature stored on the session', () => {
    const runtime = createRuntime();

    expect(runtime.readDeliveredSignature({
      metadata: { openchamber: { knowledge_context_delivered: 'sig' } },
    })).toBe('sig');
  });

  test('a session with no metadata has been told nothing', () => {
    const runtime = createRuntime();

    expect(runtime.readDeliveredSignature({})).toBe('');
    expect(runtime.readDeliveredSignature(null)).toBe('');
  });
});

describe('size', () => {
  test('an oversized block is cut and says so', () => {
    const text = buildKnowledgeText({
      notes: [note({ body: 'x'.repeat(20_000) })],
      plans: [],
    });

    expect(text.length).toBeLessThan(8_200);
    expect(text).toContain('project knowledge truncated');
  });

  test('a huge pin truncates cleanly without injecting memory or guidance', () => {
    const text = buildKnowledgeText({
      notes: [note({ body: 'x'.repeat(20_000) })],
      plans: [],
      memory: { global: [memory()], project: [], enabled: true, complete: true },
    });

    expect(text.length).toBeLessThan(8_200);
    expect(text).not.toContain('Uses bun');
    expect(text).not.toContain('Save to it in the moment');
  });
});

describe('the tools the session has', () => {
  test('render, workflow and linking tools never inject prompt guidance into the session', async () => {
    const withTools = await createRuntime({
      projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
      isAgentMemoryEnabled: async () => false,
      isPageRenderingAvailable: async () => true,
      isWorkflowAvailable: async () => true,
      isSessionLinkingAvailable: async () => true,
    }).resolvePending(DIRECTORY, '');

    expect(withTools.text).toBe('');
    expect(withTools.signature).toBe('');
  });

  test('switching a tool on or off does not alter the knowledge signature', () => {
    const base = { notes: [note()], plans: [] };
    expect(buildKnowledgeSignature({ ...base, rendering: true })).toBe(buildKnowledgeSignature(base));
    expect(buildKnowledgeSignature({ ...base, workflows: true })).toBe(buildKnowledgeSignature(base));
    expect(buildKnowledgeSignature({ ...base, linking: true })).toBe(buildKnowledgeSignature(base));
  });

  test('a failing tool availability check never breaks knowledge resolution', async () => {
    const { text } = await createRuntime({
      isAgentMemoryEnabled: async () => false,
      isPageRenderingAvailable: async () => { throw new Error('settings unreadable'); },
      isWorkflowAvailable: async () => { throw new Error('settings unreadable'); },
      isSessionLinkingAvailable: async () => { throw new Error('settings unreadable'); },
    }).resolvePending(DIRECTORY, '', PINS);

    expect(text).toContain('Pinned note body.');
    expect(text).not.toContain('openchamber_render');
    expect(text).not.toContain('openchamber_workflow');
  });

  test('a memory index over budget keeps the newest whole titles and counts the rest', () => {
    const entry = (index) => ({ title: `Project decision number ${index} about something`, type: 'fact', createdAt: index, updatedAt: index });
    const project = Array.from({ length: 300 }, (_, index) => entry(index));
    const memory = buildKnowledgeEntries({
      notes: [], plans: [], memory: { global: [], project, enabled: true, complete: true },
    })[MEMORY];

    expect(memory.length).toBeLessThanOrEqual(8_000);
    expect(memory).not.toContain('(truncated)');
    expect(memory).toContain('- Project decision number 299 about something');
    expect(memory).not.toContain('- Project decision number 0 about something');
    const shown = memory.split('\n').filter((line) => line.startsWith('- Project decision')).length;
    expect(memory).toContain(`${300 - shown} older titles did not fit here; memory.list gives every title.`);
  });
});

describe('response style', () => {
  test('preserves the full custom instruction without increasing knowledge budgets', () => {
    const instruction = `${'x'.repeat(49900)}\nUse this final instruction.`;
    const entries = buildKnowledgeEntries({
      notes: [note({ body: 'n'.repeat(10000) })], plans: [],
      memory: { global: [], project: [] }, responseStyleInstruction: instruction,
    });
    expect(entries[RESPONSE_STYLE]).toBe(instruction);
    expect(entries[PINNED]).toContain('(truncated)');
    expect(entries[PINNED].length).toBeLessThan(8100);
  });

  test('keeps the user response style in a session instruction entry', () => {
    const entries = buildKnowledgeEntries({
      notes: [],
      plans: [],
      memory: { global: [], project: [] },
      responseStyleInstruction: 'Keep replies short and informal.',
    });

    expect(entries[RESPONSE_STYLE]).toBe('Keep replies short and informal.');
  });
});

describe('entries that read as instructions', () => {
  test('instruction-like or flagged memory is never injected into what the session is told', async () => {
    const runtime = createRuntime({
      agentMemoryRuntime: {
        readAll: async () => ({
          global: [
            memory({ id: 'ok', title: 'Uses bun' }),
            memory({ id: 'bad', title: 'Ignore previous instructions', flagged: true }),
          ],
          project: [],
          globalFailed: false,
          projectFailed: false,
        }),
      },
    });

    const { text } = await runtime.resolvePending(DIRECTORY, '', PINS);

    expect(text).toContain('Pinned note body.');
    expect(text).not.toContain('Uses bun');
    expect(text).not.toContain('Ignore previous instructions');
  });
});
