import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolveAgentRuntime } from '../agent-runtime.mjs';
import { verifyWindowsAgentLinks } from '../windows-agent-links.mjs';

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function verifyAgentPayload(root, { platform = process.platform, architecture = process.arch, runBunVersion } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || manifest.architecture !== architecture) throw new Error('Agent payload platform/architecture mismatch');
  if (platform === 'win32') verifyWindowsAgentLinks(root, manifest);
  const within = relative => {
    const resolved = path.resolve(root, relative);
    if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Agent payload path escapes resource directory');
    return resolved;
  };
  for (const item of manifest.files) {
    const file = within(item.path);
    if (item.link !== undefined) {
      if (!fs.lstatSync(file).isSymbolicLink() || fs.readlinkSync(file) !== item.link) throw new Error(`Agent dependency link mismatch: ${item.path}`);
      within(path.relative(root, fs.realpathSync(file)));
    } else {
      const actual = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      if (actual !== item.sha256) throw new Error(`Agent payload checksum mismatch: ${item.path}`);
    }
  }
  for (const required of ['service/dist/index.js', 'service/dist/worker/index.js', platform === 'win32' ? 'bun.exe' : 'bun']) {
    if (!manifest.files.some(item => item.path === required)) throw new Error(`Agent payload missing ${required}`);
  }
  for (const name of ['@oh-my-pi/pi-coding-agent', `@oh-my-pi/pi-natives-${platform}-${architecture}`, 'onnxruntime-node', 'fastembed']) {
    if (!manifest.packages.some(item => item.name === name)) throw new Error(`Agent dependency missing: ${name}`);
  }
  const binary = path.join(root, platform === 'win32' ? 'bun.exe' : 'bun');
  if (platform !== 'win32' && (fs.statSync(binary).mode & 0o111) === 0) throw new Error('Packaged Bun is not executable');
  const version = runBunVersion ? runBunVersion(binary) : spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 15000, windowsHide: true }).stdout?.trim();
  if (version !== manifest.bunVersion) throw new Error(`Bun version mismatch: expected ${manifest.bunVersion}, got ${version}`);
  return { bunVersion: version, packageCount: manifest.packages.length };
}

async function main() {
  const resources = process.argv[2] ? path.resolve(process.argv[2]) : path.join(electronRoot, 'resources');
  const payload = path.join(resources, 'agent-runtime');
  const result = verifyAgentPayload(payload);
  const runtime = resolveAgentRuntime(resources);
  // Native ONNX packages can ship different SONAME versions. Probe each declared
  // package in a fresh Bun process so one import cannot mask another's loader.
  for (const specifier of ['@oh-my-pi/pi-coding-agent', '@oh-my-pi/pi-natives', 'onnxruntime-node', 'fastembed']) {
    const imports = spawnSync(runtime.bunPath, ['--no-env-file', '-e', `await import(${JSON.stringify(specifier)});`], {
      cwd: path.join(payload, 'service'), encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    if (imports.status !== 0) throw new Error(`Packaged SDK/native import failed for ${specifier}: ${imports.error ?? imports.stderr}`);
  }
  const { createAgentServiceSupervisor } = await import('../../web/server/lib/host/agent-service-supervisor.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-packaged-agent-'));
  const supervisor = createAgentServiceSupervisor({ ...runtime, dataDir: directory, env: { OHPICHAMBER_BUN: runtime.bunPath } });
  try {
    await supervisor.start();
    const ready = await supervisor.request('/api/agent/v1/ready');
    if (!ready.ok) throw new Error(`Packaged Agent readiness returned ${ready.status}`);
    console.log(JSON.stringify({ ...result, readiness: await ready.json() }));
  } finally {
    try { await supervisor.stop(); } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
