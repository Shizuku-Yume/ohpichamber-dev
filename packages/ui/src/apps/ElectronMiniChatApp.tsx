import { openSession } from '@/lib/router/openSessionFromRoute';
import React from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { MiniChatLayout } from '@/components/mini-chat/MiniChatLayout';
import { AppLinkConfirmDialog } from '@/components/chat/AppLinkConfirmDialog';
import { GlobalQuestionDialogs } from '@/components/layout/GlobalQuestionDialogs';
import { usePushVisibilityBeacon } from '@/hooks/usePushVisibilityBeacon';
import { useWindowTitle } from '@/hooks/useWindowTitle';
import { useRoutingSync } from '@/hooks/useRoutingSync';
import { useRootScrollLock } from '@/hooks/useRootScrollLock';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useConfigStore } from '@/stores/useConfigStore';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useGitStore } from '@/stores/useGitStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { seedGlobalSessionStatusFromHost } from '@/sync/host-session-status-seed';
import { refreshRecentGlobalSessions } from '@/stores/useGlobalSessionsStore';
import { subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { SyncProvider, useSessions } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { SyncRuntimeEffects } from './AppEffects';
import { useAppFontEffects } from './useAppFontEffects';
import { useMiniChatKeyboardShortcuts } from '@/hooks/useMiniChatKeyboardShortcuts';
import {
  listProjectWorktrees,
  partitionWorktreesByRegisteredProject,
  worktreeMapsEqual,
} from '@/lib/worktrees/worktreeManager';
import { refreshWorktreeTopologyForChange } from '@/lib/worktrees/worktreeTopologyRefresh';
import { subscribeOpenchamberEvents } from '@/lib/openchamberEvents';
import type { WorktreeMetadata } from '@/types/worktree';
import { CHAT_DRAFT_PROJECT_ID } from '@/lib/chatDirectories';
import { handleNativeHistoryMenu } from '@/lib/codemirror/focusedHistory';
import { readMiniChatConfig, type MiniChatConfig } from './miniChatConfig';

const MINI_CHAT_PRESENCE_CHANNEL = 'openchamber:mini-chat-presence';

type ElectronMiniChatAppProps = {
  apis: RuntimeAPIs;
};

const MiniChatBootstrap: React.FC<{ config: MiniChatConfig }> = ({ config }) => {
  const sessions = useSessions();
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);
  const projects = useProjectsStore((state) => state.projects);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const draftOpen = useSessionUIStore((state) => Boolean(state.newSessionDraft?.open));
  const draftDirectory = useSessionUIStore((state) => {
    if (!state.newSessionDraft?.open) return '';
    return state.newSessionDraft.bootstrapPendingDirectory ?? state.newSessionDraft.directoryOverride ?? '';
  });
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const openNewSessionDraft = useSessionUIStore((state) => state.openNewSessionDraft);
  const initializeApp = useConfigStore((state) => state.initializeApp);
  const isInitialized = useConfigStore((state) => state.isInitialized);
  const isConnected = useConfigStore((state) => state.isConnected);
  const loadProviders = useConfigStore((state) => state.loadProviders);
  const loadAgents = useAgentsStore((state) => state.loadAgents);
  const providersLoaded = useConfigStore((state) => state.providersLoaded);
  const sync = useSync();

  React.useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  React.useEffect(() => {
    if (isInitialized) return;
    let active = true;
    let retryCount = 0;
    const id = window.setInterval(() => {
      if (!active) return;
      retryCount += 1;
      if (retryCount > 10) {
        window.clearInterval(id);
        return;
      }
      if (!useConfigStore.getState().isInitialized) {
        void useConfigStore.getState().initializeApp();
      }
    }, 1000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [isInitialized]);

  const directoryBootstrappedRef = React.useRef(false);
  React.useEffect(() => {
    if (directoryBootstrappedRef.current) return;
    if (config.mode !== 'session') return;
    if (!config.directory) return;
    if (currentDirectory === config.directory) {
      directoryBootstrappedRef.current = true;
      return;
    }
    setDirectory(config.directory, { showOverlay: false });
    directoryBootstrappedRef.current = true;
  }, [config.directory, config.mode, currentDirectory, setDirectory]);

  React.useEffect(() => {
    if (config.mode !== 'draft' || !draftOpen || currentSessionId) return;
    if (!draftDirectory || currentDirectory === draftDirectory) return;
    setDirectory(draftDirectory, { showOverlay: false });
  }, [config.mode, currentDirectory, currentSessionId, draftDirectory, draftOpen, setDirectory]);

  React.useEffect(() => {
    if (!isConnected) return;
    if (!providersLoaded) void loadProviders({ source: 'electronMiniChat:recovery' });
    void loadAgents(currentDirectory);
  }, [currentDirectory, isConnected, loadAgents, loadProviders, providersLoaded]);

  const sessionBootstrappedRef = React.useRef(false);
  React.useEffect(() => {
    if (sessionBootstrappedRef.current) return;
    if (config.mode !== 'session' || !config.sessionId) return;
    if (currentSessionId === config.sessionId) {
      sessionBootstrappedRef.current = true;
      return;
    }
    if (currentSessionId) {
      sessionBootstrappedRef.current = true;
      return;
    }
    const session = sessions.find((entry) => entry.sessionId === config.sessionId);
    if (!session) {
      void sync.ensureSessionRenderable(config.sessionId, false, config.directory ?? undefined);
      return;
    }
    const directory = resolveGlobalSessionDirectory(session) ?? config.directory;
    setCurrentSession(config.sessionId, directory);
    sessionBootstrappedRef.current = true;
  }, [config, currentSessionId, sessions, setCurrentSession, sync]);

  React.useEffect(() => {
    const onOpenSession = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string; directory?: string }>).detail;
      const sessionId = typeof detail?.sessionId === 'string' ? detail.sessionId.trim() : '';
      if (!sessionId) return;
      if (useSessionUIStore.getState().currentSessionId === sessionId) return;
      const session = sessions.find((entry) => entry.sessionId === sessionId);
      const sessionDirectory = session ? resolveGlobalSessionDirectory(session) : null;
      const directory = sessionDirectory
        || (typeof detail?.directory === 'string' && detail.directory.trim().length > 0 ? detail.directory.trim() : null);
      void sync.ensureSessionRenderable(sessionId, false, directory ?? undefined);
      void openSession(sessionId, { directory });
      sessionBootstrappedRef.current = true;
    };
    window.addEventListener('openchamber:open-session', onOpenSession);
    return () => window.removeEventListener('openchamber:open-session', onOpenSession);
  }, [sessions, setCurrentSession, sync]);

  React.useEffect(() => {
    if (config.mode !== 'draft' || draftOpen || currentSessionId) return;
    const hasProjectTarget = Boolean(config.projectId || config.directory);
    openNewSessionDraft({
      target: hasProjectTarget ? 'project' : 'chat',
      selectedProjectId: hasProjectTarget ? config.projectId : CHAT_DRAFT_PROJECT_ID,
      directoryOverride: hasProjectTarget ? config.directory : null,
      preserveDirectoryOverride: Boolean(config.directory),
    });
  }, [config, currentSessionId, draftOpen, openNewSessionDraft]);

  React.useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;

    const discoverWorktrees = async () => {
      const worktreesByProject = new Map<string, WorktreeMetadata[]>();

      await Promise.all(projects.map(async (project) => {
        const projectPath = project.path.replace(/\\/g, '/').replace(/\/+$/, '');
        if (!projectPath) return;
        try {
          const cachedIsGitRepo = useGitStore.getState().directories.get(projectPath)?.isGitRepo;
          const isGitRepo = cachedIsGitRepo ?? await import('@/lib/gitApi').then((m) => m.checkIsGitRepository(projectPath));
          if (!isGitRepo) return;
          const worktrees = await listProjectWorktrees({ id: project.id, path: projectPath });
          if (cancelled || worktrees.length === 0) return;
          worktreesByProject.set(projectPath, worktrees);
        } catch {
          // Worktree discovery is best-effort; draft selector falls back to the project root.
        }
      }));

      if (cancelled) return;

      const partitionedWorktreesByProject = partitionWorktreesByRegisteredProject(projects, worktreesByProject);

      const currentByProject = useSessionUIStore.getState().availableWorktreesByProject;
      if (!worktreeMapsEqual(partitionedWorktreesByProject, currentByProject)) {
        useSessionUIStore.setState({
          availableWorktrees: [...partitionedWorktreesByProject.values()].flat(),
          availableWorktreesByProject: partitionedWorktreesByProject,
        });
      }
    };

    void discoverWorktrees();

    return () => {
      cancelled = true;
    };
  }, [projects]);

  React.useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    const unsubscribe = subscribeOpenchamberEvents((event) => {
      if (event.type !== 'worktree-changed') return;
      void refreshWorktreeTopologyForChange(projects, event.directories, () => cancelled);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [projects]);

  return null;
};

