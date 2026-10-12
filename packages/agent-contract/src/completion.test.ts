import { describe, expect, test } from 'bun:test';
import {
  CompletionCancelRequestSchema,
  CompletionCancelResultSchema,
  CompletionErrorSchema,
  CompletionFormatSchema,
  CompletionOutputSchema,
  CompletionRequestSchema,
  CompletionResultSchema,
  CompletionUsageSchema,
} from './completion.ts';

const selection = { providerId: 'provider_1', modelId: 'model_1' };
const jsonSchema = { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'], additionalProperties: false };
const request = {
  completionId: 'completion_1', workspaceId: 'workspace_1', selection,
  prompt: 'Write a commit subject from this diff.', system: 'Return concise text.',
  format: { kind: 'text' }, maxOutputTokens: 128, timeoutMs: 60000, overflow: 'reject',
  variant: null, reasoningEffort: null,
};
const usage = { inputTokens: 7, outputTokens: 2, totalTokens: 9 };
const error = { code: 'PROVIDER_FAILURE', detail: 'The selected provider could not complete the request.', retryable: true };
const completed = {
  completionId: 'completion_1', selection, status: 'completed',
  output: { kind: 'text', text: 'fix: retain captured queue configuration' }, finishReason: 'complete', usage,
};
const cancelled = { completionId: 'completion_1', selection, status: 'cancelled', reason: 'requested' };
const failed = { completionId: 'completion_1', selection, status: 'failed', error };

const boundaries = [
  { name: 'CompletionFormat', schema: CompletionFormatSchema, valid: { kind: 'json', schema: jsonSchema }, invalid: [{ kind: 'json' }, { kind: 'text', schema: jsonSchema }, { kind: 'json', schema: { invalid: undefined } }] },
  { name: 'CompletionRequest', schema: CompletionRequestSchema, valid: request, invalid: [{ ...request, prompt: '  ' }, { ...request, selection: { modelId: 'model_1' } }, { ...request, maxOutputTokens: 0 }, { ...request, timeoutMs: 0 }, { ...request, sessionId: 'secondary_agent_session' }] },
  { name: 'CompletionUsage', schema: CompletionUsageSchema, valid: usage, invalid: [{ ...usage, totalTokens: 8 }, { ...usage, inputTokens: -1 }] },
  { name: 'CompletionOutput', schema: CompletionOutputSchema, valid: completed.output, invalid: [{ kind: 'text', text: '', value: {} }, { kind: 'json', value: { invalid: Infinity } }, { kind: 'json', value: undefined }] },
  { name: 'CompletionError', schema: CompletionErrorSchema, valid: error, invalid: [{ ...error, code: 'UNMAPPED_SDK_ERROR' }, { ...error, detail: '' }, { ...error, rawException: 'private token' }] },
  { name: 'CompletionResult', schema: CompletionResultSchema, valid: completed, invalid: [{ ...cancelled, output: completed.output }, { ...failed, output: { kind: 'text', text: '' } }, { ...completed, error }, { ...completed, status: 'unknown' }] },
  { name: 'CompletionCancelRequest', schema: CompletionCancelRequestSchema, valid: { completionId: 'completion_1' }, invalid: [{ completionId: '' }, { completionId: 'completion_1', signal: {} }] },
  { name: 'CompletionCancelResult', schema: CompletionCancelResultSchema, valid: { completionId: 'completion_1', status: 'cancelled' }, invalid: [{ completionId: 'completion_1', status: 'completed' }, { completionId: 'completion_1', cancelled: false }] },
];

describe('Canonical stateless completion boundaries', () => {
  for (const boundary of boundaries) {
    test(`${boundary.name} accepts deliberate wire data and rejects invalid result or request states`, () => {
      expect(boundary.schema.parse(JSON.parse(JSON.stringify(boundary.valid)))).toEqual(boundary.valid);
      for (const invalid of boundary.invalid) expect(boundary.schema.safeParse(invalid).success).toBe(false);
    });
  }

  test('text and JSON-schema completion have disjoint output shapes with JSON-safe values', () => {
    expect(CompletionFormatSchema.parse({ kind: 'text' }).kind).toBe('text');
    expect(CompletionRequestSchema.parse({ ...request, format: { kind: 'json', schema: jsonSchema } }).format.kind).toBe('json');
    const structured = { ...completed, output: { kind: 'json', value: { subject: 'fix: retain queue configuration' } } };
    expect(CompletionResultSchema.parse(structured)).toEqual(structured);
    for (const value of [null, [true, 2, 'result'], { items: [{ count: 2 }] }]) {
      expect(CompletionOutputSchema.parse({ kind: 'json', value })).toEqual({ kind: 'json', value });
    }
    expect(CompletionOutputSchema.safeParse({ kind: 'json', value: { execute: () => 'not-json' } }).success).toBe(false);
    expect(CompletionFormatSchema.safeParse({ kind: 'json', schema: { invalid: NaN } }).success).toBe(false);
  });

  test('cancellation, timeout, provider failure and unavailable model cannot masquerade as empty success', () => {
    expect(CompletionResultSchema.parse(cancelled)).toEqual(cancelled);
    expect(CompletionResultSchema.parse({ ...cancelled, reason: 'timeout' })).toMatchObject({ status: 'cancelled', reason: 'timeout' });
    expect(CompletionResultSchema.parse(failed)).toEqual(failed);
    expect(CompletionResultSchema.parse({ ...failed, error: { code: 'MODEL_UNAVAILABLE', detail: 'The selected model is unavailable.', retryable: false } })).toMatchObject({ status: 'failed', error: { code: 'MODEL_UNAVAILABLE' } });
    expect(CompletionResultSchema.safeParse({ ...failed, status: 'completed' }).success).toBe(false);
    expect(CompletionResultSchema.safeParse({ ...completed, output: undefined }).success).toBe(false);
    expect(CompletionResultSchema.parse({ ...completed, usage: null, finishReason: 'output-limit' })).toMatchObject({ status: 'completed', usage: null, finishReason: 'output-limit' });
  });

  test('opaque workspace and full model selection avoid ambient directory/model affinity and secondary agent execution', () => {
    const parsed = CompletionRequestSchema.parse(request);
    expect(parsed.selection).toEqual(selection);
    expect(parsed.workspaceId).toBe('workspace_1');
    for (const invalid of [
      { ...request, directory: '/private/workspace' },
      { ...request, agentId: 'agent_1' },
      { ...request, runId: 'run_1' },
      { ...request, selection: { providerId: 'provider_1' } },
      { ...request, selection: null },
      { ...request, format: { kind: 'toolUse' } },
    ]) expect(CompletionRequestSchema.safeParse(invalid).success).toBe(false);
  });
});
