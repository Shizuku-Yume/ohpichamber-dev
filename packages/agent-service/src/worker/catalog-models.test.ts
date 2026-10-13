import { expect, test } from 'bun:test';
import { getBundledModel } from '@oh-my-pi/pi-catalog';
import { publicModel, type NativeCatalogModel } from './catalog-models.ts';

const routed = getBundledModel('openrouter', 'openrouter/auto');

test('a bundled automatic router remains selectable without publishing negative sentinel rates', () => {
  const model = publicModel(routed);
  expect(model.modelId).toBe('openrouter/auto');
  expect(model.contextWindow).toBe(routed.contextWindow);
  expect(model.pricing).toBeNull();
});

for (const pricingStatus of [undefined, 'unknown', 'included', 'variable'] as const) {
  test(`zero token rates with ${pricingStatus ?? 'absent'} pricing status do not claim a free model`, () => {
    const native: NativeCatalogModel = { ...routed, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, pricingStatus };
    expect(publicModel(native).pricing).toBeNull();
  });
}

test('explicitly free token pricing remains zero rather than unknown', () => {
  const native: NativeCatalogModel = { ...routed, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, pricingStatus: 'free' };
  expect(publicModel(native).pricing).toEqual({ inputPerMillionTokens: 0, outputPerMillionTokens: 0, cacheReadPerMillionTokens: 0, cacheWritePerMillionTokens: 0 });
});

test('fixed native pricing preserves each published token rate', () => {
  const native: NativeCatalogModel = { ...routed, cost: { input: 1, output: 2, cacheRead: 0.25, cacheWrite: 1.5 }, pricingStatus: undefined };
  expect(publicModel(native).pricing).toEqual({ inputPerMillionTokens: 1, outputPerMillionTokens: 2, cacheReadPerMillionTokens: 0.25, cacheWritePerMillionTokens: 1.5 });
});

for (const field of ['input', 'output', 'cacheRead', 'cacheWrite'] as const) {
  test(`a negative ${field} sentinel makes the native rate card unknown`, () => {
    const native: NativeCatalogModel = { ...routed, cost: { input: 1, output: 2, cacheRead: 0.25, cacheWrite: 1.5, [field]: -1 }, pricingStatus: undefined };
    expect(publicModel(native).pricing).toBeNull();
  });
}
