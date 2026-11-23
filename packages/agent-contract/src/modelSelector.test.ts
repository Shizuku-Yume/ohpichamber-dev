import { describe, expect, test } from 'bun:test';
import {
  formatModelSelector,
  formatModelSelectorValue,
  parseModelSelector,
  parseModelString,
  parseRoleAlias,
  resolveRoleSelector,
  splitSelectorThinking,
  splitThinkingSuffix,
  splitUpstreamRouting,
  isRoleConfigured,
  thinkingLevelToReasoningEffort,
  type ModelSelector,
} from './modelSelector.ts';

const MAX_OPTIONS = { allowMaxSuffix: true, allowAutoAlias: true };
/** The full grammar, including `@upstream`, for a caller that can check routing. */
const FULL_OPTIONS = { ...MAX_OPTIONS, allowUpstreamRouting: true };

/** A literal-id authority for `:max`: the provider really serves this id. */
const literalMax = (providerId: string | undefined, modelId: string): boolean =>
  providerId === 'z-ai' && modelId === 'glm-4.7:max';

describe('round trip', () => {
  const values: Array<[string, ModelSelector]> = [
    ['provider/model', { providerId: 'provider', modelId: 'model' }],
    ['provider/model:high', { providerId: 'provider', modelId: 'model', thinkingLevel: 'high' }],
    ['provider/model:max', { providerId: 'provider', modelId: 'model', thinkingLevel: 'max' }],
    ['provider/model:auto', { providerId: 'provider', modelId: 'model', thinkingLevel: 'auto' }],
    ['provider/model#variant', { providerId: 'provider', modelId: 'model', variant: 'variant' }],
    ['provider/model:high#variant', { providerId: 'provider', modelId: 'model', thinkingLevel: 'high', variant: 'variant' }],
    ['provider/model@upstream', { providerId: 'provider', modelId: 'model', upstream: 'upstream' }],
    ['provider/model:high#variant@upstream', { providerId: 'provider', modelId: 'model', thinkingLevel: 'high', variant: 'variant', upstream: 'upstream' }],
    ['openrouter/z-ai/glm-4.7', { providerId: 'openrouter', modelId: 'z-ai/glm-4.7' }],
    ['openrouter/z-ai/glm-4.7@cerebras', { providerId: 'openrouter', modelId: 'z-ai/glm-4.7', upstream: 'cerebras' }],
  ];

  for (const [text, selector] of values) {
    test(`parses and formats ${text}`, () => {
      expect(parseModelSelector(text, { ...FULL_OPTIONS, isLiteralModelId: literalMax })).toEqual(selector);
      expect(formatModelSelector(selector)).toBe(text);
    });
  }

  test('every Settings value the role editor can write round-trips', () => {
    for (const text of [
      'provider/model', 'provider/model:minimal', 'provider/model:low', 'provider/model:medium',
      'provider/model:high', 'provider/model:xhigh', 'provider/model:max', 'provider/model:auto',
      'provider/model:high#careful', 'provider/model:max@google-ai-studio/priority',
    ]) {
      const parsed = parseModelSelector(text, FULL_OPTIONS);
      expect(parsed).not.toBeNull();
      expect(formatModelSelector(parsed!)).toBe(text);
    }
  });
});

describe('thinking suffix', () => {
  test('strict levels strip without opt-in and abbreviations resolve', () => {
    expect(splitThinkingSuffix('claude-sonnet-4-6:high')).toEqual({ base: 'claude-sonnet-4-6', level: 'high' });
    expect(splitThinkingSuffix('model:xhi')).toEqual({ base: 'model', level: 'xhigh' });
    expect(splitThinkingSuffix('model:med')).toEqual({ base: 'model', level: 'medium' });
    expect(splitThinkingSuffix('model:m')).toEqual({ base: 'model:m' });
  });

  test('max and auto are gated behind their flags', () => {
    expect(splitThinkingSuffix('model:max')).toEqual({ base: 'model:max' });
    expect(splitThinkingSuffix('model:max', -1, MAX_OPTIONS)).toEqual({ base: 'model', level: 'max' });
    expect(splitThinkingSuffix('model:auto')).toEqual({ base: 'model:auto' });
    expect(splitThinkingSuffix('model:auto', -1, MAX_OPTIONS)).toEqual({ base: 'model', level: 'auto' });
  });

  test('an unowned suffix stays part of the id', () => {
    expect(splitThinkingSuffix('openrouter/model:free')).toEqual({ base: 'openrouter/model:free' });
  });
});

