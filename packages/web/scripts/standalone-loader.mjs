import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function findRuntimeRoot(packageRoot = webRoot) {
  const candidates = [
    path.join(packageRoot, 'resources', 'agent-runtime'),
    path.join(packageRoot, 'agent-runtime'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'manifest.json'))) ?? null;
}

export function ensureAgentRuntimeSymlinks(root) {
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return;
  }
  if (!Array.isArray(manifest.files)) return;
  for (const item of manifest.files) {
    if (item.link !== undefined && typeof item.path === 'string') {
      const file = path.join(root, item.path);
      try {
        if (fs.lstatSync(file).isSymbolicLink() && fs.readlinkSync(file) === item.link) {
          continue;
        }
      } catch {
        // missing or mismatched link
      }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try { fs.rmSync(file, { force: true, recursive: true }); } catch { }
      try {
        fs.symlinkSync(item.link, file);
      } catch {
        // best effort
      }
    }
  }

  // Ensure node_modules/@openchamber links for agent-contract and agent-service
  const targetWebRoot = path.resolve(root, '../..');
  const webNm = path.join(targetWebRoot, 'node_modules', '@openchamber');
  try {
    fs.mkdirSync(webNm, { recursive: true });
    const contractPkg = manifest.packages?.find((p) => p.name === '@openchamber/agent-contract');
    if (contractPkg) {
      const contractDest = path.join(webNm, 'agent-contract');
      const contractTarget = path.join(root, contractPkg.path);
      if (!fs.existsSync(contractDest) && fs.existsSync(contractTarget)) {
        fs.symlinkSync(path.relative(webNm, contractTarget), contractDest, 'dir');
      }
    }
    const serviceDest = path.join(webNm, 'agent-service');
    const serviceTarget = path.join(root, 'service');
    if (!fs.existsSync(serviceDest) && fs.existsSync(serviceTarget)) {
      fs.symlinkSync(path.relative(webNm, serviceTarget), serviceDest, 'dir');
    }
    const sdkDest = path.join(webNm, 'sdk');
    const sdkTarget = path.join(targetWebRoot, 'resources', 'standalone-sdk');
    if (!fs.existsSync(sdkDest) && fs.existsSync(sdkTarget)) {
      fs.symlinkSync(path.relative(webNm, sdkTarget), sdkDest, 'dir');
    }
  } catch {
    // best effort if node_modules is read-only
  }
}

export function resolveWebAgentRuntime(
  packageRoot = webRoot,
  platform = process.platform,
) {
  const root = findRuntimeRoot(packageRoot);
  if (!root) return null;
  ensureAgentRuntimeSymlinks(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.platform !== platform || manifest.architecture !== process.arch) {
    throw new Error('Packaged Agent runtime does not match this platform and architecture');
  }
  const bunPath = path.join(root, platform === 'win32' ? 'bun.exe' : 'bun');
  const entrypoint = path.join(root, 'service', 'dist', 'index.js');
  const worker = path.join(root, 'service', 'dist', 'worker', 'index.js');
  for (const file of [bunPath, entrypoint, worker]) {
    if (!fs.existsSync(file)) throw new Error(`Missing Agent runtime file: ${file}`);
  }
  return { bunPath, entrypoint, worker, root, manifest };
}

export function registerStandaloneLoader(packageRoot = webRoot) {
  if (globalThis.__openchamberStandaloneLoaderRegistered) return;
  globalThis.__openchamberStandaloneLoaderRegistered = true;
  const runtime = findRuntimeRoot(packageRoot);
  if (!runtime) return;

  ensureAgentRuntimeSymlinks(runtime);

  const bunPath = path.join(runtime, process.platform === 'win32' ? 'bun.exe' : 'bun');
  const entrypoint = path.join(runtime, 'service', 'dist', 'index.js');
  process.env.OHPICHAMBER_BUN ??= bunPath;
  process.env.OHPICHAMBER_AGENT_SERVICE_ENTRYPOINT ??= entrypoint;

  try {
    const loaderUrl = new URL('./standalone-loader.mjs', import.meta.url);
    register(loaderUrl, import.meta.url);
  } catch {
    // Already registered or unsupported
  }
}

// Auto-run bootstrap if running in a standalone install with bundled runtime
const detectedRuntime = findRuntimeRoot();
if (detectedRuntime) {
  registerStandaloneLoader();
}

export async function resolve(specifier, context, nextResolve) {
  const runtime = findRuntimeRoot();
  if (runtime) {
    if (specifier === '@openchamber/agent-contract') {
      const candidate = path.join(runtime, 'service', 'node_modules', '@openchamber', 'agent-contract', 'dist', 'index.js');
      if (fs.existsSync(candidate)) {
        return { format: 'module', shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
    if (specifier === '@openchamber/agent-service/private-protocol') {
      const candidate = path.join(runtime, 'service', 'dist', 'supervisor', 'host-authorization-protocol.js');
      if (fs.existsSync(candidate)) {
        return { format: 'module', shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
    const sdkRoot = fs.existsSync(path.join(webRoot, 'resources', 'standalone-sdk', 'dist'))
      ? path.join(webRoot, 'resources', 'standalone-sdk')
      : path.join(webRoot, 'node_modules', '@openchamber', 'sdk');
    if (specifier === '@openchamber/sdk') {
      const candidate = path.join(sdkRoot, 'dist', 'index.js');
      if (fs.existsSync(candidate)) {
        return { format: 'module', shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
    if (specifier === '@openchamber/sdk/schemas') {
      const candidate = path.join(sdkRoot, 'dist', 'schemas.js');
      if (fs.existsSync(candidate)) {
        return { format: 'module', shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
    if (specifier === '@openchamber/sdk/ui') {
      const candidate = path.join(sdkRoot, 'dist', 'ui', 'index.js');
      if (fs.existsSync(candidate)) {
        return { format: 'module', shortCircuit: true, url: pathToFileURL(candidate).href };
      }
    }
  }
  return nextResolve(specifier, context);
}
