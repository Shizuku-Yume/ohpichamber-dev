import { describe, expect, test } from 'bun:test';
import { ProblemCodeSchema, ProblemDetailsSchema } from './errors.ts';

const codes = [
  'SESSION_NOT_FOUND', 'RUN_ACTIVE', 'RUN_NOT_FOUND', 'APPROVAL_NOT_FOUND', 'QUESTION_NOT_FOUND',
  'APPROVAL_CONFLICT', 'QUESTION_CONFLICT', 'APPROVAL_EXPIRED', 'QUESTION_EXPIRED',
  'IDEMPOTENCY_CONFLICT', 'COMMAND_IN_FLIGHT', 'RESYNC_REQUIRED', 'INVALID_CURSOR',
  'UNSUPPORTED_CAPABILITY', 'SESSION_RESTORE_FAILED', 'PAYLOAD_TOO_LARGE', 'METADATA_CONFLICT',
  'QUEUE_CONFLICT', 'CATALOG_CONFLICT', 'APPROVAL_POLICY_WRITE_FAILED', 'METADATA_CORRUPT',
  'METADATA_READ_FAILED', 'METADATA_WRITE_FAILED', 'MCP_CONFIG_WRITE_FAILED', 'MCP_APPLY_FAILED',
  'MCP_RECONNECT_FAILED', 'SKILL_INSTALL_FAILED', 'SKILL_APPLY_FAILED', 'MODEL_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE', 'PROVIDER_FAILURE', 'CONTEXT_LIMIT', 'STRUCTURED_OUTPUT_INVALID',
  'COMPLETION_NOT_FOUND', 'PROVIDER_CONFIG_WRITE_FAILED', 'MODEL_CONFIG_WRITE_FAILED',
  'CREDENTIAL_WRITE_FAILED', 'SHELL_NOT_FOUND', 'SHELL_OUTPUT_UNAVAILABLE', 'SHELL_STOP_TIMEOUT',
];
const statusFor = (code: typeof codes[number]): number => {
  if (['APPROVAL_CONFLICT', 'QUESTION_CONFLICT', 'METADATA_CONFLICT', 'QUEUE_CONFLICT', 'CATALOG_CONFLICT', 'COMMAND_IN_FLIGHT'].includes(code)) return 409;
  if (['APPROVAL_EXPIRED', 'QUESTION_EXPIRED', 'RESYNC_REQUIRED'].includes(code)) return 410;
  if (['INVALID_CURSOR', 'IDEMPOTENCY_CONFLICT'].includes(code)) return 400;
  if (code === 'APPROVAL_POLICY_WRITE_FAILED') return 503;
  return 500;
};

describe('error schemas', () => {
  test('accepts every documented problem code with JSON-safe context', () => {
    for (const code of codes) {
      expect(ProblemCodeSchema.parse(code)).toBe(code);
      const problem = {
        type: `urn:ohpichamber:problem:${code}`, title: 'Problem', status: statusFor(code),
        detail: 'Operation failed', code, retryable: false, instance: '/sessions/ses_01',
        details: { reason: 'fixture', count: 1, nested: { ok: true }, none: null, values: ['a', 2] },
      };
      expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
    }
  });
  test('accepts existing Host authentication, readiness and request failures', () => {
    const failures = [
      ['SERVICE_UNAVAILABLE', 503], ['UNAUTHORIZED', 401], ['INTERNAL_ERROR', 500],
      ['INVALID_ORIGIN', 403], ['enterprise_mode', 403], ['UNSUPPORTED_MEDIA_TYPE', 415],
      ['INVALID_REQUEST', 400], ['NOT_IMPLEMENTED', 501],
    ] as const;
    for (const [code, status] of failures) {
      const problem = { type: `urn:ohpichamber:problem:${code}`, title: 'Host request failed', status, detail: 'Operation unavailable', code, retryable: false };
      expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
    }
  });
  test('rejects invalid identity, status mappings, and non-JSON context', () => {
    const base = { type: 'urn:ohpichamber:problem:INVALID_CURSOR', title: 'Problem', status: 400, detail: 'Bad cursor', code: 'INVALID_CURSOR', retryable: false };
    expect(ProblemDetailsSchema.safeParse({ ...base, type: 'urn:ohpichamber:problem:RUN_NOT_FOUND' }).success).toBe(false);
    expect(ProblemDetailsSchema.safeParse({ ...base, status: 500 }).success).toBe(false);
    expect(ProblemDetailsSchema.safeParse({ ...base, details: { bad: undefined } }).success).toBe(false);
    expect(ProblemDetailsSchema.safeParse({ ...base, details: { bad: () => true } }).success).toBe(false);
    expect(ProblemDetailsSchema.safeParse({ ...base, title: '' }).success).toBe(false);
    expect(ProblemDetailsSchema.safeParse({ ...base, status: 399 }).success).toBe(false);
    expect(ProblemCodeSchema.safeParse('UNKNOWN').success).toBe(false);
  });
});