const MiniChatPresencePublisher: React.FC = () => {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

  React.useEffect(() => {
    if (!currentSessionId || !currentDirectory || typeof BroadcastChannel === 'undefined') return;

    const channel = new BroadcastChannel(MINI_CHAT_PRESENCE_CHANNEL);
    const postPresence = (viewed: boolean) => {
      channel.postMessage({
        type: 'mini-chat-session-presence',
        sessionId: currentSessionId,
        directory: currentDirectory,
        viewed,
      });
    };

    postPresence(true);
    const interval = window.setInterval(() => postPresence(true), 5_000);
    const handleBeforeUnload = () => postPresence(false);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      postPresence(false);
      channel.close();
    };
  }, [currentDirectory, currentSessionId]);

  return null;
};

const useSessionUnavailable = (config: MiniChatConfig): boolean => {
  const sessions = useSessions();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const draftOpen = useSessionUIStore((state) => state.newSessionDraft.open);
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    if (draftOpen || config.mode !== 'session' || !config.sessionId || currentSessionId) {
      setTimedOut(false);
      return;
    }
    if (sessions.some((entry) => entry.sessionId === config.sessionId)) {
      setTimedOut(false);
      return;
    }
    const timeout = window.setTimeout(() => setTimedOut(true), 5000);
    return () => window.clearTimeout(timeout);
  }, [config.mode, config.sessionId, currentSessionId, draftOpen, sessions]);

  return timedOut;
};

