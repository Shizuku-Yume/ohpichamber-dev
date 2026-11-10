import { createJSONStorage } from 'zustand/middleware';
import { afterAll, describe, expect, test } from 'bun:test';
import { Window } from 'happy-dom';
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'window');
const testWindow = new Window();
Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow });
const { migrateSessionDisplayState, resolveSidebarGrouping, useSessionDisplayStore } = await import('./useSessionDisplayStore');
afterAll(() => {
  testWindow.close();
  if (previousStorage) Object.defineProperty(globalThis, 'window', previousStorage);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('useSessionDisplayStore migration', () => {
  test('v10→v11 drops the worktree sort and keeps the retained preferences', () => {
    const migrated = migrateSessionDisplayState({ worktreeSortOrder: 'manual', projectSortOrder: 'a-z' }, 10);
    expect('worktreeSortOrder' in migrated).toBe(false);
    expect(migrated.projectSortOrder).toBe('a-z');
  });

  test('v9→v10 drops the removed Recent toggle and keeps the rest', () => {
    const migrated = migrateSessionDisplayState({ showRecentSection: true, projectSortOrder: 'a-z' }, 9);
    expect('showRecentSection' in migrated).toBe(false);
    expect(migrated.projectSortOrder).toBe('a-z');
  });

  test('v5→v6 drops the removed grouping key and keeps the rest', () => {
    const migrated = migrateSessionDisplayState({ sessionGroupingMode: 'flat', projectSortOrder: 'a-z' }, 5);
    expect('sessionGroupingMode' in migrated).toBe(false);
    expect(migrated.projectSortOrder).toBe('a-z');
  });

  test('v11→v12 turns two-line works on for a phone that was not on the works view', () => {
    expect(migrateSessionDisplayState({ sidebarViewMode: 'timeline' }, 11, 'mobile').detailedZoneRows).toBe(true);
    expect(migrateSessionDisplayState({ sidebarViewMode: 'projects' }, 11, 'mobile').detailedZoneRows).toBeUndefined();
    expect(migrateSessionDisplayState({ sidebarViewMode: 'timeline' }, 11, 'desktop').detailedZoneRows).toBeUndefined();
  });

  test('the persisted store keeps its version and the one-view fields', () => {
    expect(useSessionDisplayStore.persist.getOptions().version).toBe(12);
    const state = useSessionDisplayStore.getState();
    expect(state.sidebarGrouping).toBeNull();
    expect(state.listSessionGrouping).toBe('project');
    expect(state.showWorkSection).toBe(true);
    expect(state.showPinnedSection).toBe(true);
    expect(state.keepWorkInPlace).toBe(false);
  });

  test('a legacy timeline viewing user keeps a timeline-grouped sidebar', () => {
    // Untouched stored values stay as stored: the migration only drops keys.
    const resumed = migrateSessionDisplayState({ sidebarViewMode: 'timeline', listSessionGrouping: 'time' }, 11);
    expect(resolveSidebarGrouping(resumed as Parameters<typeof resolveSidebarGrouping>[0])).toBe('time');
    expect(resolveSidebarGrouping({ sidebarGrouping: 'project', listSessionGrouping: 'time', sidebarViewMode: 'timeline' })).toBe('project');
    expect(resolveSidebarGrouping({ sidebarGrouping: null, listSessionGrouping: 'time', sidebarViewMode: 'projects' })).toBe('project');
    expect(resolveSidebarGrouping({ sidebarGrouping: null, listSessionGrouping: 'project', sidebarViewMode: 'timeline' })).toBe('project');
  });
});

describe('useSessionDisplayStore project sorting', () => {
  test('defaults to manual ordering', () => {
    expect(useSessionDisplayStore.getState().projectSortOrder).toBe('manual');
  });

  test('migrates the v2 recent default to manual', () => {
    const migrated = migrateSessionDisplayState({ projectSortOrder: 'recent' }, 2);
    expect(migrated.projectSortOrder).toBe('manual');
  });

  for (const projectSortOrder of ['manual', 'a-z', 'z-a', 'date-added'] as const) {
    test(`preserves the v2 ${projectSortOrder} sort order`, () => {
      const migrated = migrateSessionDisplayState({ projectSortOrder }, 2);
      expect(migrated.projectSortOrder).toBe(projectSortOrder);
    });
  }
});

describe('useSessionDisplayStore project display', () => {
  test('defaults to showing all projects without a selected single project', () => {
    expect(useSessionDisplayStore.getState().projectDisplayMode).toBe('all');
    expect(useSessionDisplayStore.getState().singleProjectId).toBeNull();
  });

  test('stores the single-project mode independently', () => {
    useSessionDisplayStore.getState().setProjectDisplayMode('single');
    useSessionDisplayStore.getState().setSingleProjectId('project-alpha');

    expect(useSessionDisplayStore.getState().projectDisplayMode).toBe('single');
    expect(useSessionDisplayStore.getState().singleProjectId).toBe('project-alpha');

    useSessionDisplayStore.setState({ projectDisplayMode: 'all', singleProjectId: null });
  });
});

describe('useSessionDisplayStore animated activity', () => {
  test('hydrates existing v8 data with motion off and retains saved choices', async () => {
    const initialState = useSessionDisplayStore.getState();
    const originalStorage = useSessionDisplayStore.persist.getOptions().storage;
    let stored = JSON.stringify({ version: 8, state: { showRecentSection: false } });
    const storage = createJSONStorage<Partial<ReturnType<typeof useSessionDisplayStore.getState>>>(() => ({
      getItem: () => stored,
      setItem: (_name, value) => { stored = value; },
      removeItem: () => { stored = ''; },
    }));
    useSessionDisplayStore.persist.setOptions({ storage });
    try {
      await useSessionDisplayStore.persist.rehydrate();
      expect(useSessionDisplayStore.getState().animatedActivityIndicators).toBe(false);
      expect(useSessionDisplayStore.persist.getOptions().version).toBe(12);
      useSessionDisplayStore.getState().setAnimatedActivityIndicators(true);
      const enabledSnapshot = stored;
      expect(JSON.parse(enabledSnapshot)).toMatchObject({ version: 12, state: { animatedActivityIndicators: true } });
      useSessionDisplayStore.setState({ animatedActivityIndicators: false });
      stored = enabledSnapshot;
      await useSessionDisplayStore.persist.rehydrate();
      expect(useSessionDisplayStore.getState().animatedActivityIndicators).toBe(true);
    } finally {
      useSessionDisplayStore.persist.setOptions({ storage: originalStorage });
      useSessionDisplayStore.setState(initialState);
    }
  });
});

describe('useSessionDisplayStore cached sections', () => {
  test('sections cached by an older build are read through the stored rules', async () => {
    const initialState = useSessionDisplayStore.getState();
    const originalStorage = useSessionDisplayStore.persist.getOptions().storage;
    const older = { kind: 'custom', id: 's1', name: 'Old', grouping: 'time', filter: { states: ['running'] }, claims: false, hideWhenEmpty: true };
    const stored = JSON.stringify({ version: 12, state: { sections: [older] } });
    const storage = createJSONStorage<Partial<ReturnType<typeof useSessionDisplayStore.getState>>>(() => ({
      getItem: () => stored,
      setItem: () => undefined,
      removeItem: () => undefined,
    }));
    useSessionDisplayStore.persist.setOptions({ storage });
    try {
      await useSessionDisplayStore.persist.rehydrate();
      const section = useSessionDisplayStore.getState().sections.find((entry) => entry.id === 's1');
      expect(section?.kind === 'custom' ? section.filter.text : null).toEqual([]);
      expect(useSessionDisplayStore.getState().sections.some((entry) => entry.id === 'projects')).toBe(true);
    } finally {
      useSessionDisplayStore.persist.setOptions({ storage: originalStorage });
      useSessionDisplayStore.setState(initialState);
    }
  });
});
