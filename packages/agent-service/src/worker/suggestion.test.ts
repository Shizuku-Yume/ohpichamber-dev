import { describe, expect, test } from 'bun:test';
import type { AgentMessage } from '@oh-my-pi/pi-agent-core';
import type { AssistantMessage, Model } from '@oh-my-pi/pi-ai';
import type { AgentSession, EphemeralTurnOptions, EphemeralTurnResult } from '@oh-my-pi/pi-coding-agent/session/agent-session';
import type { ProjectionInput } from '../projection/protocol.ts';
import {
  SuggestionDriver,
  predictionAnchor,
  USAGE_PURPOSE,
  type SuggestionGenerator,
} from './suggestion.ts';

const sessionModel = {
  provider: 'provider-session',
  id: 'model-session',
  api: 'openai-completions',
  contextWindow: 128_000,
  maxTokens: 4096,
} as unknown as Model;

const smallModel = {
  provider: 'provider-small',
  id: 'model-small',
  api: 'openai-completions',
  contextWindow: 32_000,
  maxTokens: 2048,
} as unknown as Model;

const mockUsage: AssistantMessage['usage'] = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function createFixture(initialGenerator: SuggestionGenerator = 'session') {
  const emittedEvents: ProjectionInput[] = [];
  const recordedUsage: Array<{ usage: unknown; target: unknown }> = [];
  const ephemeralCalls: EphemeralTurnOptions[] = [];
  const smallModelCalls: Array<{ promptText: string; signal: AbortSignal }> = [];
  let ephemeralReply = '"Next step suggestion"';
  let currentGenerator: SuggestionGenerator = initialGenerator;
  let draft = false;
  let aborted = false;

  const assistantMsg: AssistantMessage = {
    role: 'assistant',
    content: [{ type: 'text', text: 'Turn completed.' }],
    stopReason: 'stop',
    api: 'openai-completions',
    provider: 'provider-session',
    model: 'model-session',
    timestamp: Date.now(),
    usage: mockUsage,
  };

  const messages: AgentMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'Hello' }], timestamp: 1 },
    assistantMsg,
  ];

  const session = {
    model: sessionModel,
    messages,
    systemPrompt: 'You are an agent.',
    isStreaming: false,
    isCompacting: false,
    settings: {} as unknown as AgentSession['settings'],
    sessionManager: {
      getSessionId: () => 'ses-1',
      getLeafId: () => 'leaf-1',
      appendModelUsage: (usage: unknown, target: unknown) => {
        recordedUsage.push({ usage, target });
      },
    },
    resolveRoleModelWithThinking: (role: string) => {
      if (role === 'smol' || role === 'tiny') return { model: smallModel, thinkingLevel: undefined };
      return { model: undefined, thinkingLevel: undefined };
    },
    convertMessagesToLlm: async () => [],
    ephemeralMaxTokensPreservesRequest: () => true,
    runEphemeralTurn: async (options: EphemeralTurnOptions): Promise<EphemeralTurnResult> => {
      ephemeralCalls.push(options);
      return {
        replyText: ephemeralReply,
        assistantMessage: {
          role: 'assistant',
          content: [{ type: 'text', text: ephemeralReply }],
          stopReason: 'stop',
          api: 'openai-completions',
          provider: 'provider-session',
          model: 'model-session',
          timestamp: Date.now(),
          usage: mockUsage,
        },
      };
    },
  } as unknown as AgentSession;

  const driver = new SuggestionDriver({
    session,
    emit: (events) => emittedEvents.push(...events),
    getGenerator: () => currentGenerator,
    hasDraft: () => draft,
    isAborted: () => aborted,
    callSmallModel: async (options) => {
      smallModelCalls.push(options);
      return {
        replyText: 'Next small suggestion',
        assistantMessage: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Next small suggestion' }],
          stopReason: 'stop',
          api: 'openai-completions',
          provider: 'provider-small',
          model: 'model-small',
          timestamp: Date.now(),
          usage: mockUsage,
        },
      };
    },
  });

  return {
    driver,
    session,
    emittedEvents,
    recordedUsage,
    ephemeralCalls,
    smallModelCalls,
    setGenerator: (gen: SuggestionGenerator) => {
      currentGenerator = gen;
    },
    setDraft: (value: boolean) => {
      draft = value;
    },
    setAborted: (value: boolean) => {
      aborted = value;
    },
    setEphemeralReply: (value: string) => {
      ephemeralReply = value;
    },
    completedEvent: {
      type: 'agent_end' as const,
      messages,
    },
  };
}

