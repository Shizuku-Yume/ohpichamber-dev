import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { Session, SessionMetadata } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import * as runtime from '@/lib/runtime-switch';
import * as multiRunStore from '@/stores/useMultiRunStore';
import { registerWorkspaceDirectory, resetWorkspaceDirectories } from '@/stores/globalSessions';
import { getMultiRunMembership, withMultiRunMembership } from './identity';
import { buildMultiRunIndex } from './runs';
import { addLaneToRun, detachFromRun, renameRun } from './runActions';
import { useSelectionStore } from '@/sync/selection-store';
import * as laneData from './laneData';
import * as location from './keep';
import * as creation from './createSession';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const group = { kind: 'id', id: '9f512893-6e63-4e49-a534-5de733ca103e' } as const;
function fixture() {
  resetWorkspaceDirectories();
  registerWorkspaceDirectory('workspace', '/repo');
  const sessions = ['a', 'b'].map((sessionId): Session => {
    const session: Session = { sessionId, rootSessionId: sessionId, projectId: 'project', workspaceId: 'workspace', displayPath: '.',
      createdAt: 1, updatedAt: 1, epoch: 'epoch', headSequence: '0', runtimeStatus: 'idle', activeRunId: null,
      metadata: { title: 'lane', notes: 'preserve', openchamber: { goal: { status: 'active' } } }, metadataRevision: '1', archiveRevision: '0' };
    session.metadata = withMultiRunMembership(session, { version: 1, sessionID: sessionId, group, groupSlug: 'run', role: 'run', providerID: 'provider', modelID: 'model', runGroup: 'g1', index: 2 });
    return session;
  });
  const run = [...buildMultiRunIndex(sessions, (session) => session.projectId).runs.values()][0];
  const published: Session[] = [];
  spies.push(spyOn(multiRunStore, 'registerMultiRunSession').mockImplementation((session, _directory, metadata) => {
    const updated = metadata ? { ...session, metadata: metadata.metadata, metadataRevision: metadata.revision } : session;
    published.push(updated);
    return updated;
  }));
  spies.push(spyOn(canonicalClient, 'getSessionMetadata').mockImplementation(async (sessionId) => ({ sessionId, metadata: sessions.find((session) => session.sessionId === sessionId)!.metadata, revision: '1' })));
  return { sessions, run, published, sessionById: new Map(sessions.map((session) => [session.sessionId, session])) };
}

describe('canonical multi-run metadata actions', () => {
  test('rename sends full native marker and preserves unrelated server metadata', async () => {
    const api = fixture();
    const writes = spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(async (sessionId, patch) => {
      const original = api.sessionById.get(sessionId)!;
      const metadata: SessionMetadata = { ...original.metadata, openchamber: { ...original.metadata?.openchamber, multirun: patch.changes.openchamber?.multirun ?? undefined } };
      return { sessionId, metadata, revision: '2' };
    });
    spies.push(writes);
    expect(await renameRun(api.run, 'Renamed', api.sessionById)).toEqual([]);
    for (const [sessionId, patch] of writes.mock.calls) {
      expect(patch).toEqual({ changes: { openchamber: { multirun: { ...getMultiRunMembership(api.sessionById.get(sessionId)!), title: 'Renamed' } } } });
    }
    expect(api.published).toHaveLength(2);
    expect(api.published[0].metadata).toMatchObject({ notes: 'preserve', openchamber: { goal: { status: 'active' } } });
  });
  test('rename isolates one failed member without rewriting its sibling identity', async () => {
    const api = fixture();
    spies.push(spyOn(canonicalClient, 'patchSessionMetadata').mockImplementation(async (sessionId, patch) => {
      if (sessionId === 'a') throw new Error('Write failed');
      return { sessionId, metadata: { openchamber: { multirun: patch.changes.openchamber?.multirun ?? undefined } }, revision: '2' };
    }));
    expect(await renameRun(api.run, 'Renamed', api.sessionById)).toEqual(['a']);
    expect(api.published.map((session) => session.sessionId)).toEqual(['b']);
    expect(getMultiRunMembership(api.published[0])).toMatchObject({ sessionID: 'b', runGroup: 'g1', index: 2, title: 'Renamed' });
  });
  test('detach atomically clears marker and changes native title', async () => {
    const api = fixture();
    const write = spyOn(canonicalClient, 'patchSessionMetadata').mockResolvedValue({ sessionId: 'a', metadata: { title: 'Run', notes: 'preserve' }, revision: '2' });
    spies.push(write);
    await detachFromRun(api.sessions[0], 'Run');
    expect(write.mock.calls[0]).toEqual(['a', { changes: { title: 'Run', openchamber: { multirun: null } } }]);
    expect(api.published[0].metadata).toEqual({ title: 'Run', notes: 'preserve' });
  });
  test('runtime switch after metadata read prevents writes and publication', async () => {
    const api = fixture();
    let key = 'first';
    spies.push(spyOn(runtime, 'getRuntimeKey').mockImplementation(() => key));
    spies.push(spyOn(canonicalClient, 'getSessionMetadata').mockImplementation(async (sessionId) => { key = 'second'; return { sessionId, metadata: api.sessions[0].metadata, revision: '1' }; }));
    const write = spyOn(canonicalClient, 'patchSessionMetadata');
    spies.push(write);
    await expect(renameRun(api.run, 'Renamed', api.sessionById)).rejects.toThrow('Runtime changed');
    expect(write.mock.calls.length).toBe(0);
    expect(api.published).toEqual([]);
  });
  test('new model lanes retain the source profile captured before history awaits', async () => {
    const api = fixture();
    useSelectionStore.getState().saveSessionAgentSelection('a', 'source-agent');
    spies.push(spyOn(laneData, 'loadLaneFirstPrompt').mockImplementation(async () => {
      useSelectionStore.getState().saveSessionAgentSelection('a', 'later-agent');
      return { messageId: 'prompt', turnId: 'turn', text: 'question', files: [] };
    }));
    spies.push(spyOn(location, 'resolveRunMemberLocation').mockResolvedValue(null));
    const create = spyOn(creation, 'createMultiRunSession').mockResolvedValue({ ...api.sessions[0], sessionId: 'added', rootSessionId: 'added' });
    const dispatch = spyOn(multiRunStore, 'dispatchRunPrompt').mockResolvedValue(undefined);
    spies.push(create, dispatch);
    await addLaneToRun({ run: api.run, runGroup: 'g1', model: { providerId: 'replacement', modelId: 'model' }, sessionById: api.sessionById });
    expect(create.mock.calls[0][0].selection.agentId).toBe('source-agent');
    expect(dispatch.mock.calls[0][0]).toMatchObject({ agentId: 'source-agent', workspaceId: 'workspace', attachmentWorkspaceId: 'workspace' });
    useSelectionStore.getState().clearSessionSelections('a');
  });
});
