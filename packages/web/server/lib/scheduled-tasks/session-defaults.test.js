import { describe, expect, it } from 'vitest';

import { resolveSessionDefaults } from './session-defaults.js';

describe('resolveSessionDefaults', () => {
  it('prefers the project default, then the global one, keeping each variant with its model', () => {
    const settings = { defaultModel: 'anthropic/claude-sonnet-5', defaultVariant: 'high', defaultAgent: 'build' };
    expect(resolveSessionDefaults({ settings, project: { defaultModel: 'openai/gpt-6', defaultAgent: 'plan' } }))
      .toEqual({ providerId: 'openai', modelId: 'gpt-6', variant: null, agentId: 'plan', reasoningEffort: null });
    expect(resolveSessionDefaults({ settings, project: {} }))
      .toEqual({ providerId: 'anthropic', modelId: 'claude-sonnet-5', variant: 'high', agentId: 'build', reasoningEffort: null });
  });

});
