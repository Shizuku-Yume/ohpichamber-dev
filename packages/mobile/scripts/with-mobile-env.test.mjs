import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveMobileEnv } from './with-mobile-env.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('./with-mobile-env.mjs', import.meta.url));

test('darwin supplies a UTF-8 CocoaPods locale even with empty or non-UTF-8 overrides', () => {
  for (const env of [{}, { LANG: '', LC_ALL: '' }, { LANG: 'C', LC_ALL: 'C' }]) {
    const resolved = resolveMobileEnv({ env, platform: 'darwin', pathExists: () => false, selectDeveloperDir: () => null });
    assert.equal(resolved.LANG, 'en_US.UTF-8');
    assert.equal(resolved.LC_ALL, 'en_US.UTF-8');
  }
});

test('non-darwin tooling preserves the caller locale', () => {
  const resolved = resolveMobileEnv({ env: { LANG: 'C', LC_ALL: 'C' }, platform: 'linux', pathExists: () => false });
  assert.equal(resolved.LANG, 'C');
  assert.equal(resolved.LC_ALL, 'C');
});

test('linux discovers JDK 21 by precedence and ~/Android/Sdk without setting DEVELOPER_DIR', () => {
  const homeDir = '/home/tester';
  const existing = new Set([
    '/usr/lib/jvm/java-21-openjdk-amd64',
    '/usr/lib/jvm/java-21-openjdk',
    join(homeDir, 'Android/Sdk'),
    '/opt/android-sdk',
  ]);
  let selectCalled = false;

  const resolved = resolveMobileEnv({
    env: { PATH: '/usr/local/bin:/usr/bin' },
    platform: 'linux',
    homeDir,
    pathExists: (candidate) => existing.has(candidate),
    selectDeveloperDir: () => {
      selectCalled = true;
      return '/Applications/Xcode.app/Contents/Developer';
    },
  });

  assert.equal(selectCalled, false);
  assert.equal('DEVELOPER_DIR' in resolved, false);
  assert.equal(resolved.JAVA_HOME, '/usr/lib/jvm/java-21-openjdk-amd64');
  assert.equal(resolved.ANDROID_HOME, join(homeDir, 'Android/Sdk'));
  assert.equal(resolved.ANDROID_SDK_ROOT, join(homeDir, 'Android/Sdk'));
  assert.equal(
    resolved.PATH,
    `/usr/lib/jvm/java-21-openjdk-amd64/bin:${join(homeDir, 'Android/Sdk/platform-tools')}:/usr/local/bin:/usr/bin`,
  );
});

test('linux falls back to /usr/lib/jvm/java-21-openjdk and /opt/android-sdk when primary paths are absent', () => {
  const existing = new Set([
    '/usr/lib/jvm/java-21-openjdk',
    '/opt/android-sdk',
  ]);

  const resolved = resolveMobileEnv({
    env: { PATH: '/usr/bin' },
    platform: 'linux',
    homeDir: '/home/tester',
    pathExists: (candidate) => existing.has(candidate),
  });

  assert.equal(resolved.JAVA_HOME, '/usr/lib/jvm/java-21-openjdk');
  assert.equal(resolved.ANDROID_HOME, '/opt/android-sdk');
  assert.equal(resolved.ANDROID_SDK_ROOT, '/opt/android-sdk');
  assert.equal(resolved.PATH, '/usr/lib/jvm/java-21-openjdk/bin:/opt/android-sdk/platform-tools:/usr/bin');
});

