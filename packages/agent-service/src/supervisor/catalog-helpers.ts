import { CounterSchema, type CatalogWorkerIdentity as ContractCatalogWorkerIdentity } from '@openchamber/agent-contract';

export function aggregate(outcomes: Array<{ outcome: string }>): 'applied' | 'partial' | 'failed' | 'no-active-workers' {
  const applied = outcomes.some(item => item.outcome === 'applied');
  const failed = outcomes.some(item => item.outcome === 'failed');
  return applied ? (failed ? 'partial' : 'applied') : (failed ? 'failed' : 'no-active-workers');
}

export function nextRevision(revision: string): string {
  CounterSchema.parse(revision);
  return (BigInt(revision) + 1n).toString();
}

export function ownerIdentity(worker: { identity: ContractCatalogWorkerIdentity }): ContractCatalogWorkerIdentity {
  return {
    rootSessionId: worker.identity.rootSessionId,
    workspaceId: worker.identity.workspaceId,
    workerGeneration: worker.identity.workerGeneration,
  };
}

/** The cause a failed apply reported, so the reader sees why it failed instead of
 * only that it did. Workers answer first; with no live worker the stateless probe
 * already knows the server's own failure, and its detail is the same kind of
 * evidence a worker error carries. The full per-worker result stays in `details`. */
export function applyFailureCause(
  result: { workers: Array<{ outcome: string; error?: { detail: string } }> },
  fallback: string,
  probedCause?: string,
): string {
  const causes = [...new Set(result.workers.flatMap(worker => worker.outcome === 'failed' && worker.error?.detail ? [worker.error.detail] : []))];
  if (causes.length > 0) return causes.join('; ');
  return probedCause ?? fallback;
}
