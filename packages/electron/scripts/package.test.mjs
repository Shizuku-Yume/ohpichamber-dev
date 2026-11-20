import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { configurePackageBuild } from './package.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(electronRoot, 'package.json'), 'utf8'));

test('packaging retains the compiled fork Host and unpacks its executable helpers', () => {
  assert.ok(packageJson.build.files.includes('node_modules/ohpichamber/build/**/*'));
  for (const file of ['credential-helper.js', 'ssh-wrapper.js', 'repository-credential-helper.js']) {
    assert.ok(packageJson.build.asarUnpack.includes(`node_modules/ohpichamber/build/server/lib/git/${file}`));
  }
});

test('direct electron-builder configuration defaults to unsigned and avoids signing blockers', () => {
  const { build } = packageJson;
  assert.equal(
    build.win?.verifyUpdateCodeSignature,
    false,
    'Windows build must not force verifyUpdateCodeSignature by default',
  );
  assert.equal(
    build.mac?.notarize,
    false,
    'macOS build must not force notarization by default',
  );
  assert.equal(
    build.dmg?.sign,
    false,
    'DMG build must not force signing by default',
  );
});

test('Windows packaging: unsigned build disables auto-discovery and code signature verification', () => {
  const { env, builderArgs, hasWindowsSigning } = configurePackageBuild({
    env: {},
    builderArgs: ['--win'],
    platform: 'linux',
  });
  assert.equal(hasWindowsSigning, false);
  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(builderArgs.includes('--config.win.verifyUpdateCodeSignature=false'));
  assert.ok(!builderArgs.includes('--config.win.verifyUpdateCodeSignature=true'));
});

test('Windows packaging: native platform defaults to Windows without explicit --win flag', () => {
  const { env, builderArgs } = configurePackageBuild({
    env: {},
    builderArgs: [],
    platform: 'win32',
  });
  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(builderArgs.includes('--config.win.verifyUpdateCodeSignature=false'));
});

test('Windows packaging: signed build enables verifyUpdateCodeSignature when CSC_LINK is present', () => {
  const { env, builderArgs, hasWindowsSigning } = configurePackageBuild({
    env: {
      CSC_LINK: 'base64-certificate',
      CSC_KEY_PASSWORD: 'password123',
    },
    builderArgs: ['--win'],
    platform: 'linux',
  });
  assert.equal(hasWindowsSigning, true);
  assert.notEqual(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(builderArgs.includes('--config.win.verifyUpdateCodeSignature=true'));
});

test('Windows packaging: maps WINDOWS_CSC_LINK and WINDOWS_CSC_KEY_PASSWORD to CSC_LINK and CSC_KEY_PASSWORD', () => {
  const { env, builderArgs, hasWindowsSigning } = configurePackageBuild({
    env: {
      WINDOWS_CSC_LINK: 'windows-pfx-data',
      WINDOWS_CSC_KEY_PASSWORD: 'windows-password',
    },
    builderArgs: ['--win'],
    platform: 'linux',
  });
  assert.equal(hasWindowsSigning, true);
  assert.equal(env.CSC_LINK, 'windows-pfx-data');
  assert.equal(env.CSC_KEY_PASSWORD, 'windows-password');
  assert.ok(builderArgs.includes('--config.win.verifyUpdateCodeSignature=true'));
});

test('Windows packaging: OPENCHAMBER_REQUIRE_WINDOWS_SIGNING=1 throws when credentials are missing', () => {
  assert.throws(
    () => configurePackageBuild({
      env: { OPENCHAMBER_REQUIRE_WINDOWS_SIGNING: '1' },
      builderArgs: ['--win'],
      platform: 'linux',
    }),
    /Windows release signing is required/,
  );
});

test('Windows packaging: OPENCHAMBER_REQUIRE_WINDOWS_SIGNING=1 succeeds when credentials are provided', () => {
  const { builderArgs } = configurePackageBuild({
    env: {
      OPENCHAMBER_REQUIRE_WINDOWS_SIGNING: '1',
      CSC_LINK: 'pfx-data',
      CSC_KEY_PASSWORD: 'pw',
    },
    builderArgs: ['--win'],
    platform: 'linux',
  });
  assert.ok(builderArgs.includes('--config.win.verifyUpdateCodeSignature=true'));
});

test('macOS packaging: unsigned build disables auto-discovery, notarization, and DMG signing', () => {
  const { env, builderArgs, hasMacSigning, hasAppleNotarization } = configurePackageBuild({
    env: {},
    builderArgs: ['--mac'],
    platform: 'linux',
  });
  assert.equal(hasMacSigning, false);
  assert.equal(hasAppleNotarization, false);
  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(builderArgs.includes('--config.mac.notarize=false'));
  assert.ok(builderArgs.includes('--config.dmg.sign=false'));
});

test('macOS packaging: signed build without notarization credentials disables notarization cleanly', () => {
  const { env, builderArgs, hasMacSigning, hasAppleNotarization } = configurePackageBuild({
    env: {
      CSC_LINK: 'mac-cert-link',
      CSC_KEY_PASSWORD: 'mac-password',
    },
    builderArgs: ['--mac'],
    platform: 'darwin',
  });
  assert.equal(hasMacSigning, true);
  assert.equal(hasAppleNotarization, false);
  assert.notEqual(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(builderArgs.includes('--config.mac.notarize=false'));
  assert.ok(builderArgs.includes('--config.dmg.sign=false'));
});

test('macOS packaging: signed build with Apple notarization credentials enables notarization and DMG sign', () => {
  const { builderArgs, hasMacSigning, hasAppleNotarization } = configurePackageBuild({
    env: {
      CSC_LINK: 'mac-cert-link',
      APPLE_ID: 'dev@example.com',
      APPLE_APP_SPECIFIC_PASSWORD: 'app-password',
      APPLE_TEAM_ID: 'TEAM1234',
    },
    builderArgs: ['--mac'],
    platform: 'darwin',
  });
  assert.equal(hasMacSigning, true);
  assert.equal(hasAppleNotarization, true);
  assert.ok(builderArgs.includes('--config.mac.notarize=true'));
  assert.ok(builderArgs.includes('--config.dmg.sign=true'));
});

test('Linux packaging: unsigned build disables certificate auto-discovery and resolves architecture', () => {
  const { env, builderArgs } = configurePackageBuild({
    env: {},
    builderArgs: [],
    platform: 'linux',
  });
  assert.equal(env.CSC_IDENTITY_AUTO_DISCOVERY, 'false');
  assert.ok(builderArgs.includes(`--${process.arch}`));
});

test('Linux packaging: preserves explicit architecture flag without duplicating', () => {
  const { builderArgs } = configurePackageBuild({
    env: {},
    builderArgs: ['--x64'],
    platform: 'linux',
  });
  assert.equal(builderArgs.filter((arg) => arg === '--x64').length, 1);
});

test('packaging: defaults to --publish=never when no publish flag is supplied', () => {
  const { builderArgs } = configurePackageBuild({
    env: {},
    builderArgs: ['--linux'],
    platform: 'linux',
  });
  assert.ok(builderArgs.includes('--publish=never'));
});

test('packaging: preserves explicit --publish flag', () => {
  const { builderArgs } = configurePackageBuild({
    env: {},
    builderArgs: ['--linux', '--publish=always'],
    platform: 'linux',
  });
  assert.ok(builderArgs.includes('--publish=always'));
  assert.ok(!builderArgs.includes('--publish=never'));
});
