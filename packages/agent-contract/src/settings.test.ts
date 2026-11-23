import { expect, test } from 'bun:test';
import * as settingsModule from './settings.ts';
import {
  OmpSettingPlacementSchema,
  OmpSettingsStateSchema,
  OmpSettingsUpdateRequestSchema,
  parsePlacement,
  formatPlacement,
} from './settings.ts';

const descriptor = {
  id: 'compaction.thresholdPercent',
  type: 'number' as const,
  value: 50,
  default: -1,
  configured: true,
  label: 'Compaction Threshold',
  group: 'Compaction',
  tab: 'context',
  placement: { type: 'engine' } as const,
};
const state = {
  workspaceId: 'workspace_1', revision: '2', totalCount: 1,
  settings: [descriptor],
};

test('OMP_SETTING_IDS is deleted and not exported', () => {
  expect((settingsModule as Record<string, unknown>).OMP_SETTING_IDS).toBeUndefined();
  expect((settingsModule as Record<string, unknown>).OmpSettingsPlacementCountsSchema).toBeUndefined();
});

test('parsePlacement and formatPlacement roundtrip correctly', () => {
  expect(parsePlacement('engine')).toEqual({ type: 'engine' });
  expect(formatPlacement({ type: 'engine' })).toBe('engine');

  expect(parsePlacement('tui-only')).toEqual({ type: 'tui-only' });
  expect(formatPlacement({ type: 'tui-only' })).toBe('tui-only');

  expect(parsePlacement('config-only')).toEqual({ type: 'config-only' });
  expect(formatPlacement({ type: 'config-only' })).toBe('config-only');

  expect(parsePlacement('hidden')).toEqual({ type: 'hidden' });
  expect(formatPlacement({ type: 'hidden' })).toBe('hidden');
  expect(parsePlacement('boundary')).toEqual({ type: 'boundary' });
  expect(formatPlacement({ type: 'boundary' })).toBe('boundary');

  expect(parsePlacement('owned-by chat.mermaid-rendering')).toEqual({
    type: 'owned-by',
    owner: 'chat.mermaid-rendering',
  });
  expect(formatPlacement({ type: 'owned-by', owner: 'chat.mermaid-rendering' })).toBe('owned-by chat.mermaid-rendering');

  expect(parsePlacement('sessions:defaults')).toEqual({
    type: 'page',
    page: 'sessions',
    section: 'defaults',
  });
  expect(formatPlacement({ type: 'page', page: 'sessions', section: 'defaults' })).toBe('sessions:defaults');

  expect(() => parsePlacement('invalid')).toThrow();
});

test('OMP settings state carries descriptors and revisions', () => {
  expect(OmpSettingsStateSchema.parse(state)).toEqual(state);
  expect(OmpSettingsStateSchema.safeParse({ ...state, settings: [descriptor, descriptor] }).success).toBe(false);
  expect(OmpSettingsStateSchema.safeParse({ ...state, settings: [{ ...descriptor, value: undefined }] }).success).toBe(false);
  expect(OmpSettingsStateSchema.safeParse({ ...state, settings: [{ ...descriptor, placement: { type: 'invalid' } }] }).success).toBe(false);
  expect(OmpSettingsStateSchema.safeParse({ ...state, placementCounts: { tuiOnly: 0, boundary: 0, elsewhere: 0 } }).success).toBe(false);
});

test('an owned-by placement requires an owner and conditional setting reports condition state', () => {
  const duplicate = { ...descriptor, placement: { type: 'owned-by' as const, owner: 'providers.models' } };
  expect(OmpSettingsStateSchema.parse({ ...state, settings: [duplicate] })).toEqual({ ...state, settings: [duplicate] });
  expect(OmpSettingPlacementSchema.safeParse({ type: 'owned-by' }).success).toBe(false);

  const conditional = { ...descriptor, condition: 'usageAwareFallbackEnabled', conditionActive: false };
  expect(OmpSettingsStateSchema.parse({ ...state, settings: [conditional] })).toEqual({ ...state, settings: [conditional] });
  expect(OmpSettingsStateSchema.safeParse({ ...state, settings: [{ ...descriptor, condition: 'usageAwareFallbackEnabled' }] }).success).toBe(false);
});

test('OMP settings changes require valid ids and a next revision request', () => {
  const request = { expectedRevision: '2', changes: [{ id: 'compaction.thresholdPercent', value: 60 }] };
  expect(OmpSettingsUpdateRequestSchema.parse(request)).toEqual(request);
  const conditional = { ...request, changes: [{ ...request.changes[0], expectedValue: 80 }] };
  expect(OmpSettingsUpdateRequestSchema.parse(conditional)).toEqual(conditional);
  expect(OmpSettingsUpdateRequestSchema.safeParse({ ...request, changes: [] }).success).toBe(false);
  expect(OmpSettingsUpdateRequestSchema.safeParse({ ...request, changes: [request.changes[0], request.changes[0]] }).success).toBe(false);
  expect(OmpSettingsUpdateRequestSchema.safeParse({ ...request, changes: [{ id: '', value: 10 }] }).success).toBe(false);
  expect(OmpSettingsUpdateRequestSchema.safeParse({ ...request, changes: [{ id: 'compaction.thresholdPercent', value: undefined }] }).success).toBe(false);
});
