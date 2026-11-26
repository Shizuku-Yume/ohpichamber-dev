import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { ProjectionError } from '../projection/journal.ts';
import type { CompletionWorkerBootstrap, WorkerPolicyRequest } from '../protocol.ts';
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
    const provider = Bun.serve({
      hostname: '127.0.0.1', port: 0, fetch: () => {
        providerRequests++;
        return Response.json({ error: { message: 'Invalid API key', type: 'invalid_request_error', code: 'invalid_api_key' } }, { status: 401 });
      }
    });
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
        await setup.models.configureModel({
          expectedRevision: '1', model: {
            modelId, provider: providerId, name: 'Completion policy model', modalities: ['text'],
            contextWindow: 65536, maxOutputTokens: 256, reasoningEffortSupported: false,
            reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
          }
        }, '2');
        const credential = await new NativeCredentials(setup.authStorage, setup.models, workspaceId).write({
          expectedRevision: '2', providerId, credential: { method: 'api-key', apiKey: 'completion-fixture-key' },
        }, '3');
        if (credential.auth.status !== 'configured') throw new Error('Fixture credential was not configured');
        await setup.models.configureProvider({
          expectedRevision: '3', configuration: {
            ...configuration, credentialRef: credential.auth.credentialRef,
          }
        }, '4');
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
        type: 'completion', operation: {
          type: 'completion.start', request: {
            completionId: 'completion-policy-request', workspaceId,
            selection: { providerId, modelId }, prompt: 'hello', format: { kind: 'text' },
            overflow: 'reject', variant: null, reasoningEffort: null,
          }
        },
      })).rejects.toBe(policyError);
      const selection = { providerId, modelId: 'unavailable-model' };
      expect(await worker.operation({
        type: 'completion', operation: {
          type: 'completion.start', request: {
            completionId: 'completion-missing-model', workspaceId,
            selection, prompt: 'hello', format: { kind: 'text' },
            overflow: 'reject', variant: null, reasoningEffort: null,
          }
        },
      })).toMatchObject({
        type: 'completion', result: {
          type: 'completion.result', result: {
            completionId: 'completion-missing-model', selection, status: 'failed',
            error: { code: 'MODEL_UNAVAILABLE', retryable: false },
          }
        }
      });
      expect(providerRequests).toBe(0);
      refusal = undefined;
      const providerFailure = await worker.operation({
        type: 'completion', operation: {
          type: 'completion.start', request: {
            completionId: 'completion-provider-failure', workspaceId,
            selection: { providerId, modelId }, prompt: 'hello', format: { kind: 'text' },
            overflow: 'reject', variant: null, reasoningEffort: null,
          }
        },
      });
      expect(providerFailure).toMatchObject({
        type: 'completion', result: {
          type: 'completion.result', result: {
            completionId: 'completion-provider-failure', status: 'failed',
            error: { code: 'PROVIDER_UNAVAILABLE', retryable: true },
          }
        }
      });
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
    worker = await StatelessWorker.open(bootstrap, async () => { });
    await worker.operation({
      type: 'catalog', revision: '1', operation: {
        type: 'catalog.provider.configure', request: {
          expectedRevision: '0', configuration: {
            providerId: 'handoff-proxy', name: 'Handoff proxy', endpoint: 'http://127.0.0.1:18080/v1',
            protocol: 'chat-completions', credentialRef: null,
          }
        },
      }
    });
    const imported = await worker.operation({
      type: 'catalog', revision: '2', operation: {
        type: 'catalog.credential.handoff', request: {
          workspaceId: bootstrap.workspaceId, agentDirectoryId: bootstrap.agentDirectoryId,
          expectedRevision: '1', selection: {
            providerId: 'handoff-proxy', source: 'selected-file', credentialType: 'key',
            file: { format: 'opencode-auth-entry', content: JSON.stringify({ type: 'api', key: 'stateless-fixture-key' }) },
          },
        },
      }
    });
    if (imported.type !== 'catalog' || imported.result.type !== 'catalog.credential.handed-off') {
      throw new Error('Expected a native credential handoff result');
    }
    expect(imported.result.result.outcome.status).toBe('imported');
    expect(JSON.stringify(imported)).not.toContain('stateless-fixture-key');
    const credentialRef = imported.result.result.outcome.credentialRef;
    if (!credentialRef) throw new Error('Expected the persisted credential reference');
    await worker.close();
    worker = await StatelessWorker.open({ ...bootstrap, workerGeneration: 'cold-handoff-generation', catalogRevision: '2' }, async () => { });
    expect(await worker.operation({
      type: 'catalog', revision: '2', operation: {
        type: 'catalog.credential.resolve', request: {
          workspaceId: bootstrap.workspaceId, agentDirectoryId: bootstrap.agentDirectoryId,
          providerId: 'handoff-proxy', credentialRef, purpose: 'quota',
        },
      }
    })).toMatchObject({
      type: 'catalog', result: {
        type: 'catalog.credential.resolved', result: {
          credential: { type: 'api_key', key: 'stateless-fixture-key' },
        }
      }
    });
  } finally {
    await worker?.close();
    await rm(root, { recursive: true, force: true });
  }
});
test('the stateless workspace catalog reports runtime tool metadata and real tiers, including Host and MCP tools', async () => {
  const root = await mkdtemp(join(tmpdir(), 'stateless-tools-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });

  const bootstrap: CompletionWorkerBootstrap = {
    type: 'completion.bootstrap',
    workerGeneration: 'tools-catalog-gen',
    authorizationRootId: 'tools-catalog-root',
    workspaceId: 'tools-workspace',
    projectId: 'tools-project',
    cwd,
    agentDirectory,
    agentDirectoryId: 'agent',
    catalogRevision: '0',
    mcpConfigPath: join(cwd, '.omp', 'mcp.json'),
    hostTools: {
      openchamber: true,
      web: true,
      openchamber_workflow: true,
      notify: false,
    },
  };

  let worker: StatelessWorker | undefined;
  try {
    worker = await StatelessWorker.open(bootstrap, async () => ({ allowed: true }));
    const res = await worker.operation({ type: 'tools.catalog' });
    if (res.type !== 'tools.catalog') throw new Error('Expected tools.catalog result');
    const tools = res.catalog.tools;
    expect(res.catalog.workspaceId).toBe('tools-workspace');

    // 1. ast_grep has real tier 'read'
    const astGrep = tools.find((t) => t.name === 'ast_grep');
    expect(astGrep).toBeDefined();
    expect(astGrep?.tier).toBe('read');
    expect(astGrep?.label).toBe('AST Grep');
    expect(astGrep?.description.length).toBeGreaterThan(0);

    // 2. ast_edit has real tier 'write'
    const astEdit = tools.find((t) => t.name === 'ast_edit');
    expect(astEdit).toBeDefined();
    expect(astEdit?.tier).toBe('write');
    expect(astEdit?.label).toBe('AST Edit');
    expect(astEdit?.description.length).toBeGreaterThan(0);

    // 3. Host tools are included and have tier 'exec'
    const openchamber = tools.find((t) => t.name === 'openchamber');
    expect(openchamber).toBeDefined();
    expect(openchamber?.tier).toBe('exec');
    expect(openchamber?.availability).toBe(true);
    expect(openchamber?.description.length).toBeGreaterThan(0);

    const web = tools.find((t) => t.name === 'web');
    expect(web).toBeDefined();
    expect(web?.tier).toBe('exec');
    expect(web?.availability).toBe(true);
    const workflow = tools.find((t) => t.name === 'openchamber_workflow');
    expect(workflow).toBeDefined();
    expect(workflow?.tier).toBe('exec');
    expect(workflow?.availability).toBe(true);

    const notify = tools.find((t) => t.name === 'notify');
    expect(notify).toBeDefined();
    expect(notify?.tier).toBe('exec');
    expect(notify?.availability).toBe(false);
  } finally {
    await worker?.close();
    await rm(root, { recursive: true, force: true });
  }
});

const IMAGE_GENERATION_FIXTURE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * An image generation workspace: one credential-backed image model whose
 * endpoint is a loopback capture server, so a test can count the provider
 * requests a generation actually sends.
 */
async function openImageGenerationFixture(authorize: (request: WorkerPolicyRequest) => Promise<void>) {
  let providerRequests = 0;
  const provider = Bun.serve({
    hostname: '127.0.0.1', port: 0, fetch: () => {
      providerRequests++;
      return Response.json({
        created: Date.now(),
        data: [{ b64_json: IMAGE_GENERATION_FIXTURE_PNG }],
      });
    }
  });
  const root = await mkdtemp(join(tmpdir(), 'image-policy-'));
  const cwd = join(root, 'workspace');
  const agentDirectory = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  const providerId = 'image-policy-provider';
  const modelId = 'image-policy-model';
  const workspaceId = 'image-policy-workspace';
  const endpoint = new URL('/v1', provider.url).href;
  // The credential sits in the provider configuration itself, so a Host refusal
  // is the only thing standing between the model and a minted key.
  await writeFile(join(agentDirectory, 'models.yml'), `
providers:
  ${providerId}:
    api: openai-responses
    baseUrl: ${endpoint}
    apiKey: image-policy-fixture-key
    models:
      - id: ${modelId}
        name: Image policy model
        kind: image
        api: openai-images
        input: [text]
`);
  const bootstrap: CompletionWorkerBootstrap = {
    type: 'completion.bootstrap', workerGeneration: 'image-policy-generation',
    authorizationRootId: 'image-policy-owner',
    workspaceId, projectId: 'image-policy-project', cwd,
    agentDirectory, agentDirectoryId: 'image-policy-agent', catalogRevision: '0',
  };
  const worker = await StatelessWorker.open(bootstrap, authorize);
  return {
    worker, workspaceId, providerId, modelId, endpoint,
    providerRequests: () => providerRequests,
    async close() {
      await worker.close();
      provider.stop(true);
      await rm(root, { recursive: true, force: true });
    },
  };
}

function imageGenerationOperation(workspaceId: string, providerId: string, modelId: string) {
  return {
    type: 'catalog' as const, revision: '1', operation: {
      type: 'catalog.image.generate' as const, request: {
        workspaceId,
        selection: { providerId, modelId },
        prompt: 'Draw a cat',
      },
    },
  };
}

test('image generation with provider.use refused sends nothing to the provider and surfaces the Host refusal', async () => {
  const hostRequests: WorkerPolicyRequest[] = [];
  const fixture = await openImageGenerationFixture(async request => {
    hostRequests.push(request);
    if (request.type === 'tool' && request.toolName === 'provider.use') {
      throw new ProjectionError(403, 'UNAUTHORIZED', 'The workspace has no enabled image-policy-provider provider at the image endpoint');
    }
  });
  try {
    const error = await fixture.worker.operation(imageGenerationOperation(fixture.workspaceId, fixture.providerId, fixture.modelId))
      .then(() => undefined, (rejection) => rejection);
    if (!(error instanceof ProjectionError)) throw new Error('Image generation did not surface the Host refusal');
    expect(error.message).toContain('The workspace has no enabled image-policy-provider provider at the image endpoint');
    expect(fixture.providerRequests()).toBe(0);
    const providerUses = hostRequests.filter(request => request.type === 'tool' && request.toolName === 'provider.use');
    expect(providerUses).toHaveLength(1);
    const use = providerUses[0];
    if (use?.type !== 'tool') throw new Error('Expected a provider.use tool request');
    expect(use.input).toMatchObject({
      providerId: fixture.providerId,
      modelId: fixture.modelId,
      endpoint: fixture.endpoint,
      purpose: 'image',
    });
    // Generation is a provider use, never a credential entry: no provider-entry
    // grant may be requested for it.
    expect(hostRequests.some(request => request.type === 'provider-entry')).toBe(false);
  } finally {
    await fixture.close();
  }
});

test('image generation with provider.use admitted reaches the provider', async () => {
  const hostRequests: WorkerPolicyRequest[] = [];
  const fixture = await openImageGenerationFixture(async request => { hostRequests.push(request); });
  try {
    const result = await fixture.worker.operation(imageGenerationOperation(fixture.workspaceId, fixture.providerId, fixture.modelId));
    expect(result).toMatchObject({
      type: 'catalog', result: {
        type: 'catalog.image.generated', result: {
          model: { providerId: fixture.providerId, modelId: fixture.modelId },
          images: [{ data: IMAGE_GENERATION_FIXTURE_PNG, mimeType: 'image/png' }],
        },
      },
    });
    expect(fixture.providerRequests()).toBe(1);
    const providerUses = hostRequests.filter(request => request.type === 'tool' && request.toolName === 'provider.use');
    expect(providerUses).toHaveLength(1);
    const use = providerUses[0];
    if (use?.type !== 'tool') throw new Error('Expected a provider.use tool request');
    expect(use.input).toMatchObject({
      providerId: fixture.providerId,
      modelId: fixture.modelId,
      endpoint: fixture.endpoint,
      purpose: 'image',
    });
  } finally {
    await fixture.close();
  }
});
