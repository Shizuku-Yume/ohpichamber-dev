import * as React from 'react';
import { captureRuntimeInstance, getRuntimeSwitchRevision, subscribeRuntimeEndpointChanged } from '@/lib/runtime-switch';
import { fetchEligibleScheduledTaskTargets } from '@/lib/scheduledTasksApi';
import { useGlobalSessionsStore, refreshGlobalSessions, resolveGlobalSessionDirectory } from '@/stores/useGlobalSessionsStore';
import { useAllLiveSessions } from '@/sync/sync-context';
import { scheduledTaskTargetCandidates, scheduledTaskTargetLoad } from './scheduledTaskTargetResults';

type Eligibility =
  | { status: 'idle' | 'loading' | 'error' }
  | { status: 'ready'; ids: ReadonlySet<string>; coversCache: boolean; projectId: string; runtimeRevision: number };

export function useScheduledTaskTargets({ open, projectId }: { open: boolean; projectId: string }) {
  const runtimeRevision = React.useSyncExternalStore(subscribeRuntimeEndpointChanged, getRuntimeSwitchRevision, getRuntimeSwitchRevision);
  const globalSessions = useGlobalSessionsStore((state) => state.activeSessions);
  const archivedGlobalSessions = useGlobalSessionsStore((state) => state.archivedSessions);
  const liveSessions = useAllLiveSessions();
  const cacheStatus = useGlobalSessionsStore((state) => state.status);
  const cacheLoaded = useGlobalSessionsStore((state) => state.hasLoaded);
  const candidates = React.useMemo(() => scheduledTaskTargetCandidates(globalSessions, archivedGlobalSessions, liveSessions), [globalSessions, archivedGlobalSessions, liveSessions]);
  const candidatesKey = React.useMemo(
    () => candidates.map((session) => `${session.sessionId}:${resolveGlobalSessionDirectory(session) ?? ''}`).sort().join('\n'),
    [candidates],
  );
  const candidatesRef = React.useRef(candidates);
  candidatesRef.current = candidates;
  const [stored, setEligibility] = React.useState<Eligibility>({ status: 'idle' });
  const eligibility: Eligibility = stored.status === 'ready' && (stored.projectId !== projectId || stored.runtimeRevision !== runtimeRevision) ? { status: 'loading' } : stored;
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!open || !projectId || !candidatesKey) {
      setEligibility({ status: 'idle' });
      return undefined;
    }
    const controller = new AbortController();
    const isCurrent = captureRuntimeInstance();
    const coversCache = cacheLoaded;
    setEligibility((current) => (current.status === 'ready' && current.coversCache && current.projectId === projectId ? current : { status: 'loading' }));
    fetchEligibleScheduledTaskTargets(
      projectId,
      candidatesRef.current.map((session) => ({ sessionId: session.sessionId, directory: resolveGlobalSessionDirectory(session) ?? '' })),
      controller.signal,
    ).then(
      (ids) => {
        if (!controller.signal.aborted && isCurrent()) setEligibility({ status: 'ready', ids, coversCache, projectId, runtimeRevision });
      },
      () => {
        if (!controller.signal.aborted && isCurrent()) setEligibility({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, [open, projectId, candidatesKey, attempt, cacheLoaded, runtimeRevision]);

  React.useEffect(() => {
    if (open) void refreshGlobalSessions().catch(() => undefined);
  }, [open]);

  const load = scheduledTaskTargetLoad({
    eligibility: eligibility.status,
    eligibilityCoversCache: eligibility.status === 'ready' && eligibility.coversCache,
    cacheLoaded,
    cacheStatus,
    hasCandidates: candidates.length > 0,
  });
  const eligible = React.useMemo(
    () => (eligibility.status === 'ready' ? candidates.filter((session) => eligibility.ids.has(session.sessionId)) : []),
    [candidates, eligibility],
  );
  const known = React.useMemo(() => [...candidates, ...archivedGlobalSessions], [candidates, archivedGlobalSessions]);
  const retry = React.useCallback(() => {
    setAttempt((value) => value + 1);
    void refreshGlobalSessions().catch(() => undefined);
  }, []);

  return { known, eligible, load, retry };
}
