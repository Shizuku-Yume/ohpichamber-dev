import { describe, expect, test } from 'bun:test';
import {
  WebSearchConfigStateSchema,
  WebSearchCredentialDeleteRequestSchema,
  WebSearchCredentialWriteRequestSchema,
  WebSearchMutationResultSchema,
  WebSearchUpdateRequestSchema,
} from './websearch.ts';

const provider = {
  providerId: 'web/tavily', name: 'Tavily', configured: false,
  requiresCredential: true, isSelfHosted: false, credentialWritable: true, credentialConfigured: false,
};
const state = {
  workspaceId: 'workspace_a', revision: '18446744073709551615', enabled: true,
  selectedProviderId: provider.providerId, fallbackProviderIds: [], timeoutSeconds: 60,
  providers: [provider],
};
const applied = { sessionId: 'session_a', workerGeneration: 'generation_a', status: 'applied', code: null };
const failed = { sessionId: 'session_b', workerGeneration: 'generation_b', status: 'failed', code: 'WEB_SEARCH_APPLY_FAILED' };

describe('native web search wire boundaries', () => {
  test('round-trips uint64 revisions without numeric loss', () => {
    expect(WebSearchConfigStateSchema.parse(JSON.parse(JSON.stringify(state)))).toEqual(state);
    for (const revision of [1, '01', '-1', '18446744073709551616']) {
      expect(WebSearchConfigStateSchema.safeParse({ ...state, revision }).success).toBe(false);
    }
  });

  test('provider state is non-secret and has unique native selector identities', () => {
    expect(WebSearchConfigStateSchema.safeParse({ ...state, providers: [provider, provider] }).success).toBe(false);
    expect(WebSearchConfigStateSchema.safeParse({ ...state, providers: [{ ...provider, key: 'private' }] }).success).toBe(false);
    expect(WebSearchConfigStateSchema.safeParse({ ...state, credentials: { tavily: 'private' } }).success).toBe(false);
  });

  test('accepts only installed provider-specific native option fields and clear values', () => {
    expect(WebSearchUpdateRequestSchema.parse({ expectedRevision: '4', providerOptions: { exa: { enabled: false }, searxng: { language: null, safesearch: 2 } } })).toMatchObject({ providerOptions: { exa: { enabled: false }, searxng: { language: null, safesearch: 2 } } });
    expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '4', providerOptions: { exa: { private: true } } }).success).toBe(false);
    expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '4', providerOptions: { tavily: { endpoint: 'https://example.com' } } }).success).toBe(false);
    expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '4', providerEndpoint: 'https://user:secret@example.com' }).success).toBe(false);
  });

  test('configuration and credential mutations are separate revision-checked operations', () => {
    expect(WebSearchCredentialWriteRequestSchema.parse({ expectedRevision: '9', providerId: 'web/tavily', apiKey: 'private' }).apiKey).toBe('private');
    expect(WebSearchCredentialDeleteRequestSchema.parse({ expectedRevision: '9', providerId: 'web/tavily' }).providerId).toBe('web/tavily');
    expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '9', credentials: { tavily: 'private' } }).success).toBe(false);
    expect(WebSearchCredentialWriteRequestSchema.safeParse({ providerId: 'web/tavily', apiKey: 'private' }).success).toBe(false);
    expect(WebSearchCredentialWriteRequestSchema.safeParse({ expectedRevision: '9', providerId: 'web/tavily', apiKey: '' }).success).toBe(false);
  });

  test('rejects invalid fallback order and transport timeout', () => {
    expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '0', fallbackProviderIds: ['web/tavily', 'web/tavily'] }).success).toBe(false);
    expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '0', selectedProviderId: 'web/tavily', fallbackProviderIds: ['web/tavily'] }).success).toBe(false);
    for (const timeoutSeconds of [0, -1, 301, Infinity]) {
      expect(WebSearchUpdateRequestSchema.safeParse({ expectedRevision: '0', timeoutSeconds }).success).toBe(false);
    }
  });

  test('cannot label a persisted mutation with a failed active worker as applied', () => {
    const partial = { state, status: 'partial', persistence: 'persisted', workers: [applied, failed] };
    expect(WebSearchMutationResultSchema.parse(partial)).toEqual(partial);
    expect(WebSearchMutationResultSchema.safeParse({ ...partial, status: 'applied' }).success).toBe(false);
    expect(WebSearchMutationResultSchema.safeParse({ ...partial, workers: [applied, applied] }).success).toBe(false);
    expect(WebSearchMutationResultSchema.safeParse({ ...partial, workers: [{ ...failed, code: null }] }).success).toBe(false);
    expect(WebSearchMutationResultSchema.safeParse({ ...partial, persistence: 'failed' }).success).toBe(false);
    expect(WebSearchMutationResultSchema.safeParse({ state, status: 'applied', persistence: 'persisted', workers: [] }).success).toBe(true);
    expect(WebSearchMutationResultSchema.safeParse({ state, status: 'failed', persistence: 'failed', workers: [] }).success).toBe(true);
  });
});
