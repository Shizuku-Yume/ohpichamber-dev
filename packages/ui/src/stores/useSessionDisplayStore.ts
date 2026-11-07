import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getSettingsSurface } from '@/lib/settings/surface';
import type { SettingsSurface } from '@/lib/settings/registry';

type ProjectSortOrder = 'manual' | 'a-z' | 'z-a' | 'date-added' | 'recent';
type ListSessionGrouping = 'project' | 'time';
type ProjectDisplayMode = 'all' | 'single';

type SessionDisplayStore = {
  projectDisplayMode: ProjectDisplayMode;
  singleProjectId: string | null;
  setProjectDisplayMode: (mode: ProjectDisplayMode) => void;
  setSingleProjectId: (projectId: string) => void;

  listSessionGrouping: ListSessionGrouping;
  setListSessionGrouping: (grouping: ListSessionGrouping) => void;
  /**
   * The sidebar's one view, on the desktop, the web and the phone: under each
   * project, or one list by time. Null until chosen, when it follows the
   * List/Tree pair it replaced (`resolveSidebarGrouping`).
   */
  sidebarGrouping: ListSessionGrouping | null;
  setSidebarGrouping: (grouping: ListSessionGrouping) => void;
  /** A work in the In work block also stays in its project or folder; off by default. */
  keepWorkInPlace: boolean;
  setKeepWorkInPlace: (keep: boolean) => void;
  /** Local display preference; motion remains opt-in. */
  animatedActivityIndicators: boolean;
  setAnimatedActivityIndicators: (enabled: boolean) => void;

  /** The managed Chats block in the sidebar (web and desktop). */
  showChatsSection: boolean;
  /** The In work block; hidden, its sessions stay in their projects. */
  showWorkSection: boolean;
  /** The Pinned block above In work; off by default. Hidden, pinned sessions stay in their projects. */
  showPinnedSection: boolean;
  /**
   * Works in two lines (branch, reference, project where projects mix) rather
   * than one. Off by default on a computer, on by default on a phone, whose
   * full-width rows have the room.
   */
  detailedZoneRows: boolean;
  projectSortOrder: ProjectSortOrder;

  setShowChatsSection: (show: boolean) => void;
  setShowWorkSection: (show: boolean) => void;
  setShowPinnedSection: (show: boolean) => void;
  setDetailedZoneRows: (detailed: boolean) => void;
  setProjectSortOrder: (order: ProjectSortOrder) => void;
};

export const migrateSessionDisplayState = (
  persisted: unknown,
  version: number,
  surface: SettingsSurface = getSettingsSurface(),
): Partial<SessionDisplayStore> => {
  const state = (persisted ?? {}) as Partial<SessionDisplayStore> & {
    displayMode?: string;
    sessionGroupingMode?: string;
    stickyZoneHeaders?: boolean;
    showArchivedSessions?: boolean;
    showRecentSection?: boolean;
    sidebarViewMode?: string;
    worktreeSortOrder?: string;
  };
  if (version < 2) {
    state.projectSortOrder = 'manual';
  }
  if (version < 3 && state.projectSortOrder === 'recent') {
    state.projectSortOrder = 'manual';
  }
  if (version < 4) {
    // v4 removes the default/minimal display mode: the sidebar now has a
    // single row layout. Drop the stale key from persisted state.
    delete state.displayMode;
  }
  if (version < 6) {
    // v6 removes the by-worktree/flat grouping choice: the projects view always
    // groups by worktree, and the flat recency list became the timeline view.
    delete state.sessionGroupingMode;
  }
  if (version < 7) {
    // v7 removes the sticky-headers toggle: the projects view always pins its
    // zone headers and the timeline never does.
    delete state.stickyZoneHeaders;
  }
  if (version < 8) {
    state.showRecentSection = false;
  }
  if (version < 9 && !state.worktreeSortOrder) {
    state.worktreeSortOrder = 'manual';
  }
  if (version < 10) {
    delete state.showArchivedSessions;
  }
  if (version < 11) {
    if (state.showWorkSection === undefined) state.showWorkSection = true;
    if (state.showPinnedSection === undefined) state.showPinnedSection = true;
    if (state.keepWorkInPlace === undefined) state.keepWorkInPlace = false;
    const legacyTimeline = state.sidebarViewMode === 'timeline';
    if (state.sidebarGrouping === undefined || state.sidebarGrouping === null) {
      state.sidebarGrouping = legacyTimeline ? 'time' : null;
    }
    if (state.listSessionGrouping === undefined) {
      state.listSessionGrouping = legacyTimeline ? 'time' : 'project';
    }
  }
  if (version < 12 && surface === 'mobile' && state.sidebarViewMode !== 'projects') {
    state.detailedZoneRows = true;
  }
  if (version < 13) {
    delete state.showRecentSection;
    delete state.sidebarViewMode;
    delete state.worktreeSortOrder;
  }
  return state;
};

/**
 * How the desktop and web sidebar groups works. Before the choice is made in
 * the one view, a List sorted by time keeps its list by time; Tree and List by
 * project both group under projects.
 */
export const resolveSidebarGrouping = (
  state: Pick<SessionDisplayStore, 'sidebarGrouping' | 'listSessionGrouping'>,
): ListSessionGrouping => state.sidebarGrouping
  ?? (state.listSessionGrouping === 'time' ? 'time' : 'project');

export const useSessionDisplayStore = create<SessionDisplayStore>()(
  persist(
    (set) => ({
      animatedActivityIndicators: false,
      setAnimatedActivityIndicators: (enabled) => set({ animatedActivityIndicators: enabled }),
      projectDisplayMode: 'all',
      singleProjectId: null,
      setProjectDisplayMode: (mode) => set({ projectDisplayMode: mode }),
      setSingleProjectId: (projectId) => set({ singleProjectId: projectId }),

      listSessionGrouping: 'project',
      setListSessionGrouping: (grouping) => set({ listSessionGrouping: grouping }),
      sidebarGrouping: null,
      setSidebarGrouping: (grouping) => set({ sidebarGrouping: grouping }),
      keepWorkInPlace: false,
      setKeepWorkInPlace: (keep) => set({ keepWorkInPlace: keep }),

      showChatsSection: true,
      showWorkSection: true,
      showPinnedSection: true,
      detailedZoneRows: getSettingsSurface() === 'mobile',
      projectSortOrder: 'manual',

      setShowChatsSection: (show) => set({ showChatsSection: show }),
      setShowWorkSection: (show) => set({ showWorkSection: show }),
      setShowPinnedSection: (show) => set({ showPinnedSection: show }),
      setDetailedZoneRows: (detailed) => set({ detailedZoneRows: detailed }),
      setProjectSortOrder: (order) => set({ projectSortOrder: order }),
    }),
    {
      name: 'session-display-mode',
      version: 13,
      migrate: migrateSessionDisplayState,
    },
  ),
);

export type {
  ProjectSortOrder
};
