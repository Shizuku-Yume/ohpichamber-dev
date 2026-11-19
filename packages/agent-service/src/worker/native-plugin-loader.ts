import { join } from 'node:path';
import { getEnabledPlugins, resolvePluginExtensionPaths } from '@oh-my-pi/pi-coding-agent/extensibility/plugins/loader';
import { PluginLocalSource } from './plugin-local-source.ts';

/** Resolve native enabled plugin modules and the confined workspace authoring surface, without evaluating code. */
export async function nativePluginExtensionPaths(cwd: string): Promise<string[]> {
  const [plugins, local] = await Promise.all([
    getEnabledPlugins(cwd),
    new PluginLocalSource(cwd).list(),
  ]);
  return [...new Set([...plugins.flatMap(resolvePluginExtensionPaths), ...local.map(name => join(cwd, '.omp', 'extensions', name))])];
}
