import { canonicalClient } from '@/api/canonicalClient';
import type { CapturedSendOptions, Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { getMultiRunMembership, multiRunMembershipPatch, withMultiRunMembership, type MultiRunIdentity } from './identity';

/** Bind the server-assigned ID before dispatch. Copied markers cannot join. */
export async function createMultiRunSession(
  input: {
    title: string;
    directory: string;
    identity: Omit<MultiRunIdentity, 'key'>;
    selection: CapturedSendOptions;
  },
  assertCurrent: () => void,
): Promise<Session> {
  assertCurrent();
  const workspace = await canonicalClient.resolveWorkspace(input.directory);
  assertCurrent();
  registerWorkspaceDirectory(workspace.workspaceId, input.directory);
  const membership = { ...input.identity, version: 1 as const, sessionID: null };
  const { session } = await canonicalClient.createSession({
    projectId: workspace.projectId,
    workspaceId: workspace.workspaceId,
    options: input.selection,
    metadata: { ...withMultiRunMembership({ metadata: null }, membership), title: input.title },
  });
  try {
    assertCurrent();
    const result = await canonicalClient.patchSessionMetadata(session.sessionId,
      multiRunMembershipPatch({ ...membership, sessionID: session.sessionId }));
    assertCurrent();
    const bound: Session = { ...session, metadata: result.metadata, metadataRevision: result.revision };
    if (!getMultiRunMembership(bound)) throw new Error('Multi-run membership was not saved');
    return bound;
  } catch (error) {
    // Never delete through a switched runtime. The pending marker remains ineligible.
    assertCurrent();
    try {
      await canonicalClient.deleteSession(session.sessionId);
    } catch {
      console.warn('[MultiRun] Could not remove an undispatched session after membership failure');
    }
    throw error;
  }
}
