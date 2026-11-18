import { afterEach, describe, expect, test } from 'bun:test';
import { ChildStoreManager } from './child-store';
import { refreshDirectoryCatalog, setSyncRefs } from './sync-refs';

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('refreshDirectoryCatalog', () => {
  const managers: ChildStoreManager[] = [];

  afterEach(() => {
    for (const manager of managers.splice(0)) {
      manager.disposeAll();
    }
    setSyncRefs(new ChildStoreManager(), '');
  });

  const managerWithCounter = () => {
    const manager = new ChildStoreManager();
    managers.push(manager);
    const runs: string[] = [];
    manager.configure({ onBootstrap: (context) => { runs.push(context.directory); } });
    setSyncRefs(manager, '/repo');
    return { manager, runs };
  };

  test('asks the directory bootstrap lane for a forced catalog re-read', async () => {
    const { manager, runs } = managerWithCounter();

    refreshDirectoryCatalog('/repo');
    await settle();

    expect(runs).toEqual(['/repo']);
    expect(manager.getBootstrapState('/repo')).toBe('complete');
  });

  test('re-reads a directory whose catalog is already complete', async () => {
    const { manager, runs } = managerWithCounter();

    manager.requestBootstrap({ directory: '/repo', priority: 'selected', reason: 'current-directory' });
    await settle();
    expect(runs).toHaveLength(1);

    refreshDirectoryCatalog('/repo');
    await settle();
    expect(runs).toHaveLength(2);
  });

  test('ignores an empty directory', () => {
    const { manager } = managerWithCounter();

    refreshDirectoryCatalog('');

    expect(manager.getBootstrapState('')).toBeUndefined();
  });
});
