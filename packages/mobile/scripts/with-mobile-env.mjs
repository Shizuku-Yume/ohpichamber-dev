import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import os from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DARWIN_DEFAULT_DEVELOPER_DIR = '/Applications/Xcode.app/Contents/Developer';
const DARWIN_JAVA_HOME_CANDIDATES = [
  '/opt/homebrew/opt/openjdk@21',
  '/usr/local/opt/openjdk@21',
];
const DARWIN_DEFAULT_JAVA_HOME = '/opt/homebrew/opt/openjdk@21';
const DARWIN_DEFAULT_ANDROID_HOME = '/opt/homebrew/share/android-commandlinetools';

const LINUX_JAVA_HOME_CANDIDATES = [
  '/usr/lib/jvm/java-21-openjdk-amd64',
  '/usr/lib/jvm/java-21-openjdk-arm64',
  '/usr/lib/jvm/java-21-openjdk',
  '/usr/lib/jvm/temurin-21-jdk-amd64',
  '/usr/lib/jvm/temurin-21-jdk-arm64',
  '/usr/lib/jvm/temurin-21-jdk',
  '/usr/lib/jvm/zulu-21',
  '/usr/lib/jvm/jdk-21',
  '/home/linuxbrew/.linuxbrew/opt/openjdk@21',
];

const darwinAndroidCandidates = (homeDir) => [
  '/opt/homebrew/share/android-commandlinetools',
  join(homeDir, 'Library/Android/sdk'),
  '/usr/local/share/android-commandlinetools',
];

const linuxAndroidCandidates = (homeDir) => [
  join(homeDir, 'Android/Sdk'),
  join(homeDir, 'Android/sdk'),
  '/opt/android-sdk',
  '/usr/lib/android-sdk',
  '/home/linuxbrew/.linuxbrew/share/android-commandlinetools',
];

const nonEmpty = (value) => (value && value.trim().length > 0 ? value : null);

// Respect an explicit DEVELOPER_DIR, then fall back to whatever the user selected via
// `xcode-select` (so an Xcode beta / non-default install is honoured). Hardcoding
// /Applications/Xcode.app overrode `xcode-select` and forced builds onto the wrong Xcode,
// whose simulator runtimes may not match — xcodebuild then can't find the chosen simulator.
const defaultSelectDeveloperDir = () => {
  try {
    const result = spawnSync('xcode-select', ['-p'], { encoding: 'utf8' });
    const selectedPath = result.status === 0 ? result.stdout.trim() : '';
    return selectedPath.length > 0 ? selectedPath : null;
  } catch {
    return null;
  }
};

export const resolveMobileEnv = ({
  env = process.env,
  platform = process.platform,
  homeDir = os.homedir(),
  pathExists = existsSync,
  selectDeveloperDir = defaultSelectDeveloperDir,
} = {}) => {
  const firstExisting = (candidates) => candidates.find((candidate) => Boolean(pathExists(candidate))) ?? null;

  const explicitDeveloperDir = nonEmpty(env.DEVELOPER_DIR);
  let developerDir = explicitDeveloperDir;
  if (!developerDir && platform === 'darwin') {
    const selected = selectDeveloperDir();
    developerDir = (selected && selected.trim().length > 0 ? selected.trim() : null) ?? DARWIN_DEFAULT_DEVELOPER_DIR;
  }

  const explicitJavaHome = nonEmpty(env.JAVA_HOME);
  let javaHome = explicitJavaHome;
  if (!javaHome) {
    if (platform === 'darwin') {
      javaHome = firstExisting(DARWIN_JAVA_HOME_CANDIDATES) ?? DARWIN_DEFAULT_JAVA_HOME;
    } else if (platform === 'linux') {
      javaHome = firstExisting(LINUX_JAVA_HOME_CANDIDATES);
    }
  }

  const explicitAndroidHome = nonEmpty(env.ANDROID_HOME) ?? nonEmpty(env.ANDROID_SDK_ROOT);
  let androidHome = explicitAndroidHome;
  if (!androidHome) {
    if (platform === 'darwin') {
      androidHome = firstExisting(darwinAndroidCandidates(homeDir)) ?? DARWIN_DEFAULT_ANDROID_HOME;
    } else if (platform === 'linux') {
      androidHome = firstExisting(linuxAndroidCandidates(homeDir));
    }
  }

  const nextEnv = { ...env };

  if (platform === 'darwin') {
    nextEnv.LANG = 'en_US.UTF-8';
    nextEnv.LC_ALL = 'en_US.UTF-8';
  }

  if (developerDir) {
    nextEnv.DEVELOPER_DIR = developerDir;
  } else {
    delete nextEnv.DEVELOPER_DIR;
  }

  if (javaHome) {
    nextEnv.JAVA_HOME = javaHome;
  } else {
    delete nextEnv.JAVA_HOME;
  }

  if (androidHome) {
    nextEnv.ANDROID_HOME = androidHome;
    nextEnv.ANDROID_SDK_ROOT = androidHome;
  } else {
    delete nextEnv.ANDROID_HOME;
    delete nextEnv.ANDROID_SDK_ROOT;
  }

  const pathPrefixes = [];
  if (javaHome) {
    pathPrefixes.push(join(javaHome, 'bin'));
  }
  if (androidHome) {
    pathPrefixes.push(join(androidHome, 'platform-tools'));
  }

  const existingPath = nonEmpty(env.PATH);
  if (existingPath) {
    pathPrefixes.push(existingPath);
  }

  if (pathPrefixes.length > 0) {
    nextEnv.PATH = pathPrefixes.join(delimiter);
  } else {
    delete nextEnv.PATH;
  }

  return nextEnv;
};

const isEntrypoint = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isEntrypoint) {
  const command = process.argv.slice(2).join(' ');

  if (!command) {
    console.error('Usage: node scripts/with-mobile-env.mjs <command>');
    process.exit(1);
  }

  const child = spawn(command, {
    env: resolveMobileEnv(),
    shell: true,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}
