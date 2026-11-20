import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const PROBE_TIMEOUT_MS = 2000;
const MIN_BUN_VERSION_FALLBACK = '1.1.0';
const probeCache = new Map();

function isExecutable(filePath, platform = process.platform) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return false;
    if (platform === 'win32') {
      const ext = path.extname(filePath).toLowerCase();
      return ext === '.exe' || ext === '.cmd' || ext === '.bat';
    }
    return Boolean(stat.mode & 0o111);
  } catch {
    return false;
  }
}

function parseSemver(versionStr) {
  const match = /(\d+)\.(\d+)\.(\d+)/.exec(versionStr || '');
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function semverGte(actualStr, minStr) {
  const actual = parseSemver(actualStr);
  const min = parseSemver(minStr);
  if (!actual || !min) return false;
  for (let i = 0; i < 3; i++) {
    if (actual[i] > min[i]) return true;
    if (actual[i] < min[i]) return false;
  }
  return true;
}

export function findSystemBunCandidates({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const binaryName = platform === 'win32' ? 'bun.exe' : 'bun';
  const candidates = [];
  const seen = new Set();

  const add = (candidatePath) => {
    if (!candidatePath) return;
    const resolved = path.resolve(candidatePath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    if (isExecutable(resolved, platform)) candidates.push(resolved);
  };

  const pathEnv = env.PATH || env.Path || '';
  const pathSeparator = platform === 'win32' ? ';' : ':';
  for (const segment of pathEnv.split(pathSeparator)) {
    if (!segment) continue;
    add(path.join(segment, binaryName));
    if (platform === 'win32') {
      add(path.join(segment, 'bun.cmd'));
      add(path.join(segment, 'bun.bat'));
    }
  }

  add(path.join(home, '.bun', 'bin', binaryName));
  if (platform === 'win32') {
    add(path.join(home, '.bun', 'bin', 'bun.cmd'));
    if (env.LOCALAPPDATA) {
      add(path.join(env.LOCALAPPDATA, 'Programs', 'bun', 'bun.exe'));
    }
    if (env.USERPROFILE && env.USERPROFILE !== home) {
      add(path.join(env.USERPROFILE, '.bun', 'bin', binaryName));
      add(path.join(env.USERPROFILE, '.bun', 'bin', 'bun.cmd'));
    }
  }
  add(path.join(home, '.local', 'bin', binaryName));
  if (platform === 'win32' && env.USERPROFILE) {
    add(path.join(env.USERPROFILE, '.local', 'bin', binaryName));
  }
  if (platform !== 'win32') {
    add(path.join('/usr', 'local', 'bin', binaryName));
    add(path.join('/usr', 'bin', binaryName));
  }

  return candidates;
}

export function findSystemOmpCandidates({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  const binaryName = platform === 'win32' ? 'omp.exe' : 'omp';
  const candidates = [];
  const seen = new Set();

  const add = (candidatePath) => {
    if (!candidatePath) return;
    const resolved = path.resolve(candidatePath);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    if (isExecutable(resolved, platform)) candidates.push(resolved);
  };

  const pathEnv = env.PATH || env.Path || '';
  const pathSeparator = platform === 'win32' ? ';' : ':';
  for (const segment of pathEnv.split(pathSeparator)) {
    if (!segment) continue;
    add(path.join(segment, binaryName));
    if (platform === 'win32') {
      add(path.join(segment, 'omp.cmd'));
      add(path.join(segment, 'omp.bat'));
    }
  }

  add(path.join(home, '.bun', 'bin', binaryName));
  if (platform === 'win32') {
    add(path.join(home, '.bun', 'bin', 'omp.cmd'));
    if (env.USERPROFILE && env.USERPROFILE !== home) {
      add(path.join(env.USERPROFILE, '.bun', 'bin', binaryName));
      add(path.join(env.USERPROFILE, '.bun', 'bin', 'omp.cmd'));
    }
  }
  add(path.join(home, '.local', 'bin', binaryName));
  if (platform === 'win32') {
    add(path.join(home, '.local', 'bin', 'omp.cmd'));
    if (env.USERPROFILE) {
      add(path.join(env.USERPROFILE, '.local', 'bin', binaryName));
      add(path.join(env.USERPROFILE, '.local', 'bin', 'omp.cmd'));
    }
  }
  if (platform !== 'win32') {
    add(path.join('/usr', 'local', 'bin', binaryName));
    add(path.join('/usr', 'bin', binaryName));
  }

  return candidates;
}

function resolveCmdTargetScript(cmdPath) {
  try {
    const content = fs.readFileSync(cmdPath, 'utf8');
    const match = /"%~dp0\\([^"]+)"|node\s+"%~dp0\\([^"]+)"|bun\s+"%~dp0\\([^"]+)"/i.exec(content);
    const rel = match?.[1] || match?.[2] || match?.[3];
    if (rel) {
      const target = path.resolve(path.dirname(cmdPath), rel);
      if (fs.existsSync(target)) return target;
    }
  } catch { }
  return null;
}
function getRemainingTimeout(deadline, probeTimeoutMs = PROBE_TIMEOUT_MS, minRemaining = 20) {
  if (!deadline) return probeTimeoutMs;
  const remaining = deadline - Date.now();
  if (remaining < minRemaining) throw new Error('DEADLINE_EXCEEDED');
  return Math.min(probeTimeoutMs, remaining);
}

export function probeSystemBun(bunPath, { probeTimeoutMs = PROBE_TIMEOUT_MS, minBunVersion = MIN_BUN_VERSION_FALLBACK, deadline, platform = process.platform } = {}) {
  try {
    const timeout = getRemainingTimeout(deadline, probeTimeoutMs);
    const isWindowsCmd = platform === 'win32' && (bunPath.endsWith('.cmd') || bunPath.endsWith('.bat'));
    const out = (isWindowsCmd
      ? execFileSync('cmd.exe', ['/d', '/s', '/c', bunPath, '--version'], {
        timeout,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      : execFileSync(bunPath, ['--version'], {
        timeout,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    ).trim();

    const versionMatch = /^(\d+\.\d+\.\d+)/.exec(out);
    if (!versionMatch) return { ok: false, reason: 'INVALID_BUN_OUTPUT' };
    const bunVersion = versionMatch[1];
    if (!semverGte(bunVersion, minBunVersion)) {
      return { ok: false, reason: 'BUN_VERSION_BELOW_MINIMUM', bunVersion };
    }
    return { ok: true, bunPath, bunVersion };
  } catch {
    return { ok: false, reason: 'BUN_PROBE_FAILED' };
  }
}

export function probeSystemOmp(
  ompPath,
  {
    probeTimeoutMs = PROBE_TIMEOUT_MS,
    bundledServiceDir,
    minBunVersion = MIN_BUN_VERSION_FALLBACK,
    systemBunCandidates = [],
    env = process.env,
    platform = process.platform,
    bundledManifest,
    deadline,
    preferOmpInterpreter = false,
  } = {},
) {
  try {
    const mtime = fs.statSync(ompPath).mtimeMs;
    const manifestPackages = Array.isArray(bundledManifest?.packages)
      ? bundledManifest.packages
      : (bundledManifest?.packages && typeof bundledManifest.packages === 'object'
        ? Object.entries(bundledManifest.packages).map(([name, version]) => ({ name, version, path: undefined }))
        : []);
    const manifestPkgSig = manifestPackages
      .map(p => `${p.name || ''}@${p.version || ''}`)
      .sort()
      .join(';');
    const manifestBunVer = bundledManifest?.bunVersion || minBunVersion;
    const cacheKey = `${ompPath}:${platform}:${mtime}:${manifestBunVer}:${manifestPkgSig}:${bundledServiceDir || ''}:${systemBunCandidates.join(';')}:${preferOmpInterpreter}`;
    if (probeCache.has(cacheKey)) return probeCache.get(cacheKey);

    const checkBudget = () => getRemainingTimeout(deadline, probeTimeoutMs);
    checkBudget();

    let ompVersion = null;
    let executableTarget = ompPath;
    const isWindowsCmd = platform === 'win32' && (ompPath.endsWith('.cmd') || ompPath.endsWith('.bat'));

    // 1. Probe a separate system Bun interpreter if available
    let availableSystemBun = null;
    const bunSearchList = preferOmpInterpreter ? [] : [
      path.join(path.dirname(ompPath), platform === 'win32' ? 'bun.exe' : 'bun'),
      ...systemBunCandidates,
    ];
    if (preferOmpInterpreter && isWindowsCmd) return { ok: false, reason: 'NO_COMPATIBLE_BUN_INTERPRETER' };
    for (const bCandidate of bunSearchList) {
      if (deadline && Date.now() >= deadline) break;
      if (isExecutable(bCandidate, platform)) {
        const bProbe = probeSystemBun(bCandidate, { probeTimeoutMs: checkBudget(), minBunVersion, deadline, platform });
        if (bProbe.ok) {
          availableSystemBun = bProbe;
          break;
        }
      }
    }

    if (isWindowsCmd) {
      const scriptTarget = resolveCmdTargetScript(ompPath);
      if (scriptTarget && availableSystemBun) {
        executableTarget = scriptTarget;
        const versionOut = execFileSync(availableSystemBun.bunPath, [executableTarget, '--version'], {
          timeout: checkBudget(),
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const versionMatch = /^omp\/(\d+\.\d+\.\d+)/.exec(versionOut);
        if (!versionMatch) return { ok: false, reason: 'IDENTITY_MISMATCH' };
        ompVersion = versionMatch[1];
      } else {
        const versionOut = execFileSync('cmd.exe', ['/d', '/s', '/c', ompPath, '--version'], {
          timeout: checkBudget(),
          encoding: 'utf8',
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const versionMatch = /^omp\/(\d+\.\d+\.\d+)/.exec(versionOut);
        if (!versionMatch) return { ok: false, reason: 'IDENTITY_MISMATCH' };
        ompVersion = versionMatch[1];
      }
    } else {
      // Direct binary/script execution
      const identityEnv = { ...env };
      delete identityEnv.BUN_BE_BUN;
      const versionOut = execFileSync(ompPath, ['--version'], {
        timeout: checkBudget(),
        encoding: 'utf8',
        windowsHide: true,
        env: identityEnv,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      const versionMatch = /^omp\/(\d+\.\d+\.\d+)/.exec(versionOut);
      if (!versionMatch) {
        return { ok: false, reason: 'IDENTITY_MISMATCH' };
      }
      ompVersion = versionMatch[1];
    }

    // 2. Determine Bun interpreter: prefer real system Bun; fallback to compiled omp under BUN_BE_BUN=1
    let chosenBunPath = null;
    let chosenBunVersion = null;
    const additionalEnv = {};

    if (availableSystemBun) {
      chosenBunPath = availableSystemBun.bunPath;
      chosenBunVersion = availableSystemBun.bunVersion;
    } else if (!isWindowsCmd) {
      // Probe if candidate omp itself acts as Bun under BUN_BE_BUN=1
      try {
        const bunOut = execFileSync(ompPath, ['--version'], {
          timeout: checkBudget(),
          encoding: 'utf8',
          windowsHide: true,
          env: { ...env, BUN_BE_BUN: '1' },
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        const bunMatch = /^(\d+\.\d+\.\d+)/.exec(bunOut);
        if (bunMatch && semverGte(bunMatch[1], minBunVersion)) {
          chosenBunPath = ompPath;
          chosenBunVersion = bunMatch[1];
          additionalEnv.BUN_BE_BUN = '1';
        }
      } catch { }
    }

    if (!chosenBunPath || !chosenBunVersion) {
      return { ok: false, reason: 'NO_COMPATIBLE_BUN_INTERPRETER' };
    }

    // 3. Staged service closure & native module compatibility probe
    if (bundledServiceDir && fs.existsSync(bundledServiceDir)) {
      try {
        if (manifestPackages.length > 0) {
          for (const entry of manifestPackages) {
            if (!entry || typeof entry !== 'object' || !entry.name) continue;
            try {
              const candidatePaths = [
              entry.path ? path.resolve(bundledServiceDir, '..', entry.path, 'package.json') : null,
                path.join(bundledServiceDir, 'node_modules', entry.name, 'package.json'),
              ].filter(Boolean);
              const pkgJsonPath = candidatePaths.find(p => fs.existsSync(p));
              if (pkgJsonPath) {
                const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
                if (pkgJson.version && entry.version && pkgJson.version !== entry.version) {
                  return { ok: false, reason: 'PACKAGE_VERSION_MISMATCH' };
                }
              }
            } catch { /* ignore non-blocking read error */ }
          }
        }
        const distIndex = path.join(bundledServiceDir, 'dist', 'index.js');
        const distWorker = path.join(bundledServiceDir, 'dist', 'worker', 'index.js');
        let stagedImports = '';
        if (fs.existsSync(distIndex)) stagedImports += `await import(${JSON.stringify(distIndex)});`;
        if (fs.existsSync(distWorker)) stagedImports += `await import(${JSON.stringify(distWorker)});`;

        const checkScript =
          stagedImports +
          "import '@oh-my-pi/pi-coding-agent/sdk';" +
          "import '@oh-my-pi/pi-coding-agent/session/session-manager';" +
          "import '@oh-my-pi/pi-coding-agent/config/settings';" +
          "import '@oh-my-pi/pi-coding-agent/config/model-registry';" +
          "import '@oh-my-pi/pi-natives';" +
          "import 'onnxruntime-node';" +
          "console.log('__COMPAT_OK__');";

        const probeEnv = { ...env, ...additionalEnv };
        const testOut = execFileSync(chosenBunPath, ['--no-env-file', '-e', checkScript], {
          timeout: checkBudget(),
          cwd: bundledServiceDir,
          encoding: 'utf8',
          windowsHide: true,
          env: probeEnv,
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();

        if (!testOut.includes('__COMPAT_OK__')) {
          return { ok: false, reason: 'MODULE_COMPATIBILITY_FAILED' };
        }
      } catch {
        return { ok: false, reason: 'MODULE_COMPATIBILITY_FAILED' };
      }
    }

    const result = {
      ok: true,
      ompPath,
      bunPath: chosenBunPath,
      ompVersion,
      bunVersion: chosenBunVersion,
      env: additionalEnv,
    };
    probeCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (err?.message === 'DEADLINE_EXCEEDED') return { ok: false, reason: 'DEADLINE_EXCEEDED' };
    return { ok: false, reason: 'PROBE_FAILED' };
  }
}

export function detectSystemOmpRuntime({
  bundledRuntime,
  env = process.env,
  platform = process.platform,
  home = os.homedir(),
  probeTimeoutMs = PROBE_TIMEOUT_MS,
  candidatePaths,
  preferOmpInterpreter = false,
} = {}) {
  const bundledBunPath = bundledRuntime?.bunPath ?? null;
  const bundledEntrypoint = bundledRuntime?.entrypoint ?? null;
  const bundledManifest = bundledRuntime?.manifest ?? null;
  const minBunVersion = bundledManifest?.bunVersion || MIN_BUN_VERSION_FALLBACK;
  const bundledServiceDir = bundledEntrypoint ? path.dirname(path.dirname(bundledEntrypoint)) : undefined;

  // 1. Explicit operator path
  const envBun = env.OHPICHAMBER_BUN?.trim();
  const envEntry = env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT?.trim();
  const isBundledDefaultBun = Boolean(envBun && bundledBunPath && path.resolve(envBun) === path.resolve(bundledBunPath));

  if (envBun && !isBundledDefaultBun) {
    return {
      source: 'operator',
      bunPath: envBun,
      entrypoint: envEntry || bundledEntrypoint || '',
      path: envBun,
      ...(env.BUN_BE_BUN === '1' ? { env: { BUN_BE_BUN: '1' } } : {}),
    };
  }

  // 2. Explicit preference for bundled runtime
  if (env.OHPICHAMBER_PREFER_BUNDLED_RUNTIME === '1') {
    return {
      source: 'bundled',
      bunPath: bundledBunPath || '',
      entrypoint: bundledEntrypoint || '',
      reason: 'PREFER_BUNDLED',
    };
  }

  // 3. Probing candidates
  const candidates = candidatePaths || findSystemOmpCandidates({ env, platform, home });
  const systemBunCandidates = preferOmpInterpreter ? [] : findSystemBunCandidates({ env, platform, home });
  let lastFailureReason = candidates.length === 0 ? 'NO_SYSTEM_OMP' : null;
  const totalBudgetDeadline = Date.now() + Math.min(probeTimeoutMs * 2, 4000);

  for (const candidate of candidates) {
    if (Date.now() >= totalBudgetDeadline) break;
    const remaining = totalBudgetDeadline - Date.now();
    if (remaining <= 50) break;
    const probe = probeSystemOmp(candidate, {
      probeTimeoutMs: Math.min(probeTimeoutMs, remaining),
      bundledServiceDir,
      bundledManifest,
      minBunVersion,
      systemBunCandidates,
      env,
      platform,
      deadline: totalBudgetDeadline,
      preferOmpInterpreter,
    });
    if (probe.ok) {
      return {
        source: 'system',
        bunPath: probe.bunPath,
        entrypoint: bundledEntrypoint || '',
        ompVersion: probe.ompVersion,
        bunVersion: probe.bunVersion,
        path: probe.ompPath,
        env: probe.env,
      };
    }
    lastFailureReason = probe.reason;
  }

  // 4. Clean fallback to bundled runtime
  return {
    source: 'bundled',
    bunPath: bundledBunPath || '',
    entrypoint: bundledEntrypoint || '',
    reason: lastFailureReason || 'FALLBACK_BUNDLED',
  };
}
