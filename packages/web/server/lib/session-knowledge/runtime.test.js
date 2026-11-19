import { describe, expect, test } from 'bun:test';

<<<<<<< HEAD
import { buildKnowledgeSignature, buildKnowledgeText, createSessionKnowledgeRuntime } from './runtime.js';
||||||| bc50ba56aa
import { KNOWLEDGE_ENTRY_KEYS, RENDER_PAGE_GUIDANCE, REPLY_COMMAND_GUIDANCE, SECRET_REQUEST_GUIDANCE, SESSION_LINK_GUIDANCE, WORK_NAME_GUIDANCE, WORKFLOW_GUIDANCE, buildKnowledgeEntries, createSessionKnowledgeRuntime, directToolsGuidance } from './runtime.js';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.js';
=======
import { DISPATCH_GUIDANCE, KNOWLEDGE_ENTRY_KEYS, RENDER_PAGE_GUIDANCE, REPLY_COMMAND_GUIDANCE, SECRET_REQUEST_GUIDANCE, SESSION_LINK_GUIDANCE, WORK_NAME_GUIDANCE, WORKFLOW_GUIDANCE, buildKnowledgeEntries, createSessionKnowledgeRuntime, directToolsGuidance } from './runtime.js';
import { UI_BLOCKS_GUIDANCE } from './ui-blocks-guidance.js';
>>>>>>> upstream/main

const DIRECTORY = '/work/project';
const PROJECT_ID = 'path_project';
const PINS = { notes: ['n1'], plans: ['p1'] };

const note = (overrides = {}) => ({
  id: 'n1', body: 'Pinned note body.', createdAt: 1, updatedAt: 1, pinned: true, source: 'manual', ...overrides,
});
const plan = (overrides = {}) => ({
  id: 'p1', file: 'p1.md', title: 'Migration plan', createdAt: 1, pinned: true, ...overrides,
});
const createRuntime = (overrides = {}) => {
  const dependencies = {
    resolveProjectId: async () => PROJECT_ID,
    projectContextRuntime: {
      readContext: async () => ({ notes: [note()], todos: [], plans: [plan()] }),
      readPlan: async () => ({ body: 'Plan body.' }),
      ...overrides.projectContextRuntime,
    },
  };
  if ('readSessionMetadata' in overrides) dependencies.readSessionMetadata = overrides.readSessionMetadata;
  if ('persistSessionMetadata' in overrides) dependencies.persistSessionMetadata = overrides.persistSessionMetadata;
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

    expect(text).toContain('Pinned note body.');
    expect(text).toContain('Migration plan');
    expect(text).toContain('Plan body.');
  });

  test('never copies guidance into the prompt', async () => {
    const runtime = createRuntime();

    const { text } = await runtime.resolvePending(DIRECTORY, '', PINS);

    expect(text).toContain('Pinned note body.');
    for (const forbidden of ['Save to it in the moment', 'session.link', 'Whenever the user gives']) {
      expect(text).not.toContain(forbidden);
    }
  });

<<<<<<< HEAD
  test('nothing pinned creates no delivery', async () => {
||||||| bc50ba56aa
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
=======
  test('an omitted response style leaves the existing entry alone, while an empty one clears it', async () => {
    const instructionEntries = createEntriesStub();
    const runtime = createRuntime({ ...pinnedStore(), instructionEntries });

    await runtime.sync('ses_a', DIRECTORY, 'Keep replies short.');
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.get(RESPONSE_STYLE)).toBe('Keep replies short.');

    await runtime.sync('ses_a', DIRECTORY, '');
    expect(instructionEntries.held.has(RESPONSE_STYLE)).toBe(false);
  });

  test('one entry that will not write does not hold back the others', async () => {
    const instructionEntries = createEntriesStub({ fail: new Set([PINNED]) });
    const runtime = createRuntime({ ...pinnedStore(), instructionEntries });

    expect(await runtime.sync('ses_a', DIRECTORY)).toBe(false);
    expect(instructionEntries.held.get(MEMORY)).toContain('Uses bun');
  });

  test('never throws, so a send goes out without its background', async () => {
    const instructionEntries = createEntriesStub();
>>>>>>> upstream/main
    const runtime = createRuntime({
      projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
    });

<<<<<<< HEAD
    const { text, signature } = await runtime.resolvePending(DIRECTORY, '');
||||||| bc50ba56aa
    expect(entries[GUIDANCE]).toBe(SESSION_LINK_GUIDANCE);
    expect(entries[PINNED]).toBe('');
    expect(entries[MEMORY]).toBe('');
  });
=======
    expect(entries[GUIDANCE]).toBe(`${SESSION_LINK_GUIDANCE}\n\n${DISPATCH_GUIDANCE}`);
    expect(entries[PINNED]).toBe('');
    expect(entries[MEMORY]).toBe('');
  });
