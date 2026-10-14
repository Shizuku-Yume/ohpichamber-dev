import { canonicalClient } from '@/api/canonicalClient';
import type { Session } from '@openchamber/agent-contract';
import type { MultiRunModelSelection } from '@/types/multirun';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { checkIsGitRepository, snapshotGitWorktree } from '@/lib/gitApi';
import { getWorktreeSetupWaitEnabled } from '@/lib/openchamberConfig';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { resolveWorktreeSetupCommands } from '@/lib/sharedTrustConfirmation';
import { waitForWorktreeBootstrap } from '@/lib/worktrees/worktreeBootstrap';
import { createWorktreeWithDefaults } from '@/lib/worktrees/worktreeCreate';
import { dispatchRunPrompt, registerMultiRunSession, toGitSafeSlug, toModelSlug } from '@/stores/useMultiRunStore';
import { resolveSendSelection, useSessionUIStore } from '@/sync/session-ui-store';
import { createMultiRunSession } from './createSession';
import { resolveRunMemberLocation, runSnapshotRef } from './keep';
import { loadLaneFirstPrompt, loadLaneTurnModel } from './laneData';
import { getMultiRunMembership, multiRunMembershipPatch, type MultiRunMembership } from './identity';
import { multiRunVariantLabel, readMultiRunIdentity, type MultiRunSummary } from './runs';
import { generateUuid } from '@/lib/uuid';
import { useSelectionStore } from '@/sync/selection-store';

/**
 * Renames the run on every member. Each write is a merge patch of the title
 * alone; members whose write failed keep the old title and are returned.
 */
