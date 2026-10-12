import { describe, expect, it, vi } from 'vitest';
import { applyForkInheritance, sourceOwnedLinksPatch } from './fork-inheritance.js';

const goal = (objectiveFile) => ({ id: 'goal_1', objective: objectiveFile ? '' : 'Ship it', objectiveFile, status: 'paused' });

const harness = (metadata, overrides = {}) => {
  const deps = {
    readObjective: vi.fn(async () => 'Objective from file'),
    writeObjective: vi.fn(async () => undefined),
    writeMetadata: vi.fn(async () => undefined),
    ...overrides,
  };
  const run = () => applyForkInheritance({
    sourceSessionID: 'ses_source',
    fork: { id: 'ses_fork', execution: { metadata: { ignored: true } } },
    metadata,
    ...deps,
  });
  return { deps, run };
};

describe('sourceOwnedLinksPatch', () => {
  it('pauses an active goal so the fork does not pursue it in parallel', () => {
    expect(sourceOwnedLinksPatch({ openchamber: { goal: { id: 'g', status: 'active' } } }))
      .toEqual({ goal: { status: 'paused', statusReason: 'paused in fork' } });
    expect(sourceOwnedLinksPatch({ openchamber: { goal: { id: 'g', status: 'complete' } } })).toBeNull();
  });

  it('removes source links and pauses an active goal while preserving other Host fields', () => {
    expect(sourceOwnedLinksPatch({ openchamber: { goal: { id: 'g', status: 'active' }, btwSessionID: 'b', reviewSessionID: 'r', custom: 'keep' } }))
      .toEqual({ btwSessionID: null, reviewSessionID: null, goal: { status: 'paused', statusReason: 'paused in fork' } });
  });

  it('removes the btw marker of a btw source, keeps a review marker', () => {
    expect(sourceOwnedLinksPatch({ openchamber: { kind: 'btw', originalSessionID: 'p', btwBoundaryMessageID: 'm' } }))
      .toEqual({ kind: null, originalSessionID: null, btwBoundaryMessageID: null });
    expect(sourceOwnedLinksPatch({ openchamber: { kind: 'review', originalSessionID: 'p' } })).toBeNull();
    expect(sourceOwnedLinksPatch(undefined)).toBeNull();
  });
});

describe('applyForkInheritance', () => {
  it('copies an inline Host goal without reading an objective file', async () => {
    const h = harness({ openchamber: { goal: goal(false) } });
    await h.run();
    expect(h.deps.readObjective).not.toHaveBeenCalled();
    expect(h.deps.writeMetadata).toHaveBeenCalledWith('ses_fork', { openchamber: { goal: goal(false) } });
  });

  it('copies complete explicit Host metadata and strips source links', async () => {
    const metadata = { directory: '/tmp/project', openchamber: { goal: goal(true), btwSessionID: 'b', custom: 'kept' }, unrelated: { value: 1 } };
    const h = harness(metadata);
    await h.run();
    expect(h.deps.readObjective).toHaveBeenCalledWith('ses_source');
    expect(h.deps.writeObjective).toHaveBeenCalledWith('ses_fork', 'Objective from file');
    expect(h.deps.writeMetadata).toHaveBeenCalledWith('ses_fork', {
      directory: '/tmp/project',
      openchamber: { goal: goal(true), custom: 'kept' },
      unrelated: { value: 1 },
    });
  });

  it('inlines the objective when the file copy fails', async () => {
    const h = harness({ openchamber: { goal: goal(true) } }, {
      writeObjective: vi.fn(async () => { throw new Error('disk full'); }),
    });
    await h.run();
    expect(h.deps.writeMetadata).toHaveBeenCalledWith('ses_fork', {
      openchamber: { goal: { ...goal(true), objective: 'Objective from file', objectiveFile: false } },
    });
  });

  it('propagates metadata write failures', async () => {
    const h = harness({ openchamber: { reviewSessionID: 'r' } }, {
      writeMetadata: vi.fn(async () => { throw new Error('offline'); }),
    });
    await expect(h.run()).rejects.toThrow('offline');
  });
});