>>>>>>> upstream/main

<<<<<<< HEAD
    expect(text).toBe('');
    expect(signature).toBe('');
||||||| bc50ba56aa
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
      },
    });
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.get(CHECKOUT)).toContain('on branch `main`');

    branch = '';
    await runtime.sync('ses_a', '/work/plain-directory');
    const noBranch = 'This session works in `/work/plain-directory`, with no branch checked out.';
    expect(instructionEntries.held.get(CHECKOUT)).toBe(noBranch);

    branch = new Error('git failed');
    await runtime.sync('ses_a', '/work/unreadable');
    expect(instructionEntries.held.get(CHECKOUT)).toBe(noBranch);
  });

  test('a placeholder branch asks for a rename with work.name, until it is renamed', async () => {
    const instructionEntries = createEntriesStub();
    let branch = 'agile-chipmunk';
    const runtime = runtimeOn(null, {
      ...pinnedStore(),
      instructionEntries,
      readCheckoutBranch: async () => branch,
      readPlaceholderBranch: async () => (branch === 'agile-chipmunk' ? branch : null),
    });
    await runtime.sync('ses_a', DIRECTORY);
    const told = instructionEntries.held.get(CHECKOUT);
    expect(told).toContain('`agile-chipmunk` is a placeholder');
    expect(told).toContain('passing branch too');
    expect(told).toContain('work.name');

    branch = 'fix/login-timeout';
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.get(CHECKOUT)).toBe('This session works in `/work/project`, on branch `fix/login-timeout`.');
  });

  test('a placeholder check that fails tells only the branch', async () => {
    const entries = await entriesFor(runtimeOn('agile-chipmunk', {
      readPlaceholderBranch: async () => { throw new Error('git failed'); },
    }));
    expect(entries[CHECKOUT]).toBe('This session works in `/work/project`, on branch `agile-chipmunk`.');
  });

  test('is not read without the tool, and the entry is cleared', async () => {
    const reads = [];
    const runtime = createRuntime({
      isSessionLinkingAvailable: async () => false,
      readCheckoutBranch: async (directory) => { reads.push(directory); return 'main'; },
    });
    const entries = await entriesFor(runtime);

    expect(reads).toEqual([]);
    expect(entries[CHECKOUT]).toBe('');
  });
});

