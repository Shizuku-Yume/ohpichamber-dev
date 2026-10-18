import { expect, test } from 'bun:test';
import {
  CacheWarmingApplyResultSchema, CacheWarmingModeSchema, CacheWarmingStateSchema,
  CacheWarmingUpdateRequestSchema, CacheWarmingWorkerApplyOutcomeSchema,
  CacheWarmingPartialWriteDetailsSchema,
} from './warming.ts';

const persisted = { workspaceId: 'workspace_1', revision: '18446744073709551615', mode: 'streaming' as const };
const worker = { rootSessionId: 'root_1', workspaceId: 'workspace_1', workerGeneration: 'generation_1' };
const applied = { worker, outcome: 'applied' as const, mode: 'streaming' as const };
const failed = {
  worker: { ...worker, rootSessionId: 'root_2' }, outcome: 'failed' as const, mode: 'off' as const,
  error: { code: 'SERVICE_UNAVAILABLE', detail: 'Native session could not apply the mode', retryable: true },
};

test('warming modes, strict state and request preserve uint64 decimal revisions', () => {
  for (const mode of ['off', 'streaming', 'idle']) {
    expect(CacheWarmingModeSchema.parse(mode)).toBe(mode);
    expect(CacheWarmingStateSchema.parse({ ...persisted, mode })).toEqual({ ...persisted, mode });
    expect(CacheWarmingUpdateRequestSchema.parse({ expectedRevision: '0', mode })).toEqual({ expectedRevision: '0', mode });
  }
  for (const revision of ['18446744073709551616', '-1', '01', '1.0', '', 1]) {
    expect(CacheWarmingStateSchema.safeParse({ ...persisted, revision }).success).toBe(false);
    expect(CacheWarmingUpdateRequestSchema.safeParse({ expectedRevision: revision, mode: 'idle' }).success).toBe(false);
  }
  expect(CacheWarmingModeSchema.safeParse('on').success).toBe(false);
  expect(CacheWarmingStateSchema.safeParse({ ...persisted, extra: true }).success).toBe(false);
  expect(CacheWarmingStateSchema.safeParse({ ...persisted, workspaceId: '' }).success).toBe(false);
  expect(CacheWarmingUpdateRequestSchema.safeParse({ expectedRevision: '0', mode: 'idle', extra: true }).success).toBe(false);
});

test('worker warming failure requires an error and success forbids one', () => {
  expect(CacheWarmingWorkerApplyOutcomeSchema.parse(applied)).toEqual(applied);
  expect(CacheWarmingWorkerApplyOutcomeSchema.parse(failed)).toEqual(failed);
  const { error: _error, ...withoutError } = failed;
  expect(CacheWarmingWorkerApplyOutcomeSchema.safeParse(withoutError).success).toBe(false);
  expect(CacheWarmingWorkerApplyOutcomeSchema.safeParse({ ...applied, error: failed.error }).success).toBe(false);
  expect(CacheWarmingWorkerApplyOutcomeSchema.safeParse({ ...failed, error: { ...failed.error, retryable: undefined } }).success).toBe(false);
  expect(CacheWarmingWorkerApplyOutcomeSchema.safeParse({ ...applied, worker: { ...worker, extra: true } }).success).toBe(false);
});

test('aggregate warming status exactly reflects unique captured worker outcomes', () => {
  const cases = [
    { status: 'no-active-workers', workers: [] },
    { status: 'applied', workers: [applied] },
    { status: 'failed', workers: [failed] },
    { status: 'partial', workers: [applied, failed] },
  ] as const;
  for (const candidate of cases) {
    expect(CacheWarmingApplyResultSchema.parse({ persisted, ...candidate })).toEqual({ persisted, ...candidate });
    for (const status of ['applied', 'partial', 'failed', 'no-active-workers']) {
      if (status === candidate.status) continue;
      expect(CacheWarmingApplyResultSchema.safeParse({ persisted, ...candidate, status }).success).toBe(false);
    }
  }
  expect(CacheWarmingApplyResultSchema.safeParse({ persisted, status: 'applied', workers: [applied, applied] }).success).toBe(false);
  expect(CacheWarmingApplyResultSchema.safeParse({ persisted, status: 'partial', workers: [applied, { ...failed, worker }] }).success).toBe(false);
  expect(CacheWarmingApplyResultSchema.safeParse({ persisted, status: 'applied', workers: [{ ...applied, worker: { ...worker, workspaceId: 'other' } }] }).success).toBe(false);
  expect(CacheWarmingApplyResultSchema.safeParse({ persisted, status: 'applied', workers: [{ ...applied, mode: 'idle' }] }).success).toBe(false);
  expect(CacheWarmingApplyResultSchema.safeParse({ persisted, status: 'applied', workers: [applied], extra: true }).success).toBe(false);
});

test('partial native-write details cannot claim revision durability or active application', () => {
  const details = {
    workspaceId: 'workspace_1', configuredMode: 'streaming', currentRevision: '0',
    nativeConfigurationCommitted: true, liveApplication: 'not-started',
  };
  expect(CacheWarmingPartialWriteDetailsSchema.safeParse(details).success).toBe(true);
  for (const invalid of [
    { ...details, nativeConfigurationCommitted: false },
    { ...details, liveApplication: 'applied' },
    { ...details, currentRevision: '18446744073709551616' },
    { ...details, configuredMode: 'on' },
    { ...details, workspaceId: '' },
    { ...details, revision: '1' },
  ]) expect(CacheWarmingPartialWriteDetailsSchema.safeParse(invalid).success).toBe(false);
});
