<<<<<<< HEAD
import { describe, expect, test } from "bun:test"
import type { Message, Part } from "@openchamber/agent-contract"
import { buildSessionMessageRecordsSnapshot } from "./sync-context"
import { INITIAL_STATE, type State } from "./types"

const message = (messageId: string, role: Message["role"], createdAt = 1, parts: Part[] = []): Message => ({ messageId, sessionId: "session-1", turnId: "turn-1", role, createdAt, parts })
const state = (messages: Message[]): State => ({ ...INITIAL_STATE, message: { "session-1": messages } })
=======
import { describe, expect, test } from 'bun:test';
import { createStore } from 'zustand/vanilla';
import type { Message, Part, Session } from '@/lib/opencode/model';

import type { DirectoryStore } from './child-store';
import { buildSessionMessageRecordsSnapshot, readSessionMessageRecordsSnapshot } from './sync-context';
import { INITIAL_STATE, type State } from './types';
>>>>>>> bc50ba56a

describe("native session message records", () => {
  test("indexes canonical messages by message identity", () => {
    const first = message("message-1", "user")
    const second = message("message-2", "assistant", 2, [{ type: "text", partId: "part-2", content: "reply" }])
    const snapshot = buildSessionMessageRecordsSnapshot(state([first, second]), "session-1")
    expect(snapshot.list).toEqual([first, second])
    expect(snapshot.byId.get("message-2")).toBe(second)
  })

  test("retains the complete native part array and rebuilds only when the message list changes", () => {
    const part: Part = { type: "tool_call", partId: "part-1", toolCallId: "call-1", toolName: "search", input: {}, status: "running" }
    const item = message("message-1", "assistant", 1, [part])
    const messages = [item]
    const current = buildSessionMessageRecordsSnapshot(state(messages), "session-1")
    const same = buildSessionMessageRecordsSnapshot({ ...state(messages), status: "complete" }, "session-1", current)
    expect(same).toBe(current)
    expect(same.byId.get("message-1")?.parts).toEqual([part])
    const replacement = message("message-1", "assistant", 1, [part, { type: "text", partId: "part-2", content: "done" }])
    const next = buildSessionMessageRecordsSnapshot(state([replacement]), "session-1", current)
    expect(next).not.toBe(current)
    expect(next.byId.get("message-1")).toBe(replacement)
  })

  test("uses stable empty records for an unloaded native session", () => {
    const first = buildSessionMessageRecordsSnapshot(state([]), "session-unknown")
    const second = buildSessionMessageRecordsSnapshot(state([]), "session-unknown", first)
    expect(first.list).toEqual([])
    expect(first.byId.size).toBe(0)
    expect(second).toBe(first)
  })

<<<<<<< HEAD
  test("does not reuse another session's snapshot when both share an empty list", () => {
    const empty: Message[] = []
    const currentState: State = { ...INITIAL_STATE, message: { "session-1": empty, "session-2": empty } }
    const first = buildSessionMessageRecordsSnapshot(currentState, "session-1")
    const second = buildSessionMessageRecordsSnapshot(currentState, "session-2", first)
    expect(second).not.toBe(first)
    expect(second.sessionId).toBe("session-2")
    expect(second.list).toBe(empty)
  })
})
=======
const session = (overrides: Partial<Session> = {}): Session => ({
  id: 'ses_1',
  projectID: 'proj_1',
  directory: '/repo',
  title: 'Session',
  cost: 0,
  tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
  time: { created: 1, updated: 1 },
  ...overrides,
});

const state = (partial: Partial<State>): State => ({
  ...INITIAL_STATE,
  ...partial,
});

describe('buildSessionMessageRecordsSnapshot', () => {
  test('renders and reverts a rollover-spanning transcript by array chronology', () => {
    const before = message('msg_ffffffffffffBefore', 'user', undefined, 100);
    const marker = message('msg_000000000000Marker', 'user', undefined, 200);
    const after = message('msg_000000000001After', 'assistant', marker.id, 300);

    const snapshot = buildSessionMessageRecordsSnapshot(
      state({
        session: [session({ revert: { messageID: marker.id } })],
        message: { ses_1: [before, marker, after] },
      }),
      'ses_1',
    );

    expect(snapshot.list.map((record) => record.info.id)).toEqual([before.id]);
  });

  test('only suspends part updates for the active streaming message', () => {
    const user = message('user_1', 'user');
    const assistant1 = message('assistant_1', 'assistant', 'user_1');
    const assistant2 = message('assistant_2', 'assistant', 'user_1');
    const messages = [user, assistant1, assistant2];
    const assistant1InitialParts = [textPart('assistant_1_initial', 'initial')];
    const assistant2InitialParts = [textPart('assistant_2_initial', 'initial')];

    const previous = buildSessionMessageRecordsSnapshot(
      state({
        message: { ses_1: messages },
        part: {
          assistant_1: assistant1InitialParts,
          assistant_2: assistant2InitialParts,
        },
      }),
      'ses_1',
      undefined,
      true,
      'assistant_1',
    );

    const assistant1FinalParts = [textPart('assistant_1_final', 'final')];
    const assistant2LiveParts = [textPart('assistant_2_live', 'live')];
    const next = buildSessionMessageRecordsSnapshot(
      state({
        message: { ses_1: messages },
        part: {
          assistant_1: assistant1FinalParts,
          assistant_2: assistant2LiveParts,
        },
      }),
      'ses_1',
      previous,
      true,
      'assistant_2',
    );

    expect(next.byId.get('assistant_1')?.parts).toBe(assistant1FinalParts);
    expect(next.byId.get('assistant_2')?.parts).toBe(assistant2InitialParts);
  });

  test('publishes task session identity while other streaming part updates are suspended', () => {
    const assistant = message('assistant_1', 'assistant');
    const initialParts = [taskPart('task_1')];
    const previous = buildSessionMessageRecordsSnapshot(
      state({ message: { ses_1: [assistant] }, part: { assistant_1: initialParts } }),
      'ses_1',
      undefined,
      true,
      assistant.id,
    );
    const identifiedParts = [taskPart('task_1', 'child_1')];

    const next = buildSessionMessageRecordsSnapshot(
      state({ message: { ses_1: [assistant] }, part: { assistant_1: identifiedParts } }),
      'ses_1',
      previous,
      true,
      assistant.id,
    );

    expect(next.byId.get(assistant.id)?.parts).toBe(identifiedParts);
  });
});

describe('readSessionMessageRecordsSnapshot', () => {
  test('suspends a message again from its latest parts, not from a snapshot cached before the wait', () => {
    const assistant = message('assistant_1', 'assistant');
    const messages = [assistant];
    const store = createStore<DirectoryStore>(() => ({
      ...state({ message: { ses_1: messages }, part: { assistant_1: [textPart('before', 'before the page')] } }),
      patch: () => undefined,
      replace: () => undefined,
    }));
    const empty = buildSessionMessageRecordsSnapshot(state({}), 'ses_1');

    const streaming = readSessionMessageRecordsSnapshot(store, 'ses_1', empty, true, assistant.id);
    const pageParts = [textPart('before', 'before the page'), textPart('page', 'the page')];
    store.setState({ part: { assistant_1: pageParts } });

    const waiting = readSessionMessageRecordsSnapshot(store, 'ses_1', streaming, false);
    expect(waiting.byId.get(assistant.id)?.parts).toBe(pageParts);

    const answered = readSessionMessageRecordsSnapshot(store, 'ses_1', waiting, true, assistant.id);
    expect(answered.byId.get(assistant.id)?.parts).toBe(pageParts);
  });
});
>>>>>>> bc50ba56a
