import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNpmRegistryRequest } from './npm-registry-config.js';

let root: string;
let config: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'ohpi-npm-registry-'));
  config = path.join(root, '.npmrc');
  await fs.writeFile(config, '');
  vi.stubEnv('npm_config_userconfig', config);
  vi.stubEnv('npm_config_registry', '');
  vi.stubEnv('npm_config_@scope:registry', '');
  if (process.platform !== 'win32') {
    for (const key of ['NPM_CONFIG_USERCONFIG', 'NPM_CONFIG_REGISTRY', 'NPM_CONFIG_@scope:REGISTRY']) vi.stubEnv(key, '');
  }
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await fs.rm(root, { recursive: true, force: true });
});

describe('Host npm registry requests', () => {
  it('uses the public registry without credentials for an empty config', () => {
    expect(resolveNpmRegistryRequest('@scope/demo')).toEqual({
      url: 'https://registry.npmjs.org/@scope%2Fdemo', headers: {},
    });
  });

  it('uses the scoped registry and longest matching credential prefix', async () => {
    await fs.writeFile(config, [
      'registry=https://fallback.example/',
      '@scope:registry=https://packages.example/private/',
      '//packages.example/:_authToken=fixture-general',
      '//packages.example/private/:_authToken=fixture-scoped',
    ].join('\n'));
    expect(resolveNpmRegistryRequest('@scope/demo', '1.0.0')).toEqual({
      url: 'https://packages.example/private/@scope%2Fdemo/1.0.0',
      headers: { Authorization: 'Bearer fixture-scoped' },
    });
  });

  it('does not forward another registry\'s credentials', async () => {
    await fs.writeFile(config, [
      'registry=https://one.example/',
      '//one.example/:_authToken=fixture-only-one',
      '@scope:registry=https://two.example/',
    ].join('\n'));
    expect(resolveNpmRegistryRequest('@scope/demo').headers).toEqual({});
  });

  it('moves URL credentials to the authorization header', async () => {
    await fs.writeFile(config, 'registry=https://fixture-user:fixture-pass@packages.example/');
    expect(resolveNpmRegistryRequest('demo')).toEqual({
      url: 'https://packages.example/demo',
      headers: { Authorization: `Basic ${Buffer.from('fixture-user:fixture-pass').toString('base64')}` },
    });
  });

  it('rejects missing credential variables instead of sending a partial credential', async () => {
    vi.stubEnv('NPM_REGISTRY_FIXTURE_TOKEN', undefined);
    await fs.writeFile(config, 'registry=https://packages.example/\n//packages.example/:_authToken=${NPM_REGISTRY_FIXTURE_TOKEN}');
    expect(() => resolveNpmRegistryRequest('demo')).toThrow('Missing npm configuration environment variable');
  });

  it.each(['file:///registry', 'https://packages.example/?token=fixture', 'https://packages.example/#fragment'])(
    'rejects unsupported registry URLs (%s)', async (registry: string) => {
      await fs.writeFile(config, `registry=${registry}`);
      expect(() => resolveNpmRegistryRequest('demo')).toThrow('Invalid npm registry URL');
    },
  );
});
