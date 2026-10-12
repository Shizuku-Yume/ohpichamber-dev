/**
 * Generates `settings-registry.json` — the plain-data view of the registry the
 * Host Gateway consumes as plain ESM data without a bundler. The checked-in
 * snapshot must match the shared UI registry.
 *
 *   bun run settings-registry:generate
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSettingsRegistrySnapshot } from './registry';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..', '..', '..');

const target = resolve(repoRoot, 'packages/web/server/lib/host/settings-registry.json');
const rendered = `${JSON.stringify(buildSettingsRegistrySnapshot(), null, 2)}\n`;
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, rendered, 'utf8');
console.log(`wrote ${target}`);
