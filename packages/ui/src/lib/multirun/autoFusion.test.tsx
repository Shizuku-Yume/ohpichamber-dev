import React, { act } from 'react';
import { expect, mock, test } from 'bun:test';
import { Window } from 'happy-dom';
import type { Session } from '@openchamber/agent-contract';
import { applyGlobalSessionStatusEvents, replaceGlobalSessionStatusById, setSessionParentResolver } from '@/sync/global-session-status';
import { buildMultiRunIndex } from './runs';
import { withMultiRunMembership } from './identity';
import { RUN_LAUNCHER_ID } from './launcher';

const sessionById = new Map<string, Session>();
const fusionCalls: Parameters<typeof import('./fusion').startRunFusion>[0][] = [];
const startRunFusion = async (input: Parameters<typeof import('./fusion').startRunFusion>[0]) => { fusionCalls.push(input); };
mock.module('./fusion', () => ({ startRunFusion, NoFusionOutputsError: class extends Error {} }));
mock.module('./useMultiRuns', () => ({
  useMultiRunSessions: () => ({ index: buildMultiRunIndex(sessionById.values(), () => '/repo'), sessionById }),
}));
mock.module('@/stores/useConfigStore', () => ({ useConfigStore: { getState: () => ({ providers: [] }) } }));
mock.module('@/components/ui', () => ({ toast: { error: mock(() => {}) } }));
mock.module('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

const { RunAutoFusion } = await import('./autoFusion');

async function checkAutoFusion(batched: boolean): Promise<void> {
  const laneA = `lane-a-${batched}`;
  const laneB = `lane-b-${batched}`;
  const child = `child-${batched}`;
  const grandchild = `grandchild-${batched}`;
  fusionCalls.length = 0;
  const dom = new Window({ url: 'http://fusion.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.createElement('div'));
  const session = (id: string, parentSessionId?: string): Session => ({
    sessionId: id, parentSessionId, rootSessionId: parentSessionId ?? id,
    projectId: 'project', workspaceId: 'workspace', displayPath: parentSessionId ? '/repo/child' : '/repo',
    createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0',
    runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' },
    title: id, metadata: null, metadataRevision: '0', archiveRevision: '0',
  });
  for (const id of [laneA, laneB]) {
    sessionById.set(id, {
      ...session(id),
      metadata: withMultiRunMembership({}, {
        version: 1, sessionID: id,
        group: { kind: 'id', id: batched ? '9f512893-6e63-4e49-a534-5de733ca103f' : '9f512893-6e63-4e49-a534-5de733ca103e' },
        groupSlug: 'fusion-test', role: 'run', providerID: 'test', modelID: id,
        autoFusion: { providerID: 'test', modelID: 'judge', launcherId: RUN_LAUNCHER_ID },
      }),
      metadataRevision: '1',
    });
  }
  sessionById.set(child, session(child, laneA));
  sessionById.set(grandchild, session(grandchild, child));
  setSessionParentResolver((id) => sessionById.get(id)?.parentSessionId);
  const run = (sessionId: string, index: number) => `run-${batched}-${sessionId}-${index}`;
  const startedRuns = new Map<string, string>();
  let sequence = 0;
  const started = (sessionId: string): Parameters<typeof applyGlobalSessionStatusEvents>[1][number] => {
    sequence += 1;
    const runId = run(sessionId, sequence);
    startedRuns.set(sessionId, runId);
    return { type: 'run.started', sessionId, epoch: 'epoch', sequence, timestamp: 3, runId, createdAt: 3 };
  };
  const completed = (sessionId: string): Parameters<typeof applyGlobalSessionStatusEvents>[1][number] => {
    sequence += 1;
    return { type: 'run.completed', sessionId, epoch: 'epoch', sequence, timestamp: 3, runId: startedRuns.get(sessionId) ?? 'missing', finishedAt: 3 };
  };
  const update = async (...activeIds: string[]) => {
    await act(async () => {
      const events = [
        ...activeIds.map((id) => started(id)),
        ...([...startedRuns.keys()].filter((id) => !activeIds.includes(id))).map((id) => completed(id)),
      ];
      if (events.length > 0) applyGlobalSessionStatusEvents('/repo', events);
      root.render(<RunAutoFusion />);
    });
  };
  try {
    await update('unrelated');
    expect(fusionCalls.length).toBe(0);
    await update(laneA, laneB, child);
    if (batched) {
      // One reducer publication: the parent settles while its child is still
      // busy, so both lanes have to keep waiting for a newer completion.
      await act(async () => {
        applyGlobalSessionStatusEvents('/repo', [completed(laneA), completed(laneB)]);
        root.render(<RunAutoFusion />);
      });
    }
    await update(child);
    expect(fusionCalls.length).toBe(0);
    await update(grandchild);
    expect(fusionCalls.length).toBe(0);
    // The child can settle before the parent receives and processes its result.
    await update();
    expect(fusionCalls.length).toBe(0);
    await update('unrelated');
    expect(fusionCalls.length).toBe(0);
    // A fast parent resumption may publish its busy and idle events together.
    // Its newer completion is authoritative even without a busy render.
    const parent = sessionById.get(laneA);
    if (!parent) throw new Error('Missing parent fixture');
    sessionById.set(parent.sessionId, { ...parent, updatedAt: 4 });
    if (batched) {
      await act(async () => {
        applyGlobalSessionStatusEvents('/repo', [
          { type: 'session.status', sessionId: laneA, epoch: 'epoch', sequence: sequence + 1, timestamp: 5, runtimeStatus: 'running', activeRunId: 'resume-run' },
          { type: 'session.status', sessionId: laneA, epoch: 'epoch', sequence: sequence + 2, timestamp: 6, runtimeStatus: 'idle', activeRunId: null },
        ]);
        sequence += 2;
        root.render(<RunAutoFusion />);
      });
    } else await update('unrelated');
    expect(fusionCalls.length).toBe(1);
    expect(fusionCalls[0]?.sourceIds).toEqual([laneA, laneB]);
    await update();
    expect(fusionCalls.length).toBe(1);
  } finally {
    await act(async () => root.unmount());
    replaceGlobalSessionStatusById(new Map());
    setSessionParentResolver(() => undefined);
    startedRuns.clear();
    sessionById.clear();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
}

for (const batched of [false, true]) {
  test(`automatic fusion waits for a newer parent completion, batched events: ${batched}`, () => checkAutoFusion(batched));
}

test('automatic fusion waits for an active goal to settle between its turns', async () => {
  const lanes = ['goal-lane-a', 'goal-lane-b'];
  fusionCalls.length = 0;
  const dom = new Window({ url: 'http://fusion.test' });
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const [name, value] of Object.entries({
    window: dom, document: dom.document, navigator: dom.navigator,
    IS_REACT_ACT_ENVIRONMENT: true,
  })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.createElement('div'));
  const setLane = (id: string, goalStatus: 'active' | 'complete') => {
    sessionById.set(id, {
      sessionId: id, rootSessionId: id, projectId: 'project', workspaceId: 'workspace', displayPath: '/repo',
      createdAt: 1, updatedAt: 2, epoch: 'epoch', headSequence: '0',
      runtimeStatus: 'idle', activeRunId: null, title: id,
      mode: { kind: 'goal', status: goalStatus, objective: 'ship it', tokenBudget: null, tokensUsed: 0 },
      metadata: withMultiRunMembership({}, {
        version: 1, sessionID: id,
        group: { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca1040' },
        groupSlug: 'goal-fusion-test', role: 'run', providerID: 'test', modelID: id,
        autoFusion: { providerID: 'test', modelID: 'judge', launcherId: RUN_LAUNCHER_ID },
      }),
      metadataRevision: '1', archiveRevision: '0',
    });
  };
  let sequence = 0;
  const startedRuns = new Map<string, string>();
  const started = (sessionId: string): Parameters<typeof applyGlobalSessionStatusEvents>[1][number] => {
    sequence += 1;
    const runId = `goal-run-${sessionId}`;
    startedRuns.set(sessionId, runId);
    return { type: 'run.started', sessionId, epoch: 'epoch', sequence, timestamp: 3, runId, createdAt: 3 };
  };
  const completed = (sessionId: string): Parameters<typeof applyGlobalSessionStatusEvents>[1][number] => {
    sequence += 1;
    return { type: 'run.completed', sessionId, epoch: 'epoch', sequence, timestamp: 3, runId: startedRuns.get(sessionId) ?? 'missing', finishedAt: 3 };
  };
  const settle = async () => {
    await act(async () => {
      applyGlobalSessionStatusEvents('/repo', [...startedRuns.keys()].map(completed));
      root.render(<RunAutoFusion />);
    });
  };
  try {
    setSessionParentResolver((id) => sessionById.get(id)?.parentSessionId);
    for (const id of lanes) setLane(id, 'active');
    await act(async () => {
      applyGlobalSessionStatusEvents('/repo', lanes.map(started));
      root.render(<RunAutoFusion />);
    });
    // Both turns ended and recorded an outcome; the goals go on.
    await settle();
    expect(fusionCalls.length).toBe(0);
    setLane(lanes[0], 'complete');
    await settle();
    expect(fusionCalls.length).toBe(0);
    setLane(lanes[1], 'complete');
    await settle();
    expect(fusionCalls.length).toBe(1);
  } finally {
    await act(async () => root.unmount());
    replaceGlobalSessionStatusById(new Map());
    setSessionParentResolver(() => undefined);
    sessionById.clear();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
    await dom.happyDOM.close();
  }
});
