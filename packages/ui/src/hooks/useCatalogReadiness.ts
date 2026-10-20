import { selectCatalogLoadedForDirectory, useConfigStore } from '@/stores/useConfigStore';
import { selectAgentCatalogStatus, useAgentsStore } from '@/stores/useAgentsStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';

export function useCatalogReadiness(resource: 'models' | 'agents' = 'models', directory?: string | null) {
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const scopedDirectory = directory === undefined ? currentDirectory : directory;
  const connectionPhase = useConfigStore((state) => state.connectionPhase);
  const modelsReady = useConfigStore((state) => selectCatalogLoadedForDirectory(state, 'models', scopedDirectory));
  const modelsFailed = useConfigStore((state) => Boolean(state.lastInitFailure)
    || state.lastDisconnectReason === 'init_error');
  const agentStatus = useAgentsStore((state) => selectAgentCatalogStatus(state, scopedDirectory));
  const isReady = resource === 'agents' ? agentStatus === 'ready' : modelsReady;
  const isUnavailable = resource === 'agents' ? agentStatus === 'error' : !modelsReady && modelsFailed;

  return {
    isReady,
    isLoading: !isReady && !isUnavailable,
    isUnavailable,
    connectionPhase,
  };
}
