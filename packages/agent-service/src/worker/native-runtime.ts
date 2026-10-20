import { join } from 'node:path';
import { resolveProfileEnv, setAgentDir, setProfile } from '@oh-my-pi/pi-utils';
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
    if (resolved.bound) return resolved.credential?.apiKey;
    return super.getApiKey(model, sessionId, options);
  }

  override async getApiKeyWithCredentialForProvider(
    provider: string,
    sessionId?: string,
    options?: AuthApiKeyOptions,
  ): Promise<ResolvedApiKey | undefined> {
    const resolved = await this.resolveBoundCredential(provider, sessionId, options);
    if (resolved.bound) return resolved.credential;
    return super.getApiKeyWithCredentialForProvider(provider, sessionId, options);
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
}

export async function openNativeRuntime(input: { cwd: string; agentDirectory: string }): Promise<NativeWorkerRuntime> {
  // setAgentDir clears native profile selection; retain an explicitly selected native profile instead.
  // Plugin storage belongs to that resolver's config/XDG root, never dirname(agentDirectory).
  const profile = resolveProfileEnv(process.env.OMP_PROFILE, process.env.PI_PROFILE);
  if (profile) setProfile(profile);
  else setAgentDir(input.agentDirectory);
  const settings = await Settings.init({ cwd: input.cwd, agentDir: input.agentDirectory });
  const authStorage = await discoverAuthStorage(input.agentDirectory, { cwd: input.cwd, settings });
  try {
    const modelsPath = join(input.agentDirectory, 'models.yml');
    let currentNativeSessionId = () => '';
    const modelRegistry: ModelRegistry = new NativeModelRegistry(
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
    });
    // Startup uses native local/cache discovery only; network entry is authorized at use.
    await modelRegistry.refresh('offline');
    return {
      authStorage,
      modelRegistry,
      models,
      settings,
      modelsPath,
      effectiveEditMode: activeModel => resolveEditMode({ settings, getActiveModelString: () => activeModel }),
      bindSessionId: next => { currentNativeSessionId = next; },
    };
  } catch (error) { authStorage.close(); throw error; }
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