describe('Worker SuggestionDriver', () => {
  test('session generator drives runEphemeralTurn on session model at completed agent_end', async () => {
    const fixture = createFixture('session');
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(1);
    expect(fixture.smallModelCalls).toHaveLength(0);
    expect(fixture.recordedUsage).toHaveLength(1);
    expect(fixture.recordedUsage[0]?.usage).toMatchObject({
      purpose: USAGE_PURPOSE,
      provider: 'provider-session',
      model: 'model-session',
    });
    expect(fixture.emittedEvents).toHaveLength(1);
    expect(fixture.emittedEvents[0]?.transient).toBe(true);
    expect(fixture.emittedEvents[0]?.event).toMatchObject({
      type: 'session.suggestion',
      suggestion: 'Next step suggestion',
    });
  });

  test('session generator asks for alternatives and publishes the first line', async () => {
    const fixture = createFixture('session');
    // A plural reply, exactly as the model answers the alternatives prompt.
    fixture.setEphemeralReply('Now list them in French.\nAdd a unit test for that.\nThanks, continue.');
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    // The plural prompt is the one the model will actually answer; a
    // single-message request is declined far more often (see PREDICTION_CHOICES).
    const promptText = fixture.ephemeralCalls[0]?.promptText ?? '';
    expect(promptText).toContain('up to');
    expect(promptText).toContain('different messages');
    expect(fixture.emittedEvents[0]?.event).toMatchObject({
      type: 'session.suggestion',
      suggestion: 'Now list them in French.',
    });
  });

  test('a plural reply that still skips publishes nothing', async () => {
    const fixture = createFixture('session');
    fixture.setEphemeralReply('NO_PREDICTION');
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.emittedEvents).toHaveLength(0);
  });

  test('small generator drives small-model call at completed agent_end', async () => {
    const fixture = createFixture('small');
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(0);
    expect(fixture.smallModelCalls).toHaveLength(1);
    expect(fixture.recordedUsage).toHaveLength(1);
    expect(fixture.recordedUsage[0]?.usage).toMatchObject({
      purpose: USAGE_PURPOSE,
      provider: 'provider-small',
      model: 'model-small',
    });
    expect(fixture.emittedEvents).toHaveLength(1);
    expect(fixture.emittedEvents[0]?.transient).toBe(true);
    expect(fixture.emittedEvents[0]?.event).toMatchObject({
      type: 'session.suggestion',
      suggestion: 'Next small suggestion',
    });
  });

  test('off generator makes no calls and emits no suggestion', async () => {
    const fixture = createFixture('off');
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(0);
    expect(fixture.smallModelCalls).toHaveLength(0);
    expect(fixture.emittedEvents).toHaveLength(0);
    expect(fixture.recordedUsage).toHaveLength(0);
  });

  test('skip rule: aborted runs make no call', async () => {
    const fixture = createFixture('session');
    fixture.setAborted(true);
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(0);
    expect(fixture.smallModelCalls).toHaveLength(0);

    // Also test event message with stopReason aborted
    fixture.setAborted(false);
    const abortedEvent = {
      type: 'agent_end' as const,
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hi' }], timestamp: 1 } as AgentMessage,
        { role: 'assistant', content: [], stopReason: 'aborted', timestamp: 2 } as unknown as AgentMessage,
      ],
    };
    await fixture.driver.handleAgentEnd(abortedEvent);
    expect(fixture.ephemeralCalls).toHaveLength(0);
  });

  test('skip rule: drafts present make no call', async () => {
    const fixture = createFixture('session');
    fixture.setDraft(true);
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(0);
    expect(fixture.smallModelCalls).toHaveLength(0);
  });

  test('skip rule: streaming session makes no call', async () => {
    const fixture = createFixture('session');
    (fixture.session as { isStreaming: boolean }).isStreaming = true;
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(0);
    expect(fixture.smallModelCalls).toHaveLength(0);
  });

  test('skip rule: compacting session makes no call', async () => {
    const fixture = createFixture('session');
    (fixture.session as { isCompacting: boolean }).isCompacting = true;
    await fixture.driver.handleAgentEnd(fixture.completedEvent);

    expect(fixture.ephemeralCalls).toHaveLength(0);
    expect(fixture.smallModelCalls).toHaveLength(0);
  });

  test('skip rule: a new active run prevents suggestions from an earlier agent_end', async () => {
    const fixture = createFixture('session');
    (fixture.session as { isRunActive: boolean }).isRunActive = true;
    await fixture.driver.handleAgentEnd(fixture.completedEvent);
    expect(fixture.ephemeralCalls).toHaveLength(0);
  });

  test('predictionAnchor ignores advisor cards at transcript tail', () => {
    const userMsg: AgentMessage = { role: 'user', content: [{ type: 'text', text: 'Work' }], timestamp: 1 };
    const advisorMsg: AgentMessage = {
      role: 'custom',
      customType: 'advisor',
      content: [{ type: 'text', text: 'Note' }],
      timestamp: 2,
    } as unknown as AgentMessage;

    expect(predictionAnchor({ messages: [userMsg, advisorMsg] })).toBe(userMsg);
  });
});
