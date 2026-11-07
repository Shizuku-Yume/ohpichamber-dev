import { create } from 'zustand';

export type ProjectSettingsTab = 'general' | 'actions' | 'worktrees' | 'environment';

/**
 * The tab the Settings project page shows. It lives outside the page so a
 * Settings search result can open the tab that holds its target before the
 * page highlights it, and so switching projects keeps the tab.
 */
export const useProjectSettingsTabStore = create<{
  tab: ProjectSettingsTab;
  setTab: (tab: ProjectSettingsTab) => void;
}>((set) => ({
  tab: 'general',
  setTab: (tab) => set({ tab }),
}));
