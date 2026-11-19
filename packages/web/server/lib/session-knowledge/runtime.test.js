import { describe, expect, test } from 'bun:test';

import { buildKnowledgeSignature, buildKnowledgeText, createSessionKnowledgeRuntime } from './runtime.js';

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

  test('nothing pinned creates no delivery', async () => {
    const runtime = createRuntime({
      projectContextRuntime: { readContext: async () => ({ notes: [], todos: [], plans: [] }) },
    });

    const { text, signature } = await runtime.resolvePending(DIRECTORY, '');

    expect(text).toBe('');
    expect(signature).toBe('');
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

  test('pins into OhPiChamber\'s own store and invalidates the delivered signature', async () => {
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
