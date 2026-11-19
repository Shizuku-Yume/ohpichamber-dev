import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { applyForkedSession, noteForkedSessionPatched, type ForkedSessionDeps } from './forked-session';
import { deferred } from './session-message-loader-test-fixtures';

const fork: Session = {
  sessionId: 'ses_fork', projectId: 'proj_1', workspaceId: 'ws_1', displayPath: 'repo',
  rootSessionId: 'ses_fork', createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0',
  runtimeStatus: 'idle', activeRunId: null, mode: { kind: 'main' }, metadata: null, metadataRevision: '0', archiveRevision: '0',
};

const deps = (overrides: Partial<ForkedSessionDeps> = {}) => {
  const applied: Session[] = [];
  const reads: string[] = [];
  const value: ForkedSessionDeps = {
    isKnown: () => false,
    isCreatingLocally: () => false,
    getSession: async (sessionId) => { reads.push(sessionId); return fork; },
    isCurrent: () => true,
    apply: (session) => applied.push(session),
    ...overrides,
  };
  return { value, applied, reads };
};

const event = { sessionId: 'ses_fork', parentSessionId: 'ses_parent' };

<<<<<<< HEAD
describe('applyForkedSession', () => {
  test('reads an unknown native fork and applies it', async () => {
    const value = deps();
    await applyForkedSession(event, value.value);
    expect(value.reads).toEqual(['ses_fork']);
    expect(value.applied).toEqual([fork]);
  });
  test('skips a known or locally-created fork', async () => {
    const known = deps({ isKnown: () => true });
    await applyForkedSession(event, known.value);
    expect(known.reads).toEqual([]);
    expect(known.applied).toEqual([]);
    const local = deps({ isCreatingLocally: (parentSessionId) => parentSessionId === 'ses_parent' });
    await applyForkedSession(event, local.value);
    expect(local.reads).toEqual([]);
    expect(local.applied).toEqual([]);
  });
  test('applies nothing when read fails or runtime is stale', async () => {
    const failed = deps({ getSession: async () => { throw new Error('offline'); } });
    await applyForkedSession(event, failed.value);
    expect(failed.applied).toEqual([]);
    const stale = deps({ isCurrent: () => false });
    await applyForkedSession(event, stale.value);
    expect(stale.applied).toEqual([]);
  });
  test('rereads when patched during the first read', async () => {
    const marked: Session = { ...fork, updatedAt: 2 };
    let reads = 0;
    const value = deps({ getSession: async () => {
      reads += 1;
      if (reads === 1) { noteForkedSessionPatched('ses_fork'); return fork; }
      return marked;
    } });
    await applyForkedSession(event, value.value);
    expect(reads).toBe(2);
    expect(value.applied).toEqual([marked]);
  });
  test('deduplicates concurrent reads and rejects a mismatched identity', async () => {
    const gate = deferred<Session>();
    let reads = 0;
    const value = deps({ getSession: () => { reads += 1; return gate.promise; } });
    const first = applyForkedSession(event, value.value);
    await applyForkedSession(event, value.value);
    gate.resolve(fork);
    await first;
    expect(reads).toBe(1);
    expect(value.applied).toEqual([fork]);
    const mismatched = deps({ getSession: async () => ({ ...fork, sessionId: 'another' }) });
    await applyForkedSession(event, mismatched.value);
    expect(mismatched.applied).toEqual([]);
  });
});
||||||| bc50ba56aa
describe("applyForkedSession", () => {
  test("reads an unknown fork in its directory and applies it", async () => {
    const d = deps()
    await applyForkedSession(event, d.value)
    expect(d.reads).toEqual([["ses_fork", "/repo"]])
    expect(d.applied).toEqual([fork])
  })

  test("skips a fork this client already holds", async () => {
    const d = deps({ isKnown: () => true })
    await applyForkedSession(event, d.value)
    expect(d.reads).toEqual([])
    expect(d.applied).toEqual([])
  })

  test("applies nothing when the read fails", async () => {
    const d = deps({ getSession: async () => { throw new Error("offline") } })
    await applyForkedSession(event, d.value)
    expect(d.applied).toEqual([])
  })

  test("drops the read after a runtime switch", async () => {
    const d = deps({ isCurrent: () => false })
    await applyForkedSession(event, d.value)
    expect(d.applied).toEqual([])
  })

  test("leaves a fork this client is creating through /btw to that flow", async () => {
    const d = deps({ isCreatingLocally: (parentID) => parentID === "ses_parent" })
    await applyForkedSession(event, d.value)
    expect(d.reads).toEqual([])
    expect(d.applied).toEqual([])
  })

  test("reads the fork again when it was patched during the read", async () => {
    const marked: Session = { ...fork, title: "Marked" }
    let reads = 0
    const d = deps({
      getSession: async () => {
        reads += 1
        if (reads === 1) {
          noteForkedSessionPatched("ses_fork")
          return fork
        }
        return marked
      },
    })
    await applyForkedSession(event, d.value)
    expect(reads).toBe(2)
    expect(d.applied).toEqual([marked])
  })
})
=======
describe("applyForkedSession", () => {
  test("reads an unknown fork in its directory and applies it", async () => {
    const d = deps()
    await applyForkedSession(event, d.value)
    expect(d.reads).toEqual([["ses_fork", "/repo"]])
    expect(d.applied).toEqual([fork])
  })

  test("skips a fork this client already holds", async () => {
    const d = deps({ isKnown: () => true })
    await applyForkedSession(event, d.value)
    expect(d.reads).toEqual([])
    expect(d.applied).toEqual([])
  })

  test("drops the read after a runtime switch", async () => {
    const d = deps({ isCurrent: () => false })
    await applyForkedSession(event, d.value)
    expect(d.applied).toEqual([])
  })

  test("leaves a fork this client is creating through /btw to that flow", async () => {
    const d = deps({ isCreatingLocally: (parentID) => parentID === "ses_parent" })
    await applyForkedSession(event, d.value)
    expect(d.reads).toEqual([])
    expect(d.applied).toEqual([])
  })

  test("reads the fork again when it was patched during the read", async () => {
    const marked: Session = { ...fork, title: "Marked" }
    let reads = 0
    const d = deps({
      getSession: async () => {
        reads += 1
        if (reads === 1) {
          noteForkedSessionPatched("ses_fork")
          return fork
        }
        return marked
      },
    })
    await applyForkedSession(event, d.value)
    expect(reads).toBe(2)
    expect(d.applied).toEqual([marked])
  })
})
>>>>>>> upstream/main
