import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SDK_PACKAGE_NAME = '@oh-my-pi/pi-coding-agent';
const SdkPackageManifestSchema = z.object({ name: z.literal(SDK_PACKAGE_NAME), version: z.string().min(1) });

const readPackageVersionAt = (startDirectory: string): string | undefined => {
  let current = startDirectory;
  for (let depth = 0; depth < 24; depth += 1) {
    try {
      const parsed = SdkPackageManifestSchema.safeParse(JSON.parse(readFileSync(join(current, 'package.json'), 'utf8')));
      if (parsed.success) return parsed.data.version;
    } catch { /* not the owning package directory: keep walking upward */ }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
  return undefined;
};

export const resolveOmpSdkVersion = (resolve: (specifier: string) => string = (specifier) => import.meta.resolve(specifier)): string | undefined => {
  try {
    const resolved = resolve(SDK_PACKAGE_NAME);
    const filePath = resolved.startsWith('file://') ? fileURLToPath(resolved) : resolved;
    return readPackageVersionAt(dirname(filePath));
  } catch {
    return undefined;
  }
};

let cachedOmpVersion: string | undefined;
let ompVersionResolved = false;
export const getOmpSdkVersion = (): string | undefined => {
  if (!ompVersionResolved) {
    cachedOmpVersion = resolveOmpSdkVersion();
    ompVersionResolved = true;
  }
  return cachedOmpVersion;
};
