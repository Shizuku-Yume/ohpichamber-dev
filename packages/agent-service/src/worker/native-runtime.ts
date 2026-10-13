import { join } from 'node:path';
import { setAgentDir } from '@oh-my-pi/pi-utils';
import { getOAuthProviders } from '@oh-my-pi/pi-ai';
import { discoverAuthStorage } from '@oh-my-pi/pi-coding-agent/sdk';
import type { AuthStorage } from '@oh-my-pi/pi-coding-agent/session/auth-storage';
import { ModelRegistry } from '@oh-my-pi/pi-coding-agent/config/model-registry';
import { Settings } from '@oh-my-pi/pi-coding-agent/config/settings';
import type { EffectiveExtensionRoots } from '@oh-my-pi/pi-coding-agent/capability/types';
import { cfgDisabledExtensions, cfgExtensions, cfgSkills } from '@oh-my-pi/pi-coding-agent/extensibility/settings';
import type { LoadSkillsOptions } from '@oh-my-pi/pi-coding-agent/extensibility/skills';
import type { NativeModelsContext } from './catalog-models.ts';

export interface NativeWorkerRuntime {
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
  settings: Settings;
  modelsPath: string;
}

export async function openNativeRuntime(input: { cwd: string; agentDirectory: string }): Promise<NativeWorkerRuntime> {
  setAgentDir(input.agentDirectory);
  const settings = await Settings.init({ cwd: input.cwd, agentDir: input.agentDirectory });
  const authStorage = await discoverAuthStorage(input.agentDirectory, { cwd: input.cwd, settings });
  try {
    const modelsPath = join(input.agentDirectory, 'models.yml');
    const modelRegistry = new ModelRegistry(authStorage, modelsPath, { settings });
    // Startup uses native local/cache discovery only; network entry is authorized at use.
    await modelRegistry.refresh('offline');
    return { authStorage, modelRegistry, settings, modelsPath };
  } catch (error) { authStorage.close(); throw error; }
}

export function nativeModelsContext(runtime: NativeWorkerRuntime, currentNativeSessionId: () => string): NativeModelsContext {
  return { ...runtime, currentNativeSessionId, oauthProviderIds: () => new Set(getOAuthProviders().filter(provider => provider.available).map(provider => provider.id)) };
}

export function nativeExtensionRoots(settings: Settings): EffectiveExtensionRoots {
  return { explicit: [], mode: 'explicit-only', configured: cfgExtensions.get(settings), configuredLevel: settings.extensionsSourceLevel() };
}

export function nativeSkillOptions(settings: Settings): LoadSkillsOptions {
  return { ...cfgSkills.get(settings), disabledExtensions: cfgDisabledExtensions.get(settings), extensionRoots: nativeExtensionRoots(settings) };
}
