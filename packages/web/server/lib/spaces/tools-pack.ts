import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SpaceError } from './errors.js';
import type { RunCommandFn } from './run-command.js';

const STEP_TIMEOUT_MS = 5 * 60_000;
const CHECKOUT_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

export interface PackLocalToolsDependencies {
  runCommand: RunCommandFn;
  bunPath?: string | undefined;
  checkoutRoot?: string | undefined;
  outputDirectory: string;
}

export interface PackedLocalTools {
  webTarballPath: string;
  sdkTarballPath: string;
}

export async function packLocalTools({
  runCommand,
  bunPath = 'bun',
  checkoutRoot = CHECKOUT_ROOT,
  outputDirectory,
}: PackLocalToolsDependencies): Promise<PackedLocalTools> {
  const step = async (what: string, packageName: string, args: readonly string[]): Promise<string> => {
    const cwd = path.join(checkoutRoot, 'packages', packageName);
    const result = await runCommand(bunPath, args, { cwd, timeoutMs: STEP_TIMEOUT_MS });
    if (result.code !== 0) {
      throw new SpaceError('tools_pack_failed', `Could not ${what} in ${cwd}: ${result.stderr.trim() || `exit code ${result.code}`}. Run "bun install" in the checkout, then try again.`);
    }
    return result.stdout;
  };

  const pack = async (packageName: string): Promise<string> => {
    const stdout = await step(`pack the ${packageName} package`, packageName, ['pm', 'pack', '--destination', outputDirectory, '--quiet']);
    const tarball = stdout.split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? '';
    if (!tarball.endsWith('.tgz')) {
      throw new SpaceError('tools_pack_failed', `bun did not say where it wrote the ${packageName} tarball`);
    }
    return path.resolve(outputDirectory, tarball);
  };

  await step('build the sdk package', 'sdk', ['run', 'build']);
  const sdkTarballPath = await pack('sdk');
  const webTarballPath = await pack('web');
  return { webTarballPath, sdkTarballPath };
}
