import { canonicalClient } from '@/api/canonicalClient';
import type { CapturedSendOptions, Session } from '@openchamber/agent-contract';
import { registerWorkspaceDirectory } from '@/stores/globalSessions';
import { getMultiRunMembership, multiRunMembershipPatch, withMultiRunMembership, type MultiRunIdentity } from './identity';

<<<<<<< HEAD
/** Bind the server-assigned ID before dispatch. Copied markers cannot join. */
||||||| bc50ba56aa
/** Bind the server-assigned ID before dispatch. A fork inherits this ID and cannot join. */
=======
>>>>>>> upstream/main
export async function createMultiRunSession(
  input: {
    title: string;
    directory: string;
    identity: Omit<MultiRunIdentity, 'key'>;
<<<<<<< HEAD
    selection: CapturedSendOptions;
||||||| bc50ba56aa
    /** Model and agent the run is pinned to; v2 sets them on the session, not per prompt. */
    selection?: { model?: ModelRef; agent?: string };
=======
    selection?: { model?: ModelRef; agent?: string };
>>>>>>> upstream/main
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
    title: input.title,
    metadata: withMultiRunMembership({ metadata: null }, membership),
  });
  try {
    assertCurrent();
<<<<<<< HEAD
    const result = await canonicalClient.patchSessionMetadata(session.sessionId,
      multiRunMembershipPatch({ ...membership, sessionID: session.sessionId }));
||||||| bc50ba56aa
    // OpenCode 2.x takes metadata only at creation, so the ID is bound through
    // OpenChamber's own metadata route. It applies an RFC 7386 merge patch, so
    // only the marker travels and nothing another feature wrote under
    // `openchamber` in the meantime is replaced — no read-modify-write needed.
    const result = await requestSessionMetadataUpdate(
      session.id,
      multiRunMembershipPatch({ ...membership, sessionID: session.id }),
    );
=======
    const result = await requestSessionMetadataUpdate(
      session.id,
      multiRunMembershipPatch({ ...membership, sessionID: session.id }),
    );
>>>>>>> upstream/main
    assertCurrent();
    const bound: Session = { ...session, metadata: result.metadata, metadataRevision: result.revision };
    if (!getMultiRunMembership(bound)) throw new Error('Multi-run membership was not saved');
    return bound;
  } catch (error) {
    assertCurrent();
    try {
      await canonicalClient.deleteSession(session.sessionId);
    } catch {
      console.warn('[MultiRun] Could not remove an undispatched session after membership failure');
    }
    throw error;
  }
}