export async function renameRun(run: MultiRunSummary, title: string, sessionById: ReadonlyMap<string, Session>): Promise<string[]> {
  const nextTitle = title.trim().slice(0, 200);
  if (!nextTitle) return [];
  const runtimeKey = getRuntimeKey();
  const assertCurrent = () => { if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed'); };
  const failed: string[] = [];
  await Promise.all(run.memberIds.map(async (sessionId) => {
    try {
      assertCurrent();
      const session = sessionById.get(sessionId);
      if (!session) throw new Error('Member is missing');
      const metadata = await canonicalClient.getSessionMetadata(sessionId);
      assertCurrent();
      const current = { ...session, metadata: metadata.metadata, metadataRevision: metadata.revision };
      const membership = getMultiRunMembership(current);
      if (!membership || readMultiRunIdentity(current, current.projectId)?.key !== run.key) throw new Error('Membership changed');
      const result = await canonicalClient.patchSessionMetadata(sessionId, multiRunMembershipPatch({ ...membership, title: nextTitle }));
      assertCurrent();
      const directory = resolveWorkspaceDirectory(session.workspaceId);
      if (!directory) throw new Error('Member directory is unknown');
      registerMultiRunSession(current, directory, result);
    } catch {
      assertCurrent();
      failed.push(sessionId);
    }
  }));
  return failed;
}

/**
 * Turns a member into an ordinary session, as if it never took part in the
 * run: its membership marker is deleted (a merge patch with `null`) and its
 * lane title ("Model · Run") becomes the run's title. It keeps its directory
 * or worktree. A run left with one member stops being a run by itself.
 */
export async function detachFromRun(session: Session, runTitle: string): Promise<void> {
  const runtimeKey = getRuntimeKey();
  const result = await canonicalClient.patchSessionMetadata(session.sessionId, {
    changes: { title: runTitle.trim() || session.metadata?.title, openchamber: { multirun: null } },
  });
  if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
  const directory = resolveWorkspaceDirectory(session.workspaceId);
  if (!directory) throw new Error('Member directory is unknown');
  registerMultiRunSession(session, directory, result);
}

/** Archives every member of the run. Worktrees stay; the chats move to the archive. */
export async function archiveRun(run: MultiRunSummary): Promise<{ archivedIds: string[]; failedIds: string[] }> {
  return useSessionUIStore.getState().archiveSessions([...run.memberIds]);
}

export class NotFirstTurnError extends Error {
  constructor() {
    super('Only the first answer of a chat can be compared');
    this.name = 'NotFirstTurnError';
  }
}

/**
 * Turns a chat into a run: the chat becomes the first lane, and each chosen
 * model gets its own lane with the same first prompt and files, in its own
 * worktree when the project is a git repository. Only the chat's first turn
 * qualifies, because new lanes start without the conversation that followed.
 */
export async function askOtherModels(input: {
  session: Session;
  turnUserMessageId: string;
  models: ReadonlyArray<MultiRunModelSelection>;
  agentId?: string | null;
}): Promise<{ runKey: string; failedCount: number }> {
  const { session } = input;
  const runtimeKey = getRuntimeKey();
  const sourceAgentId = input.agentId === undefined ? useSelectionStore.getState().getSessionAgentSelection(session.sessionId) : input.agentId;
  const assertCurrent = () => { if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed'); };
  const prompt = await loadLaneFirstPrompt(session.sessionId);
  assertCurrent();
  if (!prompt || prompt.messageId !== input.turnUserMessageId) throw new NotFirstTurnError();
  const model = await loadLaneTurnModel(session.sessionId, prompt.turnId);
  assertCurrent();
  const providerID = model?.providerId;
  const modelID = model?.modelId;
  if (!providerID || !modelID) throw new Error('The chat has no model to compare against');
  const directory = resolveWorkspaceDirectory(session.workspaceId);
  if (!directory) throw new Error('The chat directory is unknown');
  const title = (session.metadata?.title || prompt.text.split('\n')[0] || 'Run').trim().slice(0, 200);
  const membership: MultiRunMembership = {
    version: 1,
    sessionID: session.sessionId,
    group: { kind: 'id', id: generateUuid() },
    groupSlug: toGitSafeSlug(title) || 'multi-run',
    providerID,
    modelID,
    role: 'run',
    title,
  };
  const result = await canonicalClient.patchSessionMetadata(session.sessionId, multiRunMembershipPatch(membership));
  assertCurrent();
  const bound: Session = { ...session, metadata: result.metadata, metadataRevision: result.revision };
  registerMultiRunSession(bound, directory, result);

  const identity = readMultiRunIdentity(bound, session.projectId);
  if (!identity) throw new Error('Multi-run membership was not saved');
  const run: MultiRunSummary = {
    key: identity.key,
    title,
    groupSlug: membership.groupSlug,
    lanes: [{ sessionId: session.sessionId, identity }],
    fusions: [],
    memberIds: [session.sessionId],
    providerIDs: [providerID],
    variants: [undefined],
    createdAt: session.createdAt,
    lastActivity: session.updatedAt,
  };
  const sessionById = new Map([[session.sessionId, bound]]);
  let failedCount = 0;
  for (const model of input.models) {
    try {
      assertCurrent();
      // Each new lane counts the ones before it, so duplicates get an index.
      const laneId = await addLaneToRun({ run, runGroup: undefined, model, sessionById, agentId: sourceAgentId, isolateFromProjectRoot: true });
      const created = { sessionId: laneId, identity: { ...identity, providerID: model.providerId, modelID: model.modelId } };
      run.lanes = [...run.lanes, created];
    } catch (error) {
      assertCurrent();
      console.warn('[MultiRun] Could not add a lane', error);
      failedCount += 1;
    }
  }
  return { runKey: identity.key, failedCount };
}

/**
 * Adds a lane for another model to an existing variant: same prompt and
 * files as that variant's first lane, same starting commit, its own worktree
 * when the run is isolated. Returns the new session id.
 */
export async function addLaneToRun(input: {
  run: MultiRunSummary;
  runGroup: string | undefined;
  model: MultiRunModelSelection;
  sessionById: ReadonlyMap<string, Session>;
  /** Source profile captured before reading history or preparing the worktree. */
  agentId?: string | null;
  /**
   * Give the new lane its own worktree even when the template lane works in
   * the project root (a chat turned into a run). Shared-directory runs leave
   * this off and keep sharing.
   */
  isolateFromProjectRoot?: boolean;
}): Promise<string> {
  const { run, model } = input;
  const runtimeKey = getRuntimeKey();
  const assertCurrent = () => {
    if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
  };
  const template = run.lanes.find((lane) => lane.identity.runGroup === input.runGroup) ?? run.lanes[0];
  const templateSession = template ? input.sessionById.get(template.sessionId) : undefined;
  if (!template || !templateSession) throw new Error('Run has no lane to copy');
  let directory = resolveWorkspaceDirectory(templateSession.workspaceId);
  if (!directory) throw new Error('Template directory is unknown');
  const selection = resolveSendSelection(templateSession.sessionId, directory, {
    providerId: model.providerId, modelId: model.modelId, variant: model.variant, reasoningEffort: model.reasoningEffort,
    agentId: (input.agentId === undefined ? useSelectionStore.getState().getSessionAgentSelection(templateSession.sessionId) : input.agentId) || undefined,
  });

  const prompt = await loadLaneFirstPrompt(templateSession.sessionId);
  assertCurrent();
  if (!prompt?.text) throw new Error('The run prompt could not be read');
  const location = await resolveRunMemberLocation(templateSession, run);
  assertCurrent();

  const sameModel = run.lanes.filter((lane) => lane.identity.runGroup === template.identity.runGroup
    && lane.identity.providerID === model.providerId && lane.identity.modelID === model.modelId);
  const index = sameModel.length > 0 ? sameModel.length + 1 : undefined;
  const variantLabel = run.variants.length > 1 ? multiRunVariantLabel(template.identity.runGroup) : null;

  let worktree: Awaited<ReturnType<typeof createWorktreeWithDefaults>> | null = null;
  const startDirectory = location?.worktree?.path
    ?? (input.isolateFromProjectRoot && location && await checkIsGitRepository(location.project.path) ? location.project.path : null);
  assertCurrent();
  if (location && startDirectory) {
    // The template's HEAD is where every lane of the run started.
    const { head } = await snapshotGitWorktree(startDirectory, { ref: runSnapshotRef(run, templateSession.sessionId) });
    assertCurrent();
    const modelPart = `${toModelSlug(model.providerId, model.modelId)}${index ? `/${index}` : ''}`;
    const preferredName = [template.identity.runGroup, toGitSafeSlug(run.groupSlug) || 'multi-run', modelPart].filter(Boolean).join('/');
    const setupCommands = await resolveWorktreeSetupCommands(location.project);
    assertCurrent();
    worktree = await createWorktreeWithDefaults(location.project, {
      preferredName,
      mode: 'new',
      branchName: preferredName,
      worktreeName: preferredName,
      startRef: head,
      setupCommands,
      returnAfterDirectoryCreated: true,
    });
    assertCurrent();
    const waitForSetup = await getWorktreeSetupWaitEnabled(location.project);
    assertCurrent();
    if (waitForSetup) {
      await waitForWorktreeBootstrap(worktree.path);
      assertCurrent();
    }
    directory = worktree.path;
  }

  const session = await createMultiRunSession({
    title: [`${model.displayName || model.modelId}${index ? ` #${index}` : ''}`, ...(variantLabel ? [variantLabel] : []), run.title].join(' · '),
    directory,
    identity: {
      group: template.identity.group,
      groupSlug: template.identity.groupSlug,
      runGroup: template.identity.runGroup,
      providerID: model.providerId,
      modelID: model.modelId,
      index,
      role: 'run',
      title: run.title,
    },
    selection,
  }, assertCurrent);
  registerMultiRunSession(session, directory);
  if (worktree) useSessionUIStore.getState().setWorktreeMetadata(session.sessionId, { ...worktree, kind: 'standard' });

  await dispatchRunPrompt({
    runtimeKey,
    assertCurrent,
    sessionId: session.sessionId,
    workspaceId: session.workspaceId,
    attachmentWorkspaceId: templateSession.workspaceId,
    directory,
    prompt: prompt.text,
    providerId: model.providerId,
    modelId: model.modelId,
    variant: selection.variant ?? undefined,
    reasoningEffort: selection.reasoningEffort ?? undefined,
    agentId: selection.agentId ?? undefined,
    files: prompt.files,
  });
  return session.sessionId;
}