test('linux leaves toolchain vars unset and avoids empty or /bin PATH segments when nothing exists', () => {
  const resolved = resolveMobileEnv({
    env: {
      PATH: '/usr/bin:/bin',
      JAVA_HOME: '',
      ANDROID_HOME: '',
      ANDROID_SDK_ROOT: '',
      DEVELOPER_DIR: '',
    },
    platform: 'linux',
    homeDir: '/home/tester',
    pathExists: () => false,
  });

  assert.equal('JAVA_HOME' in resolved, false);
  assert.equal('ANDROID_HOME' in resolved, false);
  assert.equal('ANDROID_SDK_ROOT' in resolved, false);
  assert.equal('DEVELOPER_DIR' in resolved, false);
  assert.equal(resolved.PATH, '/usr/bin:/bin');

  const withoutPath = resolveMobileEnv({
    env: {},
    platform: 'linux',
    homeDir: '/home/tester',
    pathExists: () => false,
  });

  assert.equal('PATH' in withoutPath, false);
  assert.equal('JAVA_HOME' in withoutPath, false);
  assert.equal('ANDROID_HOME' in withoutPath, false);
  assert.equal('ANDROID_SDK_ROOT' in withoutPath, false);
  assert.equal('DEVELOPER_DIR' in withoutPath, false);
});

test('darwin defaults to Homebrew paths and respects xcode-select or falls back to Xcode.app', () => {
  const withXcodeSelect = resolveMobileEnv({
    env: { PATH: '/usr/bin' },
    platform: 'darwin',
    homeDir: '/Users/tester',
    pathExists: () => false,
    selectDeveloperDir: () => '/Applications/Xcode-beta.app/Contents/Developer',
  });

  assert.equal(withXcodeSelect.DEVELOPER_DIR, '/Applications/Xcode-beta.app/Contents/Developer');
  assert.equal(withXcodeSelect.JAVA_HOME, '/opt/homebrew/opt/openjdk@21');
  assert.equal(withXcodeSelect.ANDROID_HOME, '/opt/homebrew/share/android-commandlinetools');
  assert.equal(withXcodeSelect.ANDROID_SDK_ROOT, '/opt/homebrew/share/android-commandlinetools');
  assert.equal(
    withXcodeSelect.PATH,
    '/opt/homebrew/opt/openjdk@21/bin:/opt/homebrew/share/android-commandlinetools/platform-tools:/usr/bin',
  );

  const withoutXcodeSelect = resolveMobileEnv({
    env: { PATH: '/usr/bin' },
    platform: 'darwin',
    homeDir: '/Users/tester',
    pathExists: () => false,
    selectDeveloperDir: () => null,
  });

  assert.equal(withoutXcodeSelect.DEVELOPER_DIR, '/Applications/Xcode.app/Contents/Developer');
});

test('darwin picks Intel Homebrew JDK and ~/Library/Android/sdk when Apple Silicon paths are absent', () => {
  const existing = new Set([
    '/usr/local/opt/openjdk@21',
    '/Users/tester/Library/Android/sdk',
  ]);

  const resolved = resolveMobileEnv({
    env: { PATH: '/usr/bin' },
    platform: 'darwin',
    homeDir: '/Users/tester',
    pathExists: (candidate) => existing.has(candidate),
    selectDeveloperDir: () => null,
  });

  assert.equal(resolved.JAVA_HOME, '/usr/local/opt/openjdk@21');
  assert.equal(resolved.ANDROID_HOME, '/Users/tester/Library/Android/sdk');
  assert.equal(resolved.ANDROID_SDK_ROOT, '/Users/tester/Library/Android/sdk');
});

test('explicit env overrides win on linux and darwin without requiring paths to exist', () => {
  for (const platform of ['linux', 'darwin']) {
    const resolved = resolveMobileEnv({
      env: {
        PATH: '/usr/bin',
        JAVA_HOME: '/custom/nonexistent/jdk',
        ANDROID_HOME: '/custom/nonexistent/android',
        DEVELOPER_DIR: '/custom/nonexistent/xcode',
      },
      platform,
      homeDir: '/home/tester',
      pathExists: () => false,
      selectDeveloperDir: () => '/Applications/Xcode.app/Contents/Developer',
    });

    assert.equal(resolved.JAVA_HOME, '/custom/nonexistent/jdk');
    assert.equal(resolved.ANDROID_HOME, '/custom/nonexistent/android');
    assert.equal(resolved.ANDROID_SDK_ROOT, '/custom/nonexistent/android');
    assert.equal(resolved.DEVELOPER_DIR, '/custom/nonexistent/xcode');
    assert.equal(
      resolved.PATH,
      '/custom/nonexistent/jdk/bin:/custom/nonexistent/android/platform-tools:/usr/bin',
    );
  }
});

