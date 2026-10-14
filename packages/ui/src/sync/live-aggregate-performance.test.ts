import { describe, expect, test } from 'bun:test';
import type { Session, SessionRuntimeStatus } from '@openchamber/agent-contract';
import { aggregateLiveSessionStatuses, areSessionListsEquivalent } from './live-aggregate';
import { getSyncPerformanceDiagnostics, resetSyncPerformanceDiagnostics, setSyncPerformanceDiagnosticsEnabled } from './performance-diagnostics';
const session = (sessionId: string, updatedAt: number): Session => ({ sessionId, projectId: 'project_1', workspaceId: 'workspace_1', displayPath: 'session', rootSessionId: sessionId, createdAt: updatedAt, updatedAt, epoch: 'epoch_1', headSequence: '0', runtimeStatus: 'running', activeRunId: 'run_1', metadata: null, metadataRevision: '0', archiveRevision: '0' });
describe('native live status aggregation', () => {
  test('indexes each session once instead of scanning per status', () => {
    const sessions = Array.from({ length: 50 }, (_, index) => session(`session-${index}`, index));
    const session_status = Object.fromEntries(sessions.map((item) => [item.sessionId, 'running' as SessionRuntimeStatus]));
    resetSyncPerformanceDiagnostics(); setSyncPerformanceDiagnosticsEnabled(true);
    const statuses = aggregateLiveSessionStatuses([{ session: sessions, session_status }]);
    const diagnostics = getSyncPerformanceDiagnostics();
    expect(Object.keys(statuses)).toHaveLength(50); expect(diagnostics?.statusAggregationSessionEntries).toBe(50); expect(diagnostics?.statusAggregationCandidates).toBe(50);
    setSyncPerformanceDiagnosticsEnabled(false);
  });
  test('canonical epoch, cursor, and metadata changes invalidate session equality', () => {
    const original = session('session_1', 10);
    expect(areSessionListsEquivalent([original], [{ ...original }])).toBe(true);
    expect(areSessionListsEquivalent([original], [{ ...original, epoch: 'epoch_2' }])).toBe(false);
    expect(areSessionListsEquivalent([original], [{ ...original, headSequence: '1' }])).toBe(false);
    expect(areSessionListsEquivalent([original], [{ ...original, metadata: { title: 'Renamed' }, metadataRevision: '1' }])).toBe(false);
  });
});
