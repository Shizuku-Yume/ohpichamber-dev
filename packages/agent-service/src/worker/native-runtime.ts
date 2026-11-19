import fs from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { JSONC, YAML } from 'bun';
import { getAgentDir, resolveProfileEnv, setAgentDir, setProfile } from '@oh-my-pi/pi-utils';
import { getOAuthProviders, type AuthApiKeyOptions, type ResolvedApiKey } from '@oh-my-pi/pi-ai';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { EffectiveExtensionRoots } from '@oh-my-pi/pi-coding-agent/capability/types';
import { cfgDisabledExtensions, cfgExtensions, cfgSkills } from '@oh-my-pi/pi-coding-agent/extensibility/settings';
import type { LoadSkillsOptions } from '@oh-my-pi/pi-coding-agent/extensibility/skills';
import { NativeModels, type BoundProviderCredentialResolution, type NativeCatalogModel, type NativeModelsContext } from './catalog-models.ts';
import { resolveEditMode } from '@oh-my-pi/pi-coding-agent/utils/edit-mode';
import type { NativePolicyContext } from '../native-policy-protocol.ts';

type BoundCredentialResolver = (
  providerId: string,
  sessionId: string | undefined,
  options?: AuthApiKeyOptions,
) => Promise<BoundProviderCredentialResolution>;

class NativeModelRegistry extends ModelRegistry {
  private readonly providerSecrets = new Set<string>();

  rememberProviderSecrets(values: Iterable<string | undefined>): void {
    for (const value of values) if (value) this.providerSecrets.add(value);
  }