describe('max literal-id guard', () => {
  test('a real :max id wins over the thinking grammar', () => {
    expect(parseModelString('z-ai/glm-4.7:max', { ...MAX_OPTIONS, isLiteralModelId: literalMax }))
      .toEqual({ providerId: 'z-ai', modelId: 'glm-4.7:max' });
  });

  test('an unknown id is still read as provider/model with the max level', () => {
    expect(parseModelString('z-ai/glm-4.8:max', { ...MAX_OPTIONS, isLiteralModelId: literalMax }))
      .toEqual({ providerId: 'z-ai', modelId: 'glm-4.8', thinkingLevel: 'max' });
  });

  test('without the opt-in, max never becomes a level', () => {
    expect(parseModelString('z-ai/glm-4.7:max')).toEqual({ providerId: 'z-ai', modelId: 'glm-4.7:max' });
  });

  test('a literal strict level still strips, matching OMP order', () => {
    // A real id may end in `:high`, but the strict level is honored first, as
    // OMP does: only `:max` and `:auto` are literal-guarded.
    expect(parseModelString('provider/model:high', MAX_OPTIONS))
      .toEqual({ providerId: 'provider', modelId: 'model', thinkingLevel: 'high' });
  });
});

describe('provider/model split', () => {
  test('the first slash separates provider from a slashed id', () => {
    expect(parseModelString('openrouter/z-ai/glm-4.7')).toEqual({ providerId: 'openrouter', modelId: 'z-ai/glm-4.7' });
  });

  test('a value without a pair is rejected', () => {
    expect(parseModelString('model')).toBeNull();
    expect(parseModelString('/model')).toBeNull();
    expect(parseModelString('provider/')).toBeNull();
    expect(parseModelSelector('  ')).toBeNull();
  });
});

describe('variant and upstream suffixes', () => {
  test('a variant is split off the model half only', () => {
    expect(parseModelSelector('provider/model#careful')).toEqual({
      providerId: 'provider', modelId: 'model', variant: 'careful',
    });
    expect(parseModelSelector('provider/model#')).toEqual({ providerId: 'provider', modelId: 'model' });
  });

  test('routing is opt-in, so an at-sign id is kept whole by default', () => {
    // OMP honors `@upstream` only when the base is an aggregator model; a
    // caller that cannot check that leaves the suffix in the id.
    expect(parseModelSelector('anthropic/claude-opus-4-8@default')?.modelId).toBe('claude-opus-4-8@default');
    expect(parseModelSelector('workers-ai/@cf/meta/llama')?.modelId).toBe('@cf/meta/llama');
    // The splitter itself is suffix-shaped only; the caller owns the policy.
    expect(splitUpstreamRouting('anthropic/claude-opus-4-8@default'))
      .toEqual({ base: 'anthropic/claude-opus-4-8', upstream: 'default' });
    expect(splitUpstreamRouting('workers-ai/@cf/meta/llama'))
      .toEqual({ base: 'workers-ai/', upstream: 'cf/meta/llama' });
  });

  test('a tiered upstream keeps its path and the thinking suffix stays on the base', () => {
    expect(splitUpstreamRouting('openrouter/z-ai/glm-4.7@google-ai-studio/priority'))
      .toEqual({ base: 'openrouter/z-ai/glm-4.7', upstream: 'google-ai-studio/priority' });
    expect(splitUpstreamRouting('openrouter/z-ai/glm-4.7@cerebras:high'))
      .toEqual({ base: 'openrouter/z-ai/glm-4.7:high', upstream: 'cerebras' });
    expect(parseModelSelector('openrouter/z-ai/glm-4.7@cerebras:high', FULL_OPTIONS)).toEqual({
      providerId: 'openrouter', modelId: 'z-ai/glm-4.7', thinkingLevel: 'high', upstream: 'cerebras',
    });
  });
});

describe('formatting', () => {
  test('inherit adds no suffix', () => {
    expect(formatModelSelectorValue('provider/model', 'inherit')).toBe('provider/model');
    expect(formatModelSelectorValue('provider/model', undefined)).toBe('provider/model');
    expect(formatModelSelectorValue('provider/model', 'high')).toBe('provider/model:high');
  });

  test('an incomplete selector formats to nothing', () => {
    expect(formatModelSelector({ providerId: '', modelId: 'model' })).toBe('');
    expect(formatModelSelector({ providerId: 'provider', modelId: ' ' })).toBe('');
  });
});

