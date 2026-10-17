import { describe, expect, test } from 'bun:test';
import { CanonicalApiError } from '@/api/canonicalClient';
import { describeSessionActionError } from './sessionActionError';

const t = ((key: string, params?: Record<string, string | number>) => (
  `${key}${params ? ' ' + Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' ') : ''}`
)) as unknown as Parameters<typeof describeSessionActionError>[1];

describe('describeSessionActionError', () => {
  test('quotes the canonical status, problem code and occurrence reference when the server sent one', () => {
    const error = new CanonicalApiError({
      type: 'urn:ohpichamber:problem:INTERNAL_ERROR',
      title: 'Internal error',
      status: 500,
      detail: 'Unexpected server error. Check server logs for details.',
      code: 'INTERNAL_ERROR',
      retryable: true,
      instance: 'err_07817ddc',
    });

    expect(describeSessionActionError(error, t)).toBe(
      'sessions.sidebar.session.action.upstreamErrorWithRef status=500 name=INTERNAL_ERROR ref=err_07817ddc',
    );
  });

  test('falls back to the canonical detail without an occurrence reference, and to the plain error otherwise', () => {
    const noRef = new CanonicalApiError({
      type: 'urn:ohpichamber:problem:SESSION_NOT_FOUND',
      title: 'Session not found',
      status: 404,
      detail: 'Session not found',
      code: 'SESSION_NOT_FOUND',
      retryable: false,
    });
    expect(describeSessionActionError(noRef, t)).toBe('sessions.sidebar.session.action.upstreamError status=404 message=Session not found');
    expect(describeSessionActionError(new Error('offline'), t)).toBe('offline');
  });
});
