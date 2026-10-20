import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, chmod, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { isExecutable } from './executable.js';

let root;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('Host executable probe', () => {
  it('accepts executable files and rejects missing files, directories, and non-executable files', async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ohpi-host-executable-'));
    const executable = path.join(root, 'tool');
    const plainFile = path.join(root, 'plain');
    await writeFile(executable, 'tool');
    await writeFile(plainFile, 'plain');
    await chmod(executable, 0o755);
    await chmod(plainFile, 0o644);

    expect(isExecutable(executable)).toBe(true);
    expect(isExecutable(plainFile)).toBe(process.platform === 'win32');
    expect(isExecutable(root)).toBe(false);
    expect(isExecutable(path.join(root, 'missing'))).toBe(false);
  });
});
