import type fsPromises from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { isString } from '../shared/guards.js';
import type { JsonObject, JsonValue } from '../shared/json-values.js';

export type OpenCodePluginDelivery = 'file' | 'restart' | 'none' | 'remote';

export interface OpenCodePluginState {
  external: boolean;
  origin: string | null;
  ownsConfigFile: boolean;
}

export type OpenCodePluginFs = Pick<typeof fsPromises, 'realpath' | 'stat' | 'readFile'>;

const PackageManifestSchema = z.object({
  name: z.string().optional(),
  exports: z.json().optional(),
});
type PackageManifest = z.infer<typeof PackageManifestSchema>;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const isLoopbackOrigin = (origin: string | null): boolean => {
  if (!origin) return true;
  try {
    return LOOPBACK_HOSTS.has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
};

export const openCodePluginDelivery = ({ external, origin, ownsConfigFile }: OpenCodePluginState): OpenCodePluginDelivery => {
  if (external) return isLoopbackOrigin(origin) ? 'none' : 'remote';
  return ownsConfigFile ? 'file' : 'restart';
};

const ENTRY_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'];
const EXPORT_CONDITIONS = new Set(['bun', 'node', 'import', 'default']);

const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const exportedFile = (value: JsonValue | undefined): string | null => {
  if (isString(value)) return value;
  if (!isJsonObject(value)) return null;
  for (const [condition, target] of Object.entries(value)) {
    const file = EXPORT_CONDITIONS.has(condition) ? exportedFile(target) : null;
    if (file) return file;
  }
  return null;
};

const exportTarget = (exported: JsonValue | undefined, subpath: string): string | null => {
  if (isString(exported)) return subpath === '.' ? exportedFile(exported) : null;
  if (!isJsonObject(exported)) return null;
  const bare = !Object.keys(exported).some((key) => key.startsWith('.'));
  return exportedFile(bare ? (subpath === '.' ? exported : undefined) : exported[subpath]);
};

const entryCandidates = (manifest: PackageManifest | null): string[] => {
  if (manifest && isString(manifest.name) && manifest.exports !== undefined) {
    return ['./server', '.']
      .map((subpath) => exportTarget(manifest.exports, subpath))
      .filter((entry): entry is string => Boolean(entry));
  }
  return ['server', 'index'].flatMap((base) => ENTRY_EXTENSIONS.map((extension) => base + extension));
};

const readManifest = async (fsImpl: OpenCodePluginFs, directory: string): Promise<PackageManifest | null> => {
  try {
    const parsed = PackageManifestSchema.safeParse(JSON.parse(await fsImpl.readFile(path.join(directory, 'package.json'), 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

const isFileInside = async (fsImpl: OpenCodePluginFs, directory: string, target: string): Promise<boolean> => {
  try {
    const file = await fsImpl.realpath(path.resolve(directory, target));
    return file.startsWith(directory + path.sep) && (await fsImpl.stat(file)).isFile();
  } catch {
    return false;
  }
};

export const resolveOpenCodePluginFolder = async (
  fsImpl: OpenCodePluginFs,
  packageRoot: string,
  relativePath: string,
): Promise<string | null> => {
  try {
    const rootReal = await fsImpl.realpath(packageRoot);
    const directory = await fsImpl.realpath(path.resolve(rootReal, relativePath));
    if (!directory.startsWith(rootReal + path.sep) || !(await fsImpl.stat(directory)).isDirectory()) return null;
    for (const entry of entryCandidates(await readManifest(fsImpl, directory))) {
      if (await isFileInside(fsImpl, directory, entry)) return directory;
    }
    return null;
  } catch {
    return null;
  }
};
