import { describe, expect, test } from 'bun:test';
import { getOmpSdkVersion, resolveOmpSdkVersion } from './omp-version.ts';

describe('resolveOmpSdkVersion', () => {
  test('resolves the real installed @oh-my-pi/pi-coding-agent version', () => {
    const version = resolveOmpSdkVersion();
    expect(version).toBeTypeOf('string');
    expect(version).toMatch(/^\d+\.\d+\.\d+/);
    expect(version).toBe('19.1.0');
  });

  test('returns undefined when the SDK package cannot be resolved', () => {
    expect(resolveOmpSdkVersion(() => { throw new Error('Cannot find module'); })).toBeUndefined();
  });

  test('returns undefined when resolution points outside any package', () => {
    expect(resolveOmpSdkVersion(() => 'file:///nonexistent/path/index.ts')).toBeUndefined();
  });

  test('walks up from a nested module file to the owning package.json', () => {
    // Resolving a deep subpath must still land on the same package version.
    const deep = resolveOmpSdkVersion(() => import.meta.resolve('@oh-my-pi/pi-coding-agent/sdk'));
    expect(deep).toBe('19.1.0');
  });

  test('the process-level cache agrees with a fresh resolution', () => {
    expect(getOmpSdkVersion()).toBe(resolveOmpSdkVersion());
  });
});
