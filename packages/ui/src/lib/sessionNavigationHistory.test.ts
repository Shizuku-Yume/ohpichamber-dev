import { describe, expect, test } from 'bun:test';
import type { Session } from '@openchamber/agent-contract';
import { navigateSessionHistory } from './sessionNavigationHistory';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useGlobalSessionsStore } from '@/stores/useGlobalSessionsStore';
import { useProjectsStore } from '@/stores/useProjectsStore';

useProjectsStore.setState({ projects: [{ id: 'p1', path: '/repo' }] });

const session = (sessionId: string): Session => ({
  sessionId,
  projectId: 'p1',
  workspaceId: 'w1',
  displayPath: 'repo',
  rootSessionId: sessionId,
  createdAt: 1,
  updatedAt: 1,
  epoch: 'e',
  headSequence: '0',
  runtimeStatus: 'idle',
  activeRunId: null,
  mode: { kind: 'main' },
  metadata: null,
  metadataRevision: '0',
  archiveRevision: '0',
});
describe('sessionNavigationHistory', () => {
  test('steps back and forward through the visit order', () => {
    useGlobalSessionsStore.setState({ activeSessions: [session('s1'), session('s2'), session('s3')] });

    useSessionUIStore.setState({ currentSessionId: 's1' });
    useSessionUIStore.setState({ currentSessionId: 's2' });
    useSessionUIStore.setState({ currentSessionId: 's3' });

    expect(navigateSessionHistory(-1)).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s2');
    expect(navigateSessionHistory(-1)).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s1');
    expect(navigateSessionHistory(-1)).toBe(false);

    expect(navigateSessionHistory(1)).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s2');
  });


  test('skips and drops entries whose session no longer exists', () => {
    useSessionUIStore.setState({ currentSessionId: 's3' });
    useGlobalSessionsStore.setState({ activeSessions: [session('s1'), session('s3')] });
    // History behind s3 contains s2 (dead) then s1 (alive).
    expect(navigateSessionHistory(-1)).toBe(true);
    expect(useSessionUIStore.getState().currentSessionId).toBe('s1');
  });
});