const useRecentSessions = (): void => {
  React.useEffect(() => {
    const load = () => {
      void refreshRecentGlobalSessions().then(() => seedGlobalSessionStatusFromHost()).catch(() => undefined);
    };
    load();
    return subscribeRuntimeEndpointChanged(load);
  }, []);
};

export function ElectronMiniChatApp({ apis }: ElectronMiniChatAppProps) {
  const config = React.useMemo(() => readMiniChatConfig(), []);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);

  React.useEffect(() => {
    window.addEventListener('openchamber:history-action', handleNativeHistoryMenu);
    return () => window.removeEventListener('openchamber:history-action', handleNativeHistoryMenu);
  }, []);

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

  useAppFontEffects();
  usePushVisibilityBeacon({ enabled: true });
  useWindowTitle();
  useRoutingSync();
  useRootScrollLock();
  useRecentSessions();

  return (
    <ErrorBoundary>
      <SyncProvider directory={currentDirectory || config.directory || ''}>
        <RuntimeAPIProvider apis={apis}>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <div className="h-full text-foreground bg-background">
              <ElectronMiniChatContent config={config} />
              <AppLinkConfirmDialog />
              <GlobalQuestionDialogs />
              <Toaster />
            </div>
          </TooltipProvider>
        </RuntimeAPIProvider>
      </SyncProvider>
    </ErrorBoundary>
  );
}

const MiniChatKeyboardShortcuts: React.FC = () => {
  useMiniChatKeyboardShortcuts();
  return null;
};

const ElectronMiniChatContent: React.FC<{ config: MiniChatConfig }> = ({ config }) => {
  const sessionUnavailable = useSessionUnavailable(config);

  return (
    <>
      <MiniChatKeyboardShortcuts />
      <MiniChatBootstrap config={config} />
      <MiniChatPresencePublisher />
      <SyncRuntimeEffects backgroundWorkEnabled={true} />
      <MiniChatLayout mode={config.mode} autoOpenDraft={config.mode === 'draft'} unavailable={sessionUnavailable} />
    </>
  );
};
