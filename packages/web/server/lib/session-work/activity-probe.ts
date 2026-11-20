import { ShellSnapshotSchema, SubagentListResponseSchema, type Subagent } from '@openchamber/agent-contract';

export interface RunningSessionJob { kind: string; startedAt: number }
export interface SessionActivityProbe {
  fetchRunningBackgroundJobs(sessionId: string): Promise<RunningSessionJob[] | null>;
  fetchActiveSessionStatuses(sessionId: string): Promise<Subagent[] | null>;
  hasWorkingChildren(sessionId: string, statuses: Subagent[]): Promise<boolean>;
}

export const createCanonicalActivityProbe = ({ service }: {
  service: { request(path: string, init?: RequestInit): Promise<Response> };
}): SessionActivityProbe => {
  const read = async (sessionId: string, suffix: string) => {
    const response = await service.request(`/api/agent/v1/sessions/${encodeURIComponent(sessionId)}/${suffix}`, { signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error('Session activity unavailable');
    return response.json();
  };
  return {
    async fetchRunningBackgroundJobs(sessionId) {
      try {
        const snapshot = ShellSnapshotSchema.parse(await read(sessionId, 'shell/jobs'));
        if (snapshot.scope.kind !== 'session' || snapshot.scope.sessionId !== sessionId) return null;
        return snapshot.running.filter((job) => job.sessionId === sessionId && job.background)
          .map((job) => ({ kind: 'shell', startedAt: job.startedAt }));
      } catch { return null; }
    },
    async fetchActiveSessionStatuses(sessionId) {
      try { return SubagentListResponseSchema.parse(await read(sessionId, 'subagents')).subagents; }
      catch { return null; }
    },
    async hasWorkingChildren(sessionId, statuses) {
      const parents = new Set([sessionId]);
      for (let previous = 0; previous !== parents.size;) {
        previous = parents.size;
        for (const child of statuses) {
          if (!child.persisted && parents.has(child.parentSessionId)) {
            if (child.status === 'running') return true;
            parents.add(child.childSessionId);
          }
        }
      }
      return false;
    },
  };
};
