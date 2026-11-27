import { useProjectsStore } from "@/stores/useProjectsStore";
import { resolveConfigDirectory, toDirectoryKey } from "./directories";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useConfigStore } from "../useConfigStore";
import { resolveProjectDirectory } from "./worktreeProjects";
import { normalizeOptionalString } from "./selectionResolution";

export const getFallbackProjectDirectory = (): string | null => {
    try {
        const {
            projects,
            activeProjectId
        } = useProjectsStore.getState();
        const active = activeProjectId ? projects.find(project => project.id === activeProjectId) : null;
        return resolveConfigDirectory(active?.path ?? projects[0]?.path ?? null);
    } catch {
        return null;
    }
};
export const getProjectDefaultsForConfigDirectory = (directory: string | null | undefined) => {
    const configDirectory = resolveConfigDirectory(directory);
    const session = useSessionUIStore.getState();
    if (!session.currentSessionId && session.newSessionDraft?.open && session.newSessionDraft.target === 'chat'
        && (!configDirectory || toDirectoryKey(configDirectory) === useConfigStore.getState().activeDirectoryKey)) {
        const config = useConfigStore.getState();
        return { projectDefaultModel: config.chatsDefaultModel, projectDefaultVariant: config.chatsDefaultVariant };
    }
    if (!configDirectory) {
        return {};
    }
    const projectDirectory = resolveProjectDirectory(configDirectory);
    const project = useProjectsStore.getState().projects.find(entry => resolveConfigDirectory(entry.path) === projectDirectory);
    return {
        projectDefaultModel: normalizeOptionalString(project?.defaultModel),
        projectDefaultVariant: normalizeOptionalString(project?.defaultVariant)
    };
};

/**
  * The effort configured next to a default model applies to that model only:
  * the project's for the project model, the settings one for the settings
  * model. Any other model starts on its own default, so an effort chosen for
  * one model never follows the user onto the next.
  */
