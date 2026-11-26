import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { BUILTIN_TOOL_NAMES } from '@oh-my-pi/pi-coding-agent/tools/builtin-names';
import { captureNativePolicy } from './native-policy-snapshot.ts';
import { nativeExtensionRoots, openNativeRuntime, type NativeWorkerRuntime } from './native-runtime.ts';
import { NativeAgents } from './catalog-agents.ts';

describe('captureNativePolicy endpoint resolution', () => {
  test('includes model.baseUrl and provider.endpoint in authorized providers list', async () => {
    const input = {
      projectId: 'proj-1',
      workspaceId: 'ws-1',
      cwd: '/workspace',
      agentDirectory: '/agent',
      agentDirectoryId: 'ad-1',
    };

    const mockRuntime = {
      models: {
        readModels: async () => ({
          workspaceId: 'ws-1',
          revision: '1',
          models: [
            { provider: 'CLIProxyAPI', modelId: 'gpt-6-astra', enabled: true },
            { provider: 'anthropic', modelId: 'claude-3-5-sonnet', enabled: true },
          ],
          imageModels: [
            { provider: 'image-only', modelId: 'image-only-model', name: 'Image only', enabled: true },
            { provider: 'disabled-image', modelId: 'disabled-image-model', name: 'Disabled image', enabled: false },
          ],
        }),
        readProviders: async () => ({
          workspaceId: 'ws-1',
          revision: '1',
          providers: [
            { providerId: 'CLIProxyAPI', endpoint: 'https://cli.example.com/v1' },
            { providerId: 'anthropic', endpoint: 'https://api.anthropic.com' },
          ],
        }),
      },
      modelRegistry: {
        getAll: () => [
          {
            id: 'gpt-6-astra',
            provider: 'CLIProxyAPI',
            baseUrl: 'https://cli.example.com/backend-api',
          },
          {
            id: 'claude-3-5-sonnet',
            provider: 'anthropic',
          },
          {
            id: 'image-only-model',
            provider: 'image-only',
            baseUrl: 'https://image-only.example/v1',
          },
          {
            id: 'disabled-image-model',
            provider: 'disabled-image',
          },
        ],
      },
    } as unknown as NativeWorkerRuntime;

    const mockAgents = {
      read: async () => ({
        workspaceId: 'ws-1',
        revision: '1',
        agents: [],
      }),
    } as unknown as NativeAgents;

    const snapshot = await captureNativePolicy(input, mockRuntime, mockAgents, []);
    expect(snapshot.providers.length).toBeGreaterThanOrEqual(2);

    // Verify model-specific baseUrl is authorized for gpt-6-astra
    const astraCustom = snapshot.providers.find(
      p => p.providerId === 'CLIProxyAPI' && p.modelId === 'gpt-6-astra' && p.endpoint === 'https://cli.example.com/backend-api'
    );
    expect(astraCustom).toBeDefined();

    // Verify provider-level fallback endpoint is NOT permitted when model has explicit baseUrl (fail-closed)
    const astraProvider = snapshot.providers.find(
      p => p.providerId === 'CLIProxyAPI' && p.modelId === 'gpt-6-astra' && p.endpoint === 'https://cli.example.com/v1'
    );
    expect(astraProvider).toBeUndefined();

    // Verify model without custom baseUrl uses provider.endpoint
    const sonnet = snapshot.providers.find(
      p => p.providerId === 'anthropic' && p.modelId === 'claude-3-5-sonnet'
    );
    expect(sonnet).toBeDefined();
    expect(sonnet?.endpoint).toBe('https://api.anthropic.com');

    // Enabled image models travel as their own rows; disabled ones never do,
    // and neither kind reaches the chat providers list.
    const imageOnly = snapshot.imageProviders.find(
      p => p.providerId === 'image-only' && p.modelId === 'image-only-model'
    );
    expect(imageOnly).toBeDefined();
    expect(imageOnly?.endpoint).toBe('https://image-only.example/v1');
    expect(snapshot.imageProviders.some(p => p.providerId === 'disabled-image')).toBe(false);
    expect(snapshot.providers.some(p => p.providerId === 'image-only' || p.providerId === 'disabled-image')).toBe(false);
    expect(snapshot.imageProviders.some(p => p.providerId === 'CLIProxyAPI' || p.providerId === 'anthropic')).toBe(false);
  });
});

beforeEach(resetSettingsForTest);
afterEach(resetSettingsForTest);

describe('captureNativePolicy with a real native runtime', () => {
  test('carries an enabled image generator whose provider has no chat model into imageProviders', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-policy-image-'));
    const cwd = join(root, 'workspace');
    const agentDirectory = join(root, 'agent');
    await mkdir(cwd, { recursive: true });
    await mkdir(agentDirectory, { recursive: true });
    const runtime = await openNativeRuntime({ cwd, agentDirectory });
    try {
      // A workspace whose only configured model is an image generator: the
      // provider serves no chat model at all, so `providers` must stay empty
      // while the image row still reaches the Host policy.
      await writeFile(join(agentDirectory, 'models.yml'), `
providers:
  image-only-loopback:
    api: openai-responses
    baseUrl: http://127.0.0.1:18081/v1
    apiKey: image-snapshot-fixture-key
    models:
      - id: image-only-model
        name: Image only model
        kind: image
        api: openai-images
        input: [text]
`, 'utf8');
      const agents = new NativeAgents({
        cwd, agentDirectory, models: runtime.models, modelRegistry: runtime.modelRegistry, settings: runtime.settings,
        extensionRoots: nativeExtensionRoots(runtime.settings), availableToolNames: () => BUILTIN_TOOL_NAMES,
      });
      const snapshot = await captureNativePolicy(
        { projectId: 'project_1', workspaceId: 'workspace_1', cwd, agentDirectory, agentDirectoryId: 'source' },
        runtime, agents, [],
      );
      const row = snapshot.imageProviders.find(candidate => candidate.providerId === 'image-only-loopback' && candidate.modelId === 'image-only-model');
      expect(row).toBeDefined();
      expect(row?.endpoint).toBe('http://127.0.0.1:18081/v1');
      expect(snapshot.providers.some(candidate => candidate.providerId === 'image-only-loopback')).toBe(false);
    } finally {
      runtime.authStorage.close();
      resetSettingsForTest();
      await rm(root, { recursive: true, force: true });
    }
  });
});
