import { AgentServiceReadySchema } from '@openchamber/agent-contract';
import { runtimeFetch } from './runtime-fetch';
import type { InitFailure } from '@/stores/useConfigStore';

export type StartupDiagnostics = {
  error: string | null;
  binary: string | null;
};

export const fetchStartupDiagnostics = async (
  signal: AbortSignal,
  request: typeof runtimeFetch = runtimeFetch,
): Promise<StartupDiagnostics | null> => {
  const response = await request('/api/agent/v1/ready', {
    signal,
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
<<<<<<< HEAD
  if (!response.ok) throw new Error(`Agent Service readiness request failed (${response.status})`);
  const ready = AgentServiceReadySchema.safeParse(await response.json());
  return ready.success ? null : { error: null, binary: null };
||||||| bc50ba56aa
  if (!response.ok) throw new Error(`Startup diagnostics request failed (${response.status})`);
  const health = healthSchema.parse(await response.json());

  // A historical process error is not a current failure after OpenCode recovers.
  if (health.isOpenCodeReady === true) return null;
  if (health.isOpenCodeReady !== false && health.openCodeRunning !== false) return null;

  return {
    error: health.lastOpenCodeError || null,
    binary: health.lastOpenCodeLaunchDiagnostics?.sourceBinary
      || health.opencodeBinaryResolved
      || health.lastOpenCodeLaunchDiagnostics?.binary
      || null,
  };
=======
  if (!response.ok) throw new Error(`Startup diagnostics request failed (${response.status})`);
  const health = healthSchema.parse(await response.json());

  if (health.isOpenCodeReady === true) return null;
  if (health.isOpenCodeReady !== false && health.openCodeRunning !== false) return null;

  return {
    error: health.lastOpenCodeError || null,
    binary: health.lastOpenCodeLaunchDiagnostics?.sourceBinary
      || health.opencodeBinaryResolved
      || health.lastOpenCodeLaunchDiagnostics?.binary
      || null,
  };
>>>>>>> upstream/main
};

type InitRecoveryDescriptionKey =
  | 'startup.initRecovery.agentServiceUnavailable'
  | 'startup.initRecovery.serverUnreachable'
  | 'startup.initRecovery.loadAgentsFailed'
  | 'startup.initRecovery.unexpected';

export const getInitRecoveryDescriptionKey = (
  diagnostics: StartupDiagnostics | null,
  failure: InitFailure | null,
): InitRecoveryDescriptionKey => {
  if (diagnostics) return 'startup.initRecovery.agentServiceUnavailable';
  switch (failure?.step) {
    case 'serverUnreachable': return 'startup.initRecovery.serverUnreachable';
    case 'agentServiceUnavailable': return 'startup.initRecovery.agentServiceUnavailable';
    case 'loadAgents': return 'startup.initRecovery.loadAgentsFailed';
    default: return 'startup.initRecovery.unexpected';
  }
};