describe('splitSelectorThinking', () => {
  test('splits the model half a control edits', () => {
    expect(splitSelectorThinking('provider/model:high')).toEqual({ model: 'provider/model', thinkingLevel: 'high' });
    expect(splitSelectorThinking('provider/model:max', MAX_OPTIONS))
      .toEqual({ model: 'provider/model', thinkingLevel: 'max' });
    expect(splitSelectorThinking('provider/model')).toEqual({ model: 'provider/model' });
  });

  test('keeps a custom or alias value whole instead of dropping it', () => {
    expect(splitSelectorThinking('@smol')).toEqual({ model: '@smol' });
    expect(splitSelectorThinking('not a selector')).toEqual({ model: 'not a selector' });
  });

  test('a literal :max id is not split when the catalog claims it', () => {
    expect(splitSelectorThinking('z-ai/glm-4.7:max', { ...MAX_OPTIONS, isLiteralModelId: literalMax }))
      .toEqual({ model: 'z-ai/glm-4.7:max' });
  });
});

describe('roles', () => {
  const roles = { default: 'openrouter/anthropic/claude-haiku:high', smol: 'chosen/haiku', tiny: '@smol', commit: 'chosen/large:max' };

  test('aliases are canonical, legacy and shorthand', () => {
    expect(parseRoleAlias('@smol')).toBe('smol');
    expect(parseRoleAlias('pi/slow')).toBe('slow');
    expect(parseRoleAlias('*')).toBe('default');
    expect(parseRoleAlias('@smol:high')).toBe('smol:high');
    expect(parseRoleAlias('chosen/haiku')).toBeUndefined();
  });

  test('a role resolves to its configured selector', () => {
    expect(resolveRoleSelector('smol', roles)).toBe('chosen/haiku');
    expect(resolveRoleSelector('@smol', roles)).toBe('chosen/haiku');
    expect(resolveRoleSelector('*', roles)).toBe('openrouter/anthropic/claude-haiku:high');
  });

  test('a role whose value is another role follows the chain', () => {
    expect(resolveRoleSelector('tiny', roles)).toBe('chosen/haiku');
  });

  test('an unset role falls back to default, and an unset default resolves to nothing', () => {
    expect(resolveRoleSelector('slow', roles)).toBe('openrouter/anthropic/claude-haiku:high');
    expect(resolveRoleSelector('slow', {})).toBeUndefined();
  });

  test('a level written on the role carries onto the resolved selector', () => {
    expect(resolveRoleSelector('@smol:high', roles)).toBe('chosen/haiku:high');
    expect(resolveRoleSelector('@smol:auto', roles)).toBe('chosen/haiku:auto');
  });

  test('a concrete selector is returned unchanged', () => {
    expect(resolveRoleSelector('provider/model:high', roles)).toBe('provider/model:high');
  });

  test('a cycle resolves to nothing instead of looping', () => {
    expect(resolveRoleSelector('a', { a: '@b', b: '@a' })).toBeUndefined();
  });
});

describe('role chains', () => {
  test('the outermost level wins over an inner alias level', () => {
    const roles = { smol: '@tiny:high', tiny: '@slow:low', slow: 'provider/model' };
    expect(resolveRoleSelector('smol', roles)).toBe('provider/model:high');
  });

  test('a carried level lands before a variant, so it still parses back', () => {
    const roles = { smol: '@tiny:high', tiny: 'provider/model#route' };
    const resolved = resolveRoleSelector('smol', roles)!;
    expect(resolved).toBe('provider/model:high#route');
    expect(parseModelSelector(resolved)?.thinkingLevel).toBe('high');
    expect(parseModelSelector(resolved)?.variant).toBe('route');
  });

  test('an array-valued native role expands from its first entry', () => {
    const roles = { smol: ['chosen/haiku', 'other/backup'] };
    expect(resolveRoleSelector('smol', roles)).toBe('chosen/haiku');
    expect(isRoleConfigured('smol', roles)).toBe(true);
    expect(isRoleConfigured('slow', roles)).toBe(false);
  });

  test('a native comma-separated role expands its primary selector and aliases', () => {
    const roles = { commit: ' , @smol:high,other/backup', smol: [' ', ', chosen/haiku,other/spare'] };
    expect(isRoleConfigured('commit', roles)).toBe(true);
    expect(resolveRoleSelector('commit', roles)).toBe('chosen/haiku:high');
    expect(isRoleConfigured('commit', { commit: [' ', ', '] })).toBe(false);
  });
});

describe('reasoning effort', () => {
  test('concrete levels map to an effort and sentinels ask for none', () => {
    expect(thinkingLevelToReasoningEffort('high')).toBe('high');
    expect(thinkingLevelToReasoningEffort('max')).toBe('max');
    expect(thinkingLevelToReasoningEffort('off')).toBeNull();
    expect(thinkingLevelToReasoningEffort('inherit')).toBeNull();
    expect(thinkingLevelToReasoningEffort('auto')).toBeNull();
    expect(thinkingLevelToReasoningEffort(undefined)).toBeNull();
  });
});
