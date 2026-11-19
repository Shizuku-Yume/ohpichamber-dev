import { afterEach, describe, expect, test } from 'bun:test';
import { ChildStoreManager } from './child-store';
import { refreshDirectoryCatalogs, setSyncRefs } from './sync-refs';

const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('refreshDirectoryCatalogs', () => {
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
    const runsFor = (directory: string) => runs.filter((run) => run === directory).length;
    return { manager, runs, runsFor };
  };

  /**
   * The write that changes `planRoleAvailable` happens on the Settings page,
   * which describes its own project. The composer reads the catalog of the
   * directory its session lives in. Those are different directories, and
   * `modelRoles` is one record in the shared agent directory, so the role
   * write invalidates a fact for every initialized directory, not only the
   * one the Settings page named.
   */
  test('re-reads every initialized directory, including one Settings never named', async () => {
    const { manager, runsFor } = managerWithCounter();
    for (const directory of ['/project-a', '/project-b', '/data/chats/session-1']) {
      manager.requestBootstrap({ directory, priority: 'selected', reason: 'current-directory' });
    }
    await settle();
    expect(['/project-a', '/project-b', '/data/chats/session-1'].map(runsFor)).toEqual([1, 1, 1]);

    refreshDirectoryCatalogs();
    await settle();

    // One forced run per directory: a single re-read of the directory the
    // Settings page named would leave the composer's stale.
    expect(['/project-a', '/project-b', '/data/chats/session-1'].map(runsFor)).toEqual([2, 2, 2]);
  });

  test('keeps an untouched directory out of the re-read', async () => {
    const { manager, runs } = managerWithCounter();
    expect(manager.children.size).toBe(0);

    refreshDirectoryCatalogs();
    await settle();

    expect(runs).toEqual([]);
    expect(manager.children.size).toBe(0);
  });

  test('re-runs the lane for a directory whose catalog is already complete', async () => {
    const { manager, runs } = managerWithCounter();
    manager.requestBootstrap({ directory: '/repo', priority: 'selected', reason: 'current-directory' });
    await settle();
    expect(runs).toHaveLength(1);

    refreshDirectoryCatalogs();
    await settle();

    expect(runs).toHaveLength(2);
    expect(manager.getBootstrapState('/repo')).toBe('complete');
  });
});
