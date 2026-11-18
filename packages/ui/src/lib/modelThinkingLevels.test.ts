import { describe, expect, test } from 'bun:test';
import { getModelThinkingLevels, getReasoningEffortLevels, nextThinkingLevel, resolveThinkingLevel } from './modelThinkingLevels';

const reasoningModel = {
  reasoningEffortSupported: true,
  reasoningOptions: [
    { reasoningEffort: 'low' },
    { reasoningEffort: 'medium' },
    { reasoningEffort: 'high' },
  ],
  variants: [] as { variant: string }[],
};

describe('model thinking levels', () => {
  test('a model with reasoning options but no variants still offers its levels', () => {
    expect(getModelThinkingLevels(reasoningModel)).toEqual(['off', 'low', 'medium', 'high']);
    expect(getReasoningEffortLevels(reasoningModel)).toEqual(['off', 'low', 'medium', 'high']);
  });

  test('off is listed once and an off option does not repeat it', () => {
    expect(getModelThinkingLevels({
      ...reasoningModel,
      reasoningOptions: [{ reasoningEffort: 'off' }, { reasoningEffort: 'low' }, { reasoningEffort: 'low' }],
    })).toEqual(['off', 'low']);
  });

  test('effort levels win over legacy variant routes', () => {
    expect(getModelThinkingLevels({
      ...reasoningModel,
      variants: [{ variant: 'fast' }, { variant: 'slow' }],
    })).toEqual(['off', 'low', 'medium', 'high']);
  });

  test('a variants-only catalog falls back to its route ids', () => {
    const legacy = { reasoningEffortSupported: false, reasoningOptions: [], variants: [{ variant: 'low' }, { variant: 'max' }] };
    expect(getModelThinkingLevels(legacy)).toEqual(['off', 'low', 'max']);
    expect(getReasoningEffortLevels(legacy)).toEqual([]);
  });

  test('a model with neither effort levels nor variants is hidden', () => {
    expect(getModelThinkingLevels({ reasoningEffortSupported: false, reasoningOptions: [], variants: [] })).toEqual([]);
    expect(getModelThinkingLevels(undefined)).toEqual([]);
  });

  test('a supported model with zero options still shows Off, as the desktop panel does', () => {
    expect(getReasoningEffortLevels({ reasoningEffortSupported: true, reasoningOptions: [] })).toEqual(['off']);
  });

  test('selection prefers the first candidate the model runs and falls back to off', () => {
    expect(resolveThinkingLevel(['off', 'low', 'high'], ['stale', 'high', 'low'])).toBe('high');
    expect(resolveThinkingLevel(['off', 'low'], [undefined, undefined])).toBe('off');
  });

  test('tapping wraps through the listed levels', () => {
    expect(nextThinkingLevel(['off', 'low', 'high'], 'off')).toBe('low');
    expect(nextThinkingLevel(['off', 'low', 'high'], 'high')).toBe('off');
    expect(nextThinkingLevel(['off', 'low', 'high'], undefined)).toBe('low');
    expect(nextThinkingLevel([], 'off')).toBeUndefined();
  });
});
