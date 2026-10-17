import { beforeEach, describe, expect, test } from 'bun:test'
import type { Message } from '@openchamber/agent-contract'

import {
  findLatestUserModelChoice,
  shouldPreserveManualModelOverride,
} from '@/lib/messages/userModelChoice'

const textPart = (partId: string, content: string) => ({ type: 'text' as const, partId, content });
const message = (messageId: string, role: Message['role'], createdAt: number, providerId?: string, modelId?: string): Message => ({
  messageId, sessionId: 'ses_2404', turnId: `turn-${messageId}`, role, createdAt,
  parts: [textPart(`part-${messageId}`, messageId)], providerId, modelId,
});

const userMessage = (messageId: string, createdAt: number, content: string): Message => ({
  ...message(messageId, 'user', createdAt),
  parts: [textPart(`part-${messageId}`, content)],
});

/**
 * Regression for openchamber/openchamber#2404:
 * custom agent default model A → manual override to B → delegate subtask →
 * after child completes, synthetic completion nudge must not revert to A.
 */
describe('issue #2404 model override persistence across delegated subtask', () => {
  const sessionId = 'ses_2404'
  const agentName = 'custom-agent'
  const agentDefault = { providerId: 'provider', modelId: 'model-a' };
  const manualOverride = { providerId: 'provider', modelId: 'model-b' };

  let sessionModelSelections: Map<string, { providerId: string; modelId: string }>
  let sessionAgentModelSelections: Map<string, Map<string, { providerId: string; modelId: string }>>
  let selectionSource: 'auto' | 'manual'
  let currentProviderId: string
  let currentModelId: string

  beforeEach(() => {
    sessionModelSelections = new Map()
    sessionAgentModelSelections = new Map()
    selectionSource = 'auto'
    currentProviderId = agentDefault.providerId;
    currentModelId = agentDefault.modelId;
  })

  const createSessionWithAgentDefault = () => {
    // Session starts on the custom agent's pinned model A.
    currentProviderId = agentDefault.providerId;
    currentModelId = agentDefault.modelId;
    selectionSource = 'auto'
    sessionModelSelections.set(sessionId, {
      providerId: agentDefault.providerId,
      modelId: agentDefault.modelId,
    })
    sessionAgentModelSelections.set(sessionId, new Map([
      [agentName, { providerId: agentDefault.providerId, modelId: agentDefault.modelId }],
    ]))
  }

  const setManualModelOverride = () => {
    selectionSource = 'manual'
    currentProviderId = manualOverride.providerId;
    currentModelId = manualOverride.modelId;
    sessionModelSelections.set(sessionId, {
      providerId: manualOverride.providerId,
      modelId: manualOverride.modelId,
    });
    const agentMap = sessionAgentModelSelections.get(sessionId) ?? new Map()
    agentMap.set(agentName, {
      providerId: manualOverride.providerId,
      modelId: manualOverride.modelId,
    })
    sessionAgentModelSelections.set(sessionId, agentMap)
  }

  const completeDelegatedSubtask = () => {
    const messages: Message[] = [
      userMessage('u-real', 1, 'Delegate a subtask'),
      message('a1', 'assistant', 2, manualOverride.providerId, manualOverride.modelId),
      message('u-nudge', 'system', 3),
    ];
    const latestChoice = findLatestUserModelChoice(messages);
    const saved = sessionModelSelections.get(sessionId) ?? null;

    expect(latestChoice?.modelId).toBe(manualOverride.modelId);
    expect(shouldPreserveManualModelOverride({
      selectionSource,
      savedSessionModel: saved,
      candidate: { providerId: agentDefault.providerId, modelId: agentDefault.modelId },
    })).toBe(true);

    const agentOverride = sessionAgentModelSelections.get(sessionId)?.get(agentName);
    if (agentOverride) {
      currentProviderId = agentOverride.providerId;
      currentModelId = agentOverride.modelId;
    } else {
      currentProviderId = agentDefault.providerId;
      currentModelId = agentDefault.modelId;
    }
  };


  test('manual override survives delegated subtask completion', () => {
    createSessionWithAgentDefault()
    setManualModelOverride()
    completeDelegatedSubtask()

    expect(selectionSource).toBe('manual')
    expect(currentProviderId).toBe(manualOverride.providerId);
    expect(currentModelId).toBe(manualOverride.modelId);
    expect(sessionModelSelections.get(sessionId)).toEqual({
      providerId: manualOverride.providerId,
      modelId: manualOverride.modelId,
    })
  })

  test('agent default is used when no manual override was set', () => {
    createSessionWithAgentDefault();
    const messages: Message[] = [
      userMessage('u-real', 1, 'Delegate a subtask'),
      message('a1', 'assistant', 2, agentDefault.providerId, agentDefault.modelId),
      message('u-nudge', 'system', 3),
    ];
    const latestChoice = findLatestUserModelChoice(messages);
    expect(latestChoice?.modelId).toBe(agentDefault.modelId);
    expect(shouldPreserveManualModelOverride({
      selectionSource: 'auto',
      savedSessionModel: sessionModelSelections.get(sessionId),
      candidate: latestChoice,
    })).toBe(false);
    expect(currentModelId).toBe(agentDefault.modelId);
  });
})
