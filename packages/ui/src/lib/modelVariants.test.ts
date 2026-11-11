import { describe, expect, test } from 'bun:test';
import { listModelVariantIds, modelVariantNames, nextThinkingVariant } from './modelVariants';

describe('nextThinkingVariant', () => {
  const levels = ['low', 'high', 'max'];

  test('steps from Default through every level and back to Default', () => {
    expect(nextThinkingVariant(levels, undefined)).toBe('low');
    expect(nextThinkingVariant(levels, null)).toBe('low');
    expect(nextThinkingVariant(levels, 'low')).toBe('high');
    expect(nextThinkingVariant(levels, 'max')).toBeNull();
  });

  test('goes to Default from a level the model does not have', () => {
    expect(nextThinkingVariant(levels, 'medium')).toBeNull();
  });
});

describe('listModelVariantIds', () => {
  test('reads identities from the canonical variant array, not array indices', () => {
    const variants = [
      { variant: 'none', label: 'None', reasoningEffort: null },
      { variant: 'low', label: 'Low', reasoningEffort: 'low' },
      { variant: 'high', label: 'High', reasoningEffort: 'high' },
    ];
    expect(listModelVariantIds(variants)).toEqual(['none', 'low', 'high']);
  });

  test('reads keys from a record of variants', () => {
    expect(listModelVariantIds({ low: {}, high: {} })).toEqual(['low', 'high']);
  });

  test('is empty for a model without variants', () => {
    expect(listModelVariantIds(undefined)).toEqual([]);
    expect(modelVariantNames(undefined)).toEqual([]);
    expect(modelVariantNames({})).toEqual([]);
  });
});