test('explicit ANDROID_SDK_ROOT populates both vars when ANDROID_HOME is unset, and ANDROID_HOME beats ANDROID_SDK_ROOT', () => {
  const fromSdkRoot = resolveMobileEnv({
    env: {
      PATH: '/usr/bin',
      ANDROID_SDK_ROOT: '/custom/sdk-root',
    },
    platform: 'linux',
    homeDir: '/home/tester',
    pathExists: () => false,
  });

  assert.equal(fromSdkRoot.ANDROID_HOME, '/custom/sdk-root');
  assert.equal(fromSdkRoot.ANDROID_SDK_ROOT, '/custom/sdk-root');
  assert.equal(fromSdkRoot.PATH, '/custom/sdk-root/platform-tools:/usr/bin');

  const homeWins = resolveMobileEnv({
    env: {
      PATH: '/usr/bin',
      ANDROID_HOME: '/custom/android-home',
      ANDROID_SDK_ROOT: '/custom/sdk-root',
    },
    platform: 'linux',
    homeDir: '/home/tester',
    pathExists: () => false,
  });

  assert.equal(homeWins.ANDROID_HOME, '/custom/android-home');
  assert.equal(homeWins.ANDROID_SDK_ROOT, '/custom/android-home');
  assert.equal(homeWins.PATH, '/custom/android-home/platform-tools:/usr/bin');
});

test('CLI execution injects resolved environment into child process and propagates exit code', () => {
  const tempHome = mkdtempSync(join(os.tmpdir(), 'with-mobile-env-test-'));
  try {
    const fakeSdk = join(tempHome, 'Android/Sdk');
    mkdirSync(fakeSdk, { recursive: true });

    const inspectCmd = `${JSON.stringify(process.execPath)} -e "console.log(JSON.stringify({ JAVA_HOME: process.env.JAVA_HOME ?? null, ANDROID_HOME: process.env.ANDROID_HOME ?? null, ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT ?? null, DEVELOPER_DIR: process.env.DEVELOPER_DIR ?? null, PATH: process.env.PATH ?? null }))"`;

    const result = spawnSync(process.execPath, [SCRIPT_PATH, inspectCmd], {
      env: {
        HOME: tempHome,
        PATH: process.env.PATH ?? '/usr/bin:/bin',
        JAVA_HOME: '/explicit/jdk-21',
      },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const childEnv = JSON.parse(result.stdout.trim());
    assert.equal(childEnv.JAVA_HOME, '/explicit/jdk-21');
    if (process.platform === 'linux') {
      assert.equal(childEnv.ANDROID_HOME, fakeSdk);
      assert.equal(childEnv.ANDROID_SDK_ROOT, fakeSdk);
      assert.equal(childEnv.DEVELOPER_DIR, null);
      assert.ok(childEnv.PATH.startsWith(`/explicit/jdk-21/bin:${fakeSdk}/platform-tools:`));
    }

    const failCmd = `${JSON.stringify(process.execPath)} -e "process.exit(42)"`;
    const failResult = spawnSync(process.execPath, [SCRIPT_PATH, failCmd], {
      env: {
        HOME: tempHome,
        PATH: process.env.PATH ?? '/usr/bin:/bin',
      },
      encoding: 'utf8',
    });
    assert.equal(failResult.status, 42);
  } finally {
    rmSync(tempHome, { recursive: true, force: true });
  }
});
