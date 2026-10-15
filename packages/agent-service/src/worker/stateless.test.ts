import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ProjectionError } from '../projection/journal.ts';
import type { CompletionWorkerBootstrap } from '../protocol.ts';
import { StatelessWorker } from './stateless.ts';
import { openNativeRuntime } from './native-runtime.ts';
import { NativeCredentials } from './catalog-credentials.ts';

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

for (const policyError of [
  new ProjectionError(403, 'UNAUTHORIZED', 'Host policy refused provider access'),
  new ProjectionError(503, 'SERVICE_UNAVAILABLE', 'Host policy is unavailable'),
]) {
  test(`completion preserves Host policy ${policyError.status} ${policyError.code} through selection and provider catches`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'completion-policy-'));
    let providerRequests = 0;
    const provider = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => {
      providerRequests++;
      return Response.json({ error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } }, { status: 401 });
    } });
    let worker: StatelessWorker | undefined;
    try {
      const cwd = join(root, 'workspace');
      const agentDirectory = join(root, 'agent');
      await mkdir(cwd, { recursive: true });
      await mkdir(agentDirectory, { recursive: true });
      const providerId = 'completion-policy-provider';
      const modelId = 'completion-policy-model';
      const workspaceId = 'completion-policy-workspace';
      const configuration = {
        providerId, name: 'Completion policy provider', endpoint: new URL('/v1', provider.url).href,
        protocol: 'chat-completions' as const, credentialRef: null,
      };
      const setup = await openNativeRuntime({ cwd, agentDirectory });
      try {
        await setup.models.configureProvider({ expectedRevision: '0', configuration }, '1');
        await setup.models.configureModel({ expectedRevision: '1', model: {
          modelId, provider: providerId, name: 'Completion policy model', modalities: ['text'],
          contextWindow: 65536, maxOutputTokens: 256, reasoningEffortSupported: false,
          reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
        } }, '2');
        const credential = await new NativeCredentials(setup.authStorage, setup.models, workspaceId).write({
          expectedRevision: '2', providerId, credential: { method: 'api-key', apiKey: 'completion-fixture-key' },
        }, '3');
        if (credential.auth.status !== 'configured') throw new Error('Fixture credential was not configured');
        await setup.models.configureProvider({ expectedRevision: '3', configuration: {
          ...configuration, credentialRef: credential.auth.credentialRef,
        } }, '4');
      } finally {
        setup.authStorage.close();
      }
      const bootstrap: CompletionWorkerBootstrap = {
        type: 'completion.bootstrap', workerGeneration: 'completion-policy-generation',
        authorizationRootId: 'completion-policy-owner',
        workspaceId, projectId: 'completion-policy-project', cwd,
        agentDirectory, agentDirectoryId: 'completion-policy-agent', catalogRevision: '4',
      };
      let refusal: ProjectionError | undefined = policyError;
      worker = await StatelessWorker.open(bootstrap, async () => { if (refusal) throw refusal; });
      await expect(worker.operation({
        type: 'completion', operation: { type: 'completion.start', request: {
          completionId: 'completion-policy-request', workspaceId,
          selection: { providerId, modelId }, prompt: 'hello', format: { kind: 'text' },
          overflow: 'reject', variant: null, reasoningEffort: null,
        } },
      })).rejects.toBe(policyError);
      const selection = { providerId, modelId: 'unavailable-model' };
      expect(await worker.operation({
        type: 'completion', operation: { type: 'completion.start', request: {
          completionId: 'completion-missing-model', workspaceId,
          selection, prompt: 'hello', format: { kind: 'text' },
          overflow: 'reject', variant: null, reasoningEffort: null,
        } },
      })).toMatchObject({ type: 'completion', result: { type: 'completion.result', result: {
        completionId: 'completion-missing-model', selection, status: 'failed',
        error: { code: 'MODEL_UNAVAILABLE', retryable: false },
      } } });
      expect(providerRequests).toBe(0);
      refusal = undefined;
      const providerFailure = await worker.operation({
        type: 'completion', operation: { type: 'completion.start', request: {
          completionId: 'completion-provider-failure', workspaceId,
          selection: { providerId, modelId }, prompt: 'hello', format: { kind: 'text' },
          overflow: 'reject', variant: null, reasoningEffort: null,
        } },
      });
      expect(providerFailure).toMatchObject({ type: 'completion', result: { type: 'completion.result', result: {
        completionId: 'completion-provider-failure', status: 'failed',
        error: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
      } } });
      expect(providerRequests).toBeGreaterThan(0);
    } finally {
      await worker?.close();
      await provider.stop(true);
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('workspace credential handoff persists an SDK credential for private resolution after cold reopen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stateless-handoff-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const bootstrap: CompletionWorkerBootstrap = {
    type: 'completion.bootstrap', workerGeneration: 'handoff-generation',
    authorizationRootId: 'handoff-owner',
    workspaceId: 'handoff-workspace', projectId: 'handoff-project', cwd,
    agentDirectory, agentDirectoryId: 'handoff-agent', catalogRevision: '0',
  };
  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => {});
    await worker.operation({ type: 'catalog', revision: '1', operation: {
      type: 'catalog.provider.configure', request: { expectedRevision: '0', configuration: {
        providerId: 'handoff-proxy', name: 'Handoff proxy', endpoint: 'http://127.0.0.1:18080/v1',
        protocol: 'chat-completions', credentialRef: null,
      } },
    } });
    const imported = await worker.operation({ type: 'catalog', revision: '2', operation: {
      type: 'catalog.credential.handoff', request: {
        workspaceId: bootstrap.workspaceId, agentDirectoryId: bootstrap.agentDirectoryId,
        expectedRevision: '1', selection: {
          providerId: 'handoff-proxy', source: 'selected-file', credentialType: 'key',
          file: { format: 'opencode-auth-entry', content: JSON.stringify({ type: 'api', key: 'stateless-fixture-key' }) },
        },
      },
    } });
    if (imported.type !== 'catalog' || imported.result.type !== 'catalog.credential.handed-off') {
      throw new Error('Expected a native credential handoff result');
    }
    expect(imported.result.result.outcome.status).toBe('imported');
    expect(JSON.stringify(imported)).not.toContain('stateless-fixture-key');
    const credentialRef = imported.result.result.outcome.credentialRef;
    if (!credentialRef) throw new Error('Expected the persisted credential reference');
    await worker.close();
    worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'cold-handoff-generation', catalogRevision: '2' }, async () => {});
    expect(await worker.operation({ type: 'catalog', revision: '2', operation: {
      type: 'catalog.credential.resolve', request: {
        workspaceId: bootstrap.workspaceId, agentDirectoryId: bootstrap.agentDirectoryId,
        providerId: 'handoff-proxy', credentialRef, purpose: 'quota',
      },
    } })).toMatchObject({ type: 'catalog', result: { type: 'catalog.credential.resolved', result: {
      credential: { type: 'api_key', key: 'stateless-fixture-key' },
    } } });
  } finally {
    await worker?.close();
    await rm(root, { recursive: true, force: true });
  }
});
