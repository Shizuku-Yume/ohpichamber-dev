import { describe, expect, test } from 'bun:test';
import { isAutoFusionLaneFinished } from './autoFusion';

describe('native automatic fusion terminal evidence', () => {
  for (const outcome of ['completed', 'failed', 'cancelled'] as const) test(`observed ${outcome} is terminal after live activity`, () => {
    expect(isAutoFusionLaneFinished({ seenRunning: true, busy: false, outcome })).toBe(true);
    expect(isAutoFusionLaneFinished({ seenRunning: false, busy: false, outcome })).toBe(false);
    expect(isAutoFusionLaneFinished({ seenRunning: true, busy: true, outcome })).toBe(false);
  });
  test('missing and in-progress observations never trigger fusion', () => {
    for (const outcome of [null, undefined, 'pending', 'running'] as const) {
      expect(isAutoFusionLaneFinished({ seenRunning: true, busy: false, outcome })).toBe(false);
    }
  });
});