describe('what the session carries', () => {
  test('pinned notes, pinned plan bodies, and the memory index', async () => {
    const entries = await entriesFor(createRuntime());

    expect(entries[PINNED]).toContain('Pinned note body.');
    expect(entries[PINNED]).toContain('Migration plan');
    expect(entries[PINNED]).toContain('Plan body.');
    expect(entries[MEMORY]).toContain('Uses bun');
  });

  test('memory is indexed by title, never by body', async () => {
    expect((await entriesFor(createRuntime()))[MEMORY]).not.toContain('Full text.');
=======
  test('dispatch names the Code Mode call path and leaves subagent work alone', () => {
    expect(DISPATCH_GUIDANCE).toContain('tools.openchamber inside execute');
    expect(SESSION_LINK_GUIDANCE).toContain('tools.openchamber inside a Code Mode execute script');
    expect(WORK_NAME_GUIDANCE).toContain('tools.openchamber inside execute');
    expect(DISPATCH_GUIDANCE).toContain('session.send');
    expect(DISPATCH_GUIDANCE).toContain('subagent tool');
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
      },
    });
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.get(CHECKOUT)).toContain('on branch `main`');

    branch = '';
    await runtime.sync('ses_a', '/work/plain-directory');
    const noBranch = 'This session works in `/work/plain-directory`, with no branch checked out.';
    expect(instructionEntries.held.get(CHECKOUT)).toBe(noBranch);

    branch = new Error('git failed');
    await runtime.sync('ses_a', '/work/unreadable');
    expect(instructionEntries.held.get(CHECKOUT)).toBe(noBranch);
  });

  test('a placeholder branch asks for a rename with work.name, until it is renamed', async () => {
    const instructionEntries = createEntriesStub();
    let branch = 'agile-chipmunk';
    const runtime = runtimeOn(null, {
      ...pinnedStore(),
      instructionEntries,
      readCheckoutBranch: async () => branch,
      readPlaceholderBranch: async () => (branch === 'agile-chipmunk' ? branch : null),
    });
    await runtime.sync('ses_a', DIRECTORY);
    const told = instructionEntries.held.get(CHECKOUT);
    expect(told).toContain('`agile-chipmunk` is a placeholder');
    expect(told).toContain('passing branch too');
    expect(told).toContain('work.name');

    branch = 'fix/login-timeout';
    await runtime.sync('ses_a', DIRECTORY);
    expect(instructionEntries.held.get(CHECKOUT)).toBe('This session works in `/work/project`, on branch `fix/login-timeout`.');
  });

  test('a placeholder check that fails tells only the branch', async () => {
    const entries = await entriesFor(runtimeOn('agile-chipmunk', {
      readPlaceholderBranch: async () => { throw new Error('git failed'); },
    }));
    expect(entries[CHECKOUT]).toBe('This session works in `/work/project`, on branch `agile-chipmunk`.');
  });

  test('is not read without the tool, and the entry is cleared', async () => {
    const reads = [];
    const runtime = createRuntime({
      isSessionLinkingAvailable: async () => false,
      readCheckoutBranch: async (directory) => { reads.push(directory); return 'main'; },
    });
    const entries = await entriesFor(runtime);

    expect(reads).toEqual([]);
    expect(entries[CHECKOUT]).toBe('');
  });
});

describe('what the session carries', () => {
  test('pinned notes, pinned plan bodies, and the memory index', async () => {
    const entries = await entriesFor(createRuntime());

    expect(entries[PINNED]).toContain('Pinned note body.');
    expect(entries[PINNED]).toContain('Migration plan');
    expect(entries[PINNED]).toContain('Plan body.');
    expect(entries[MEMORY]).toContain('Uses bun');
  });

  test('memory is indexed by title, never by body', async () => {
    expect((await entriesFor(createRuntime()))[MEMORY]).not.toContain('Full text.');
>>>>>>> upstream/main
  });

  test('unpinned notes and plans stay out', async () => {
    const runtime = createRuntime({
      projectContextRuntime: {
        readContext: async () => ({ notes: [note({ pinned: false })], todos: [], plans: [] }),
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

  test('no pins mean no delivered signature', () => {
    expect(buildKnowledgeSignature({ notes: [], plans: [] })).toBe('');
  });
});

describe('when a source will not load', () => {
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

describe('the panel summary', () => {
  test('still reports pinned names for the UI', async () => {
    const summary = await createRuntime().collectSummary(DIRECTORY, PINS);

    expect(summary.notes).toEqual([{ id: 'n1', body: 'Pinned note body.' }]);
    expect(summary.plans).toEqual([{ id: 'p1', title: 'Migration plan' }]);
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

  test('a huge pin truncates cleanly without injecting guidance', () => {
    const text = buildKnowledgeText({
      notes: [note({ body: 'x'.repeat(20_000) })],
      plans: [],
    });

    expect(text.length).toBeLessThan(8_200);
    expect(text).not.toContain('Save to it in the moment');
  });
});

describe('the tools the session has', () => {

  test('switching a tool on or off does not alter the knowledge signature', () => {
    const base = { notes: [note()], plans: [] };
    expect(buildKnowledgeSignature({ ...base, rendering: true })).toBe(buildKnowledgeSignature(base));
    expect(buildKnowledgeSignature({ ...base, workflows: true })).toBe(buildKnowledgeSignature(base));
    expect(buildKnowledgeSignature({ ...base, linking: true })).toBe(buildKnowledgeSignature(base));
  });

});
