import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { searchPathFor } from './cli-executables.js';

describe('Host executable lookup', () => {
  const withPath = (run: (directory: string) => void) => {
    const previous = process.env.PATH;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ohpi-host-executable-'));
    process.env.PATH = directory;
    try {
      run(directory);
    } finally {
      if (previous === undefined) delete process.env.PATH;
      else process.env.PATH = previous;
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };

  test('finds an executable file on PATH', () => withPath((directory) => {
    const executable = path.join(directory, process.platform === 'win32' ? 'host-fixture.exe' : 'host-fixture');
    fs.writeFileSync(executable, '', { mode: 0o700 });
    expect(searchPathFor('host-fixture')).toBe(executable);
  }));

  test('an empty PATH has no implicit current-directory fallback', () => withPath(() => {
    process.env.PATH = '';
    expect(searchPathFor('host-fixture')).toBeNull();
  }));

  test('missing paths and directories are not executables', () => withPath((directory) => {
    fs.mkdirSync(path.join(directory, process.platform === 'win32' ? 'host-fixture.exe' : 'host-fixture'));
    process.env.PATH = `${path.join(directory, 'missing')}${path.delimiter}${directory}`;
    expect(searchPathFor('host-fixture')).toBeNull();
  }));
});
