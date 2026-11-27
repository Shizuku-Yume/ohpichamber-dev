import { describe, expect, test } from 'bun:test'
import type { Message, Part, Run, Turn } from '@openchamber/agent-contract'

import {
  extractAssistantModelChoice,
  findLatestUserModelChoice,
  isSessionRunActive,
  resolveActiveRunModelSelection,
  shouldPreserveManualModelOverride,
} from './userModelChoice'

const userMessage = (messageId: string): Message => ({
  messageId,
  sessionId: 'ses_1',
  turnId: `turn-${messageId}`,
  role: 'user',
  createdAt: 1,
  parts: [],
})

const assistantMessage = (messageId: string, modelId: string, providerId = 'provider', parts: Part[] = [{ type: 'text', partId: `part-${messageId}`, content: 'reply' }]): Message => ({
  messageId,
  sessionId: 'ses_1',
  turnId: `turn-${messageId}`,
  role: 'assistant',
  createdAt: 2,
  parts,
  providerId,
  modelId,
})

describe('findLatestUserModelChoice', () => {
  test('returns the model the latest answered turn ran on', () => {
    const choice = findLatestUserModelChoice([
      userMessage('u1'),
      assistantMessage('a1', 'model-a'),
      userMessage('u2'),
      assistantMessage('a2', 'model-b'),
    ])
    expect(choice?.id).toBe('a2')
    expect(choice?.modelId).toBe('model-b')
    expect(choice?.providerId).toBe('provider')
  })

  test('skips messages whose parts have not loaded yet', () => {
    const choice = findLatestUserModelChoice([
      assistantMessage('a1', 'model-a'),
      assistantMessage('a2', 'model-b', 'provider', []),
    ])
    expect(choice?.id).toBe('a1')
    expect(choice?.modelId).toBe('model-a')
  })

  test('returns null when the session has no answered turn', () => {
    expect(findLatestUserModelChoice([userMessage('u1')])).toBeNull()
  })
})

describe('shouldPreserveManualModelOverride', () => {
  test('preserves manual override when it differs from the candidate message model', () => {
    expect(shouldPreserveManualModelOverride({ selectionSource: 'manual', savedSessionModel: { providerId: 'provider', modelId: 'model-b' }, candidate: { providerId: 'provider', modelId: 'model-a' } })).toBe(true)
  })
  test('does not preserve when selection matches the candidate', () => {
    expect(shouldPreserveManualModelOverride({ selectionSource: 'manual', savedSessionModel: { providerId: 'provider', modelId: 'model-b' }, candidate: { providerId: 'provider', modelId: 'model-b' } })).toBe(false)
  })
  test('does not preserve auto selections', () => {
    expect(shouldPreserveManualModelOverride({ selectionSource: 'auto', savedSessionModel: { providerId: 'provider', modelId: 'model-b' }, candidate: { providerId: 'provider', modelId: 'model-a' } })).toBe(false)
  })
  test('preserves manual override when candidate has no model', () => {
    expect(shouldPreserveManualModelOverride({ selectionSource: 'manual', savedSessionModel: { providerId: 'provider', modelId: 'model-b' }, candidate: { providerId: undefined, modelId: undefined } })).toBe(true)
  })
})

describe('extractAssistantModelChoice', () => {
  test('reads model identity off the assistant message', () => {
    expect(extractAssistantModelChoice(assistantMessage('a1', 'model-b'))).toMatchObject({ id: 'a1', providerId: 'provider', modelId: 'model-b' })
  })
  test('ignores non-assistant messages', () => {
    expect(extractAssistantModelChoice(userMessage('u1'))).toBeNull()
  })
})

const runningTurn = (turnId: string, runId: string, assistantMessageIds: string[] = []): Turn => ({
  turnId,
  sessionId: 'ses_1',
  runId,
  status: 'running',
  userMessageId: `u-${turnId}`,
  assistantMessageIds,
  startedAt: 1,
})

const activeRun = (runId: string): Run => ({
  runId,
  sessionId: 'ses_1',
  status: 'running',
  origin: 'host',
  createdAt: 1,
})

