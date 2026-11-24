import { describe, expect, test } from 'bun:test';
import { ProblemCodeSchema, ProblemDetailsSchema } from './errors.ts';

const codes = [
  'SESSION_NOT_FOUND', 'RUN_ACTIVE', 'RUN_NOT_FOUND', 'APPROVAL_NOT_FOUND', 'QUESTION_NOT_FOUND',
  'APPROVAL_CONFLICT', 'QUESTION_CONFLICT', 'APPROVAL_EXPIRED', 'QUESTION_EXPIRED',
  'IDEMPOTENCY_CONFLICT', 'COMMAND_IN_FLIGHT', 'RESYNC_REQUIRED', 'INVALID_CURSOR',
  'SESSION_BRANCH_CONFLICT', 'SESSION_RELOCATION_CONFLICT', 'SESSION_READ_ONLY',
  'UNSUPPORTED_CAPABILITY', 'SESSION_RESTORE_FAILED', 'PAYLOAD_TOO_LARGE', 'METADATA_CONFLICT',
  'QUEUE_CONFLICT', 'CATALOG_CONFLICT', 'APPROVAL_POLICY_WRITE_FAILED', 'METADATA_CORRUPT',
  'METADATA_READ_FAILED', 'METADATA_WRITE_FAILED', 'MCP_CONFIG_WRITE_FAILED', 'MCP_APPLY_FAILED',
  'MCP_RECONNECT_FAILED', 'SKILL_INSTALL_FAILED', 'SKILL_APPLY_FAILED', 'MODEL_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE', 'PROVIDER_FAILURE', 'CONTEXT_LIMIT', 'STRUCTURED_OUTPUT_INVALID',
  'COMPLETION_NOT_FOUND', 'PROVIDER_CONFIG_WRITE_FAILED', 'MODEL_CONFIG_WRITE_FAILED',
  'CREDENTIAL_WRITE_FAILED', 'SHELL_NOT_FOUND', 'SHELL_OUTPUT_UNAVAILABLE', 'SHELL_STOP_TIMEOUT',
  'SESSION_TOO_SMALL',
  'MARKETPLACE_SOURCE_MISSING', 'MARKETPLACE_SOURCE_EXISTS', 'MARKETPLACE_INVALID_SOURCE', 'MARKETPLACE_NETWORK_ERROR',
  'MCP_CONFIG_READ_FAILED', 'MCP_CREDENTIAL_UNAVAILABLE', 'WORKER_GENERATION_CONFLICT',
  'MCP_OAUTH_FAILED', 'MCP_OAUTH_CANCELLED', 'MCP_OAUTH_NOT_FOUND',
  'MCP_OAUTH_IN_PROGRESS', 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED',
];
const statusFor = (code: typeof codes[number]): number => {
  if (['APPROVAL_CONFLICT', 'QUESTION_CONFLICT', 'METADATA_CONFLICT', 'QUEUE_CONFLICT', 'CATALOG_CONFLICT', 'COMMAND_IN_FLIGHT'].includes(code)) return 409;
  if (['WORKER_GENERATION_CONFLICT', 'MCP_OAUTH_CANCELLED', 'MCP_OAUTH_IN_PROGRESS'].includes(code)) return 409;
  if (['SESSION_BRANCH_CONFLICT', 'SESSION_RELOCATION_CONFLICT', 'SESSION_READ_ONLY'].includes(code)) return 409;
  if (code === 'MCP_OAUTH_NOT_FOUND') return 404;
  if (['MCP_CREDENTIAL_UNAVAILABLE', 'MCP_OAUTH_FAILED', 'MCP_OAUTH_CLIENT_REGISTRATION_REJECTED'].includes(code)) return 422;
  if (code === 'SESSION_TOO_SMALL') return 422;
  if (code === 'MCP_CONFIG_READ_FAILED') return 503;
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
  test('OAuth upstream failures and owner conflicts retain their actual HTTP status', () => {
    for (const [code, status] of [['MCP_OAUTH_FAILED', 422], ['MCP_OAUTH_FAILED', 502], ['MCP_OAUTH_CANCELLED', 409], ['MCP_OAUTH_IN_PROGRESS', 409], ['MCP_OAUTH_CLIENT_REGISTRATION_REJECTED', 422], ['MCP_OAUTH_CLIENT_REGISTRATION_REJECTED', 403], ['WORKER_GENERATION_CONFLICT', 409], ['MCP_OAUTH_NOT_FOUND', 404], ['MCP_CREDENTIAL_UNAVAILABLE', 422], ['MCP_CONFIG_READ_FAILED', 503]] as const) {
      const problem = { type: `urn:ohpichamber:problem:${code}`, title: 'OAuth operation refused', detail: 'Operation unavailable', code, status, retryable: status >= 500 };
      expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
      expect(ProblemDetailsSchema.safeParse({ ...problem, status: 500 }).success).toBe(false);
    }
  });
  test('native branch and relocation conflicts serialize as 409 while cursor recovery remains 410', () => {
    for (const code of ['SESSION_BRANCH_CONFLICT', 'SESSION_RELOCATION_CONFLICT', 'SESSION_READ_ONLY'] as const) {
      const problem = {
        type: `urn:ohpichamber:problem:${code}`, title: 'Native session control refused',
        status: 409, detail: 'The native session owner changed', code, retryable: false
      };
      expect(ProblemDetailsSchema.parse(JSON.parse(JSON.stringify(problem)))).toEqual(problem);
      expect(ProblemDetailsSchema.safeParse({ ...problem, status: 410 }).success).toBe(false);
      expect(ProblemDetailsSchema.safeParse({ ...problem, status: 500 }).success).toBe(false);
    }
    const cursor = {
      type: 'urn:ohpichamber:problem:RESYNC_REQUIRED', title: 'Snapshot required',
      status: 410, detail: 'The cursor epoch changed', code: 'RESYNC_REQUIRED', retryable: false
    };
    expect(ProblemDetailsSchema.parse(cursor)).toEqual(cursor);
    expect(ProblemDetailsSchema.safeParse({ ...cursor, status: 409 }).success).toBe(false);
  });
  test('a too-small manual compaction stays 422 and never becomes a runtime failure', () => {
    const problem = {
      type: 'urn:ohpichamber:problem:SESSION_TOO_SMALL', title: 'Session too small',
      status: 422, detail: 'Session is too small to compact', code: 'SESSION_TOO_SMALL', retryable: false,
    };
    expect(ProblemDetailsSchema.parse(problem)).toEqual(problem);
    expect(ProblemDetailsSchema.safeParse({ ...problem, status: 500 }).success).toBe(false);
    expect(ProblemDetailsSchema.safeParse({ ...problem, status: 503 }).success).toBe(false);
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