  sanitizeProviderError(text: string): string {
    for (const key of [...this.providerSecrets].sort((left, right) => right.length - left.length)) {
      text = text.split(key).join('[redacted]');
    }
    return text
      .replace(/(authorization["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\r\n]*/gi, '$1[redacted]')
      .replace(/\bbearer\s+[^\s,;"']+/gi, 'Bearer [redacted]')
      .replace(/((?:api[_-]?key|token|secret|password)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[redacted]')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[redacted]');
  }

  constructor(
    authStorage: AuthStorage,
    modelsPath: string,
    settings: Settings,
    private readonly resolveBoundCredential: BoundCredentialResolver,
  ) {
    super(authStorage, modelsPath, { settings });
  }

  override async getApiKey(
    model: NativeCatalogModel,
    sessionId?: string,
    options?: { signal?: AbortSignal },
  ): Promise<string | undefined> {
    const providerOptions: AuthApiKeyOptions = {
      baseUrl: model.baseUrl,
      modelId: model.id,
      signal: options?.signal,
    };
    if (model.accountAccess) providerOptions.accountIds = Object.keys(model.accountAccess);
    const resolved = await this.resolveBoundCredential(model.provider, sessionId, providerOptions);
    const key = resolved.bound ? resolved.credential?.apiKey : await super.getApiKey(model, sessionId, options);
    this.rememberProviderSecrets([key]);
    return key;
  }

  override async getApiKeyWithCredentialForProvider(
    provider: string,
    sessionId?: string,
    options?: AuthApiKeyOptions,
  ): Promise<ResolvedApiKey | undefined> {
    const resolved = await this.resolveBoundCredential(provider, sessionId, options);
    const credential = resolved.bound ? resolved.credential : await super.getApiKeyWithCredentialForProvider(provider, sessionId, options);
    this.rememberProviderSecrets([credential?.apiKey]);
    return credential;
  }
}

export interface NativeWorkerRuntime {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  models: NativeModels;
  settings: Settings;
  modelsPath: string;
  bindSessionId: (currentNativeSessionId: () => string) => void;
  effectiveEditMode: (activeModel?: string) => NativePolicyContext['editMode'];
  sanitizeProviderError: (text: string) => string;
}

export async function openNativeRuntime(input: { cwd: string; agentDirectory: string }): Promise<NativeWorkerRuntime> {
  const profile = resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE);
  if (profile) {
    setProfile(profile);
    const profileAgentDir = resolve(getAgentDir());
    const requestedAgentDir = resolve(input.agentDirectory);
    if (profileAgentDir !== requestedAgentDir) {
      throw new Error(`Profile agent directory mismatch: profile '${profile}' resolved to '${profileAgentDir}', but '${requestedAgentDir}' was requested`);
    }
  } else {
    setAgentDir(input.agentDirectory);
  }
  const { modelsPath } = syncNativeConfigPair(input.agentDirectory);
  const settings = await Settings.init({ cwd: input.cwd, agentDir: input.agentDirectory });
  const authStorage = await discoverAuthStorage(input.agentDirectory, { cwd: input.cwd, settings });
  try {
    let currentNativeSessionId = () => '';
    const modelRegistry = new NativeModelRegistry(
      authStorage,
      modelsPath,
      settings,
      (providerId, sessionId, options): Promise<BoundProviderCredentialResolution> =>
        models.resolveProviderCredential(providerId, sessionId, options),
    );
    const models: NativeModels = new NativeModels({
      modelRegistry,
      authStorage,
      settings,
      modelsPath,
      oauthProviderIds: () => new Set(getOAuthProviders().filter(provider => provider.available).map(provider => provider.id)),
      currentNativeSessionId: () => currentNativeSessionId(),
      rememberProviderSecrets: values => modelRegistry.rememberProviderSecrets(values),
    });
    // Startup uses native local/cache discovery only; network entry is authorized at use.
    await modelRegistry.refresh('offline');
    models.markPoliciesApplied();
    return {
      authStorage,
      modelRegistry,
      models,
      settings,
      modelsPath,
      effectiveEditMode: activeModel => resolveEditMode({ settings, getActiveModelString: () => activeModel }),
      sanitizeProviderError: text => modelRegistry.sanitizeProviderError(text),
      bindSessionId: next => { currentNativeSessionId = next; },
    };
  } catch (error) { authStorage.close(); throw error; }
}
export interface PrewarmedRuntimeEntry {
  runtime: NativeWorkerRuntime;
  cwd: string;
  agentDirectory: string;
  pluginExtensionPaths?: string[];
}

let prewarmedRuntimePromise: Promise<PrewarmedRuntimeEntry | undefined> | undefined;

export function prewarmNativeRuntime(input: { cwd: string; agentDirectory: string }): Promise<PrewarmedRuntimeEntry | undefined> {
  if (prewarmedRuntimePromise) return prewarmedRuntimePromise;
  const canonicalCwd = resolve(input.cwd);
  const canonicalAgentDir = resolve(input.agentDirectory);
  prewarmedRuntimePromise = Promise.all([
    openNativeRuntime(input),
    import('@oh-my-pi/pi-coding-agent/sdk'),
    import('@oh-my-pi/pi-coding-agent/session/session-manager'),
    import('@oh-my-pi/pi-coding-agent/tools/bash'),
    import('./native-plugin-loader.ts').then(m => m.nativePluginExtensionPaths(input.cwd)).catch(() => undefined),
  ])
    .then(async ([runtime, , , , pluginExtensionPaths]) => {
      try { await runtime.models.readModels(input.cwd, '0'); } catch { /* best-effort model prewarm */ }
      return { runtime, cwd: canonicalCwd, agentDirectory: canonicalAgentDir, pluginExtensionPaths };
    })
    .catch(() => undefined);
  return prewarmedRuntimePromise;
}

export async function consumePrewarmedNativeRuntime(input: { cwd: string; agentDirectory: string }): Promise<PrewarmedRuntimeEntry | undefined> {
  if (!prewarmedRuntimePromise) return undefined;
  const entry = await prewarmedRuntimePromise;
  prewarmedRuntimePromise = undefined;
  if (!entry) return undefined;
  if (resolve(input.cwd) !== entry.cwd || resolve(input.agentDirectory) !== entry.agentDirectory) {
    try { entry.runtime.authStorage.close(); } catch { /* cleanup on discard */ }
    return undefined;
  }
  return entry;
}

export async function closePrewarmedNativeRuntime(): Promise<void> {
  if (!prewarmedRuntimePromise) return;
  const entry = await prewarmedRuntimePromise;
  prewarmedRuntimePromise = undefined;
  try { entry?.runtime.authStorage.close(); } catch { /* best-effort shutdown cleanup */ }
}

export function nativeModelsContext(
  runtime: NativeWorkerRuntime,
  currentNativeSessionId: () => string,
): NativeModelsContext & { models: NativeModels } {
  runtime.bindSessionId(currentNativeSessionId);
  return { ...runtime, currentNativeSessionId, oauthProviderIds: () => new Set(getOAuthProviders().filter(provider => provider.available).map(provider => provider.id)) };
}

export function nativeExtensionRoots(settings: Settings, explicit: string[] = []): EffectiveExtensionRoots {
  return { explicit, mode: 'explicit-only', configured: cfgExtensions.get(settings), configuredLevel: settings.extensionsSourceLevel() };
}
export function nativeSkillOptions(settings: Settings, explicit: string[] = []): LoadSkillsOptions {
  return { ...cfgSkills.get(settings), disabledExtensions: cfgDisabledExtensions.get(settings), extensionRoots: nativeExtensionRoots(settings, explicit) };
}

export function syncNativeConfigPair(agentDirectory: string): { modelsPath: string } {
  const isAgentPair = basename(agentDirectory) === 'agent';
  const configRoot = isAgentPair ? dirname(agentDirectory) : null;
  const modelsPath = join(agentDirectory, 'models.yml');
  const modelsYaml = join(agentDirectory, 'models.yaml');

  if (isAgentPair && configRoot) {
    try { fs.mkdirSync(agentDirectory, { recursive: true, mode: 0o700 }); } catch { /* ignore */ }

    // Helper: copy file safely without clobbering, ensuring destination is created owner-only (0o600)
    // Root files (~/.omp/*) are legacy inputs; canonical agent files (~/.omp/agent/*) become
    // the sole write authority used by standalone OMP.
    const safeMigrateCopy = (sourcePath: string, destPath: string) => {
      if (fs.existsSync(destPath) || !fs.existsSync(sourcePath)) return;
      try {
        const content = fs.readFileSync(sourcePath);
        fs.writeFileSync(destPath, content, { mode: 0o600, flag: 'wx' });
      } catch { /* ignore migration collision/error */ }
    };

    // 1. config.yml adoption: copy from root once if root exists and agent does not
    const agentConfigYml = join(agentDirectory, 'config.yml');
    const rootConfigYml = join(configRoot, 'config.yml');
    safeMigrateCopy(rootConfigYml, agentConfigYml);

    // 2. models.yml adoption: copy/migrate from root once if agent has neither models.yml nor models.yaml
    if (!fs.existsSync(modelsPath) && !fs.existsSync(modelsYaml)) {
      const rootModelsYml = join(configRoot, 'models.yml');
      const rootModelsYaml = join(configRoot, 'models.yaml');
      const rootModelsJson = join(configRoot, 'models.json');
      if (fs.existsSync(rootModelsYml)) {
        safeMigrateCopy(rootModelsYml, modelsPath);
      } else if (fs.existsSync(rootModelsYaml)) {
        safeMigrateCopy(rootModelsYaml, modelsYaml);
      } else if (fs.existsSync(rootModelsJson)) {
        try {
          const raw = fs.readFileSync(rootModelsJson, 'utf8');
          const parsed = JSONC.parse(raw);
          if (parsed && typeof parsed === 'object') {
            fs.writeFileSync(modelsPath, YAML.stringify(parsed), { mode: 0o600, flag: 'wx' });
          }
        } catch { /* ignore migration error */ }
      }
    }
  }
  return { modelsPath };
}
