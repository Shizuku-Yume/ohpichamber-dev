import crypto from 'node:crypto';
import fs from 'node:fs';
import { z } from 'zod';

import { SpaceError } from './errors.js';
import { FILLER_PROGRAM } from './tools-filler.js';
import type { ToolsFileEntry } from './tools-filler.js';

export const TOOLS_STAGING_PATH = '/tmp/openchamber-fill';

const WEB_TARBALL_NAME = 'ohpichamber.tgz';
const SDK_TARBALL_NAME = 'ohpichamber-sdk.tgz';

const EXACT_VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const REVISION_PATTERN = /^[A-Za-z0-9._-]{0,64}$/;

const packageManifestSchema = z.object({
  version: z.string().optional(),
});

export interface HostToolVersions {
  webVersion: string;
}

export interface RegistryToolsSource {
  kind: 'registry';
  description: string;
  canonical: {
    kind: 'registry';
    packages: { ohpichamber: string };
    revision: string;
  };
  packageJson: string;
  files: ToolsFileEntry[];
}

export interface PackedToolsSource {
  kind: 'packed';
  description: string;
  canonical: {
    kind: 'packed';
    tarballs: Array<{ name: string; sha256: string }>;
    revision: string;
  };
  packageJson: string;
  files: ToolsFileEntry[];
}

export type ToolsSource = RegistryToolsSource | PackedToolsSource;

export interface CreateRegistryToolsSourceOptions {
  webVersion: string;
  revision?: string | undefined;
}

export interface CreatePackedToolsSourceOptions {
  webTarballPath: string;
  sdkTarballPath: string;
  revision?: string | undefined;
}

const requireVersion = (value: string | undefined, what: string): string => {
  if (!value || !EXACT_VERSION_PATTERN.test(value)) {
    throw new SpaceError('invalid_tools_version', `${what} needs an exact version such as 1.2.3, got '${value}'`);
  }
  return value;
};

const sha256 = (bytes: string | Buffer): string => crypto.createHash('sha256').update(bytes).digest('hex');

const packageJsonText = (fields: {
  dependencies: Record<string, string>;
  overrides?: Record<string, string>;
}): string => JSON.stringify({ name: 'openchamber-space-tools', private: true, ...fields });

const madeHere = new WeakSet<ToolsSource>();

const finishSource = <T extends ToolsSource>(source: T): T => {
  Object.freeze(source);
  madeHere.add(source);
  return source;
};

const requireRevision = (value: string): string => {
  if (!REVISION_PATTERN.test(value)) {
    throw new SpaceError('invalid_tools_revision', 'A tools revision may hold only letters, digits, dots, dashes and underscores, 64 at most');
  }
  return value;
};

export function readHostToolVersions(
  packageJsonUrl: URL = new URL('../../../package.json', import.meta.url),
): HostToolVersions {
  let rawManifest: string;
  try {
    rawManifest = fs.readFileSync(packageJsonUrl, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SpaceError('tools_versions_unreadable', `Could not read the package.json of the OhPiChamber server: ${message}`);
  }
  let parsed: z.infer<typeof packageManifestSchema>;
  try {
    parsed = packageManifestSchema.parse(JSON.parse(rawManifest));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SpaceError('tools_versions_unreadable', `Could not read the package.json of the OhPiChamber server: ${message}`);
  }
  return {
    webVersion: requireVersion(parsed.version, 'ohpichamber'),
  };
}

export function createRegistryToolsSource({ webVersion, revision = '' }: CreateRegistryToolsSourceOptions): RegistryToolsSource {
  const packages = {
    ohpichamber: requireVersion(webVersion, 'ohpichamber'),
  };
  return finishSource({
    kind: 'registry',
    description: `web ${webVersion}`,
    canonical: { kind: 'registry', packages, revision: requireRevision(revision) },
    packageJson: packageJsonText({ dependencies: packages }),
    files: [],
  });
}

export function createPackedToolsSource({
  webTarballPath,
  sdkTarballPath,
  revision = '',
}: CreatePackedToolsSourceOptions): PackedToolsSource {
  const read = (filePath: string, what: string): Buffer => {
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SpaceError('tools_tarball_unreadable', `Could not read the packed ${what} package at ${filePath}: ${message}`);
    }
  };
  const files: ToolsFileEntry[] = [
    { name: WEB_TARBALL_NAME, bytes: read(webTarballPath, 'web') },
    { name: SDK_TARBALL_NAME, bytes: read(sdkTarballPath, 'sdk') },
  ];
  return finishSource({
    kind: 'packed',
    description: 'development build',
    canonical: { kind: 'packed', tarballs: files.map((file) => ({ name: file.name, sha256: sha256(file.bytes) })), revision: requireRevision(revision) },
    packageJson: packageJsonText({
      dependencies: {
        ohpichamber: `file:${TOOLS_STAGING_PATH}/${WEB_TARBALL_NAME}`,
        'ohpichamber-sdk': `file:${TOOLS_STAGING_PATH}/${SDK_TARBALL_NAME}`,
      },
      overrides: { 'ohpichamber-sdk': '$ohpichamber-sdk' },
    }),
    files,
  });
}

export function requireToolsSource(source: ToolsSource): ToolsSource {
  if (!source || !madeHere.has(source)) {
    throw new SpaceError('invalid_tools_source', 'The Docker place needs a tools source from createRegistryToolsSource or createPackedToolsSource');
  }
  return source;
}

export function toolsContentKey(source: ToolsSource, image: string): string {
  const description = JSON.stringify({ source: requireToolsSource(source).canonical, image, filler: sha256(FILLER_PROGRAM) });
  return sha256(description).slice(0, 16);
}
