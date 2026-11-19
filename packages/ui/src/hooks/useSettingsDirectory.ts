import { useChatsRoot } from '@/hooks/useChatsRoot';
import type { ProjectEntry } from '@/lib/api/types';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';

<<<<<<< HEAD
/**
 * Resolves which project the Settings pages describe.
 *
 * `settingsProjectPath` is the user's pick in the Settings project selector.
 * Until they make one — or when the project it names is gone — Settings follows
 * the active project, then the Host's managed chats root when no project exists.
 */
||||||| bc50ba56aa
/**
 * Resolves which project the Settings pages describe.
 *
 * `settingsProjectPath` is the user's pick in the Settings project selector.
 * Until they make one — or when the project it names is gone — Settings follows
 * the app's active project, so nothing looks different before it is used.
 */
=======
>>>>>>> upstream/main
export const resolveSettingsDirectory = (
  settingsProjectPath: string | null,
  projects: ProjectEntry[],
  activeProjectId: string | null,
  chatsRoot: string | null,
): string | null => {
  if (settingsProjectPath && projects.some((project) => project.path === settingsProjectPath)) {
    return settingsProjectPath;
  }

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  return activeProject?.path ?? chatsRoot;
};

export const useSettingsDirectory = (): string | null => {
  const settingsProjectPath = useUIStore((state) => state.settingsProjectPath);
  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const chatsRoot = useChatsRoot();

  return resolveSettingsDirectory(settingsProjectPath, projects, activeProjectId, chatsRoot);
};