describe('isSessionRunActive', () => {
  test('detects active runs from run state or runtime status', () => {
    expect(isSessionRunActive({ activeRun: activeRun('r1') })).toBe(true)
    expect(isSessionRunActive({ status: 'running' })).toBe(true)
    expect(isSessionRunActive({ sessionRuntimeStatus: 'awaiting_approval' })).toBe(true)
    expect(isSessionRunActive({ status: 'idle', activeRun: null })).toBe(false)
  })
})

describe('resolveActiveRunModelSelection', () => {
  test('returns null outside an active run', () => {
    expect(resolveActiveRunModelSelection({
      isRunActive: false,
      sessionSavedModel: { providerId: 'cliproxy', modelId: 'devin-swe-2' },
      snapshotSelectionModel: { providerId: 'cliproxy', modelId: 'devin-swe-2' },
    })).toBeNull()
  })

  test('uses active turn assistant message even before parts arrive, and ignores prior turn replies', () => {
    expect(resolveActiveRunModelSelection({
      isRunActive: true,
      activeRun: activeRun('r2'),
      turns: [
        { ...runningTurn('t1', 'r1', ['a1']), status: 'completed', finishedAt: 2 },
        runningTurn('t2', 'r2', []),
      ],
      messages: [assistantMessage('a1', 'gemini-3.5-flash-lite', 'cliproxy')],
      sessionSavedModel: { providerId: 'cliproxy', modelId: 'devin-swe-2' },
    })).toEqual({ providerId: 'cliproxy', modelId: 'devin-swe-2' })

    expect(resolveActiveRunModelSelection({
      isRunActive: true,
      activeRun: activeRun('r2'),
      turns: [runningTurn('t2', 'r2', ['a2'])],
      messages: [assistantMessage('a2', 'devin-swe-2', 'cliproxy', [])],
      snapshotSelectionModel: { providerId: 'cliproxy', modelId: 'gemini-3.5-flash-lite' },
    })).toEqual({ providerId: 'cliproxy', modelId: 'devin-swe-2' })
  })

  test('ignores prior completed turn assistant messages when activeRun has no turn yet', () => {
    expect(resolveActiveRunModelSelection({
      isRunActive: true,
      activeRun: activeRun('r2'),
      turns: [
        { ...runningTurn('t1', 'r1', ['a1']), status: 'completed', finishedAt: 2 },
      ],
      messages: [assistantMessage('a1', 'gemini-3.5-flash-lite', 'cliproxy')],
      sessionSavedModel: { providerId: 'cliproxy', modelId: 'devin-swe-2' },
      snapshotSelectionModel: { providerId: 'cliproxy', modelId: 'gpt-5' },
    })).toEqual({ providerId: 'cliproxy', modelId: 'devin-swe-2' })

    expect(resolveActiveRunModelSelection({
      isRunActive: true,
      activeRun: activeRun('r2'),
      turns: [
        { ...runningTurn('t1', 'r1', ['a1']), status: 'completed', finishedAt: 2 },
      ],
      messages: [assistantMessage('a1', 'gemini-3.5-flash-lite', 'cliproxy')],
      snapshotSelectionModel: { providerId: 'cliproxy', modelId: 'devin-swe-2' },
    })).toEqual({ providerId: 'cliproxy', modelId: 'devin-swe-2' })

    expect(resolveActiveRunModelSelection({
      isRunActive: true,
      activeRun: null,
      turns: [
        { ...runningTurn('t1', 'r1', ['a1']), status: 'completed', finishedAt: 2 },
      ],
      messages: [assistantMessage('a1', 'gemini-3.5-flash-lite', 'cliproxy')],
      sessionSavedModel: { providerId: 'cliproxy', modelId: 'devin-swe-2' },
    })).toEqual({ providerId: 'cliproxy', modelId: 'devin-swe-2' })
  })

  test('preserves openchamber/auto while routing is ready', () => {
    expect(resolveActiveRunModelSelection({
      isRunActive: true,
      activeRun: activeRun('r1'),
      turns: [runningTurn('t1', 'r1', ['a1'])],
      messages: [assistantMessage('a1', 'devin-swe-2', 'cliproxy')],
      sessionSavedModel: { providerId: 'openchamber', modelId: 'auto' },
      autoReady: true,
      isStaleAuto: false,
    })).toEqual({ providerId: 'openchamber', modelId: 'auto' })
  })
})
