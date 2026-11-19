import type { Agent } from '@openchamber/agent-contract';
import type { Theme } from '@/types/theme';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { selectAgentsForDirectory, useAgentsStore } from '@/stores/useAgentsStore';
import { createAgentColorResolver } from '@/lib/agentColors';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';

const resolvers = new WeakMap<Theme, WeakMap<Agent[], ReturnType<typeof createAgentColorResolver>>>();

export function useAgentColors(directory?: string | null) {
  const { currentTheme } = useThemeSystem();
  const effectiveDirectory = useEffectiveDirectory();
  const agents = useAgentsStore((state) => selectAgentsForDirectory(state, directory === undefined ? effectiveDirectory ?? null : directory));
  let byRoster = resolvers.get(currentTheme);
  if (!byRoster) {
    byRoster = new WeakMap();
    resolvers.set(currentTheme, byRoster);
  }
  let resolver = byRoster.get(agents);
  if (!resolver) {
    resolver = createAgentColorResolver(currentTheme, agents);
    byRoster.set(agents, resolver);
  }
  return resolver;
}
