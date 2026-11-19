import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const electronRoot = path.resolve(__dirname, '..');
const outputDir = path.join(electronRoot, 'resources', 'ripgrep');

/**
 * Find in files runs ripgrep, and a packaged desktop build looks for it first
 * in `Resources/ripgrep` (`packages/web/server/lib/fs/ripgrep.js`). This fork
 * does not depend on `@vscode/ripgrep`, so the binary is taken from ripgrep
 * already installed on the build host: `OPENCHAMBER_RIPGREP` when set, then
 * `rg` on `PATH`.
 *
 * The staged binary is verified to be ripgrep before it ships, and a missing
 * one fails the build instead of leaving `Resources/ripgrep` empty for the
 * packaged-content check to catch later. A cross-built desktop app needs the
 * target architecture's binary, which a host install cannot provide: a build
 * for another architecture must set `OPENCHAMBER_RIPGREP` to that binary.
 */
const binaryName = process.platform === 'win32' ? 'rg.exe' : 'rg';

const isExecutableFile = (candidate) => {
 try {
  return fs.statSync(candidate).isFile() && (process.platform === 'win32' || (fs.accessSync(candidate, fs.constants.X_OK), true));
 } catch {
  return false;
 }
};

const candidates = () => {
 const configured = typeof process.env.OPENCHAMBER_RIPGREP === 'string' ? process.env.OPENCHAMBER_RIPGREP.trim() : '';
 const onPath = (process.env.PATH || '').split(path.delimiter)
  .filter(Boolean)
  .map((directory) => path.join(directory, binaryName));
 return [...(configured ? [configured] : []), ...onPath];
};

const readRipgrepVersion = (binaryPath) => {
 const result = spawnSync(binaryPath, ['--version'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 15000,
  windowsHide: true,
 });
 if (result.status !== 0) return null;
 const first = result.stdout.split('\n')[0] ?? '';
 return /^ripgrep\s+(\S+)/.exec(first.trim())?.[1] ?? null;
};

const findSystemRipgrep = () => {
 const seen = new Set();
 for (const candidate of candidates()) {
  const resolved = path.resolve(candidate);
  if (seen.has(resolved) || !isExecutableFile(resolved)) continue;
  seen.add(resolved);
  if (readRipgrepVersion(resolved)) return resolved;
 }
 return null;
};

const main = () => {
 const source = findSystemRipgrep();
 if (!source) {
  throw new Error(
   `No ripgrep executable found for packaging. Install ripgrep, or set OPENCHAMBER_RIPGREP to a ${binaryName} built for the target architecture.`,
  );
 }
 fs.mkdirSync(outputDir, { recursive: true });
 for (const entry of fs.readdirSync(outputDir)) {
  if (entry === '.gitkeep') continue;
  fs.rmSync(path.join(outputDir, entry), { recursive: true, force: true });
 }
 const outputBinary = path.join(outputDir, binaryName);
 fs.copyFileSync(source, outputBinary);
 if (process.platform !== 'win32') fs.chmodSync(outputBinary, 0o755);

 const stagedVersion = readRipgrepVersion(outputBinary);
 if (!stagedVersion) throw new Error(`Staged ripgrep does not run: ${outputBinary}`);
 console.log(`[electron] staged ripgrep ${stagedVersion} from ${source}: ${outputBinary}`);
};

try {
 main();
} catch (error) {
 console.error(error instanceof Error ? error.message : error);
 process.exit(1);
}
