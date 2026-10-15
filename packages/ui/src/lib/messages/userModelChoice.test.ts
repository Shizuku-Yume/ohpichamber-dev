import { describe, expect, test } from 'bun:test'
import type { Message, Part } from '@openchamber/agent-contract'

import {
  extractAssistantModelChoice,
  findLatestUserModelChoice,
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
