import { describe, expect, test } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { z } from 'zod';

import { hostMeetsOpenChamberEngine } from './host-version.ts';

const examples = new URL('../examples/', import.meta.url);
const webPackage = new URL('../../web/package.json', import.meta.url);

const appPackageSchema = z.object({ version: z.string() });
const exampleManifestSchema = z.object({
  openchamber: z.object({
    engines: z.object({ openchamber: z.string() }).optional(),
  }).optional(),
});

describe('SDK example engine floors', () => {
  test('every example manifest floor is satisfied by the app version', async () => {
    const app = appPackageSchema.parse(JSON.parse(await readFile(webPackage, 'utf8')));
    const floors: string[] = [];
    for (const entry of await readdir(examples, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = exampleManifestSchema.parse(JSON.parse(await readFile(new URL(`${entry.name}/package.json`, examples), 'utf8')));
      const floor = manifest.openchamber?.engines?.openchamber;
      if (floor === undefined) continue;
      floors.push(`${entry.name}: ${floor}`);
      expect(hostMeetsOpenChamberEngine(app.version, floor), `${entry.name} floor ${floor} vs app ${app.version}`).toBe(true);
    }
    expect(floors.length).toBeGreaterThan(0);
  });
});
