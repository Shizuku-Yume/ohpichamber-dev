import { modelRefInstanceKey } from '@openchamber/agent-contract';
import { create } from 'zustand';
import type { PromptAttachment, Session, SessionMetadataState } from '@openchamber/agent-contract';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { sendMessage } from '@/sync/session-actions';
import { devtools } from 'zustand/middleware';
import type { CreateMultiRunParams, CreateMultiRunResult } from '@/types/multirun';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';
import { getWorktreeSetupWaitEnabled, saveWorktreeSetupCommands } from '@/lib/openchamberConfig';
import type { ProjectRef } from '@/lib/worktrees/worktreeManager';
import { createWorktreeWithDefaults, resolveRootTrackingRemote } from '@/lib/worktrees/worktreeCreate';
import { waitForWorktreeBootstrap } from '@/lib/worktrees/worktreeBootstrap';
import { resolveCreatedWorktreeStartDirectory } from '@/lib/worktrees/worktreeStartDirectory';
import { getRootBranch } from '@/lib/worktrees/worktreeStatus';
import { normalizePath as normalizePathImpl } from '@/lib/pathNormalization';
import { checkIsGitRepository } from '@/lib/gitApi';
import { useDirectoryStore } from './useDirectoryStore';
import { useProjectsStore } from './useProjectsStore';
import { expandNativeFileResource } from '@/api/fileResourceExpansion';
import { canonicalClient } from '@/api/canonicalClient';
import { useGlobalSessionsStore } from './useGlobalSessionsStore';
import { createMultiRunSession } from '@/lib/multirun/createSession';
import { multiRunGroupKey, type MultiRunMembership } from '@/lib/multirun/identity';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { RUN_LAUNCHER_ID } from '@/lib/multirun/launcher';
import { multiRunVariantLabel } from '@/lib/multirun/runs';
import { getSyncChildStores, registerSessionDirectory } from '@/sync/sync-refs';
import { generateUuid } from '@/lib/uuid';
import { installHostSession, installSessionMetadata, mergeHostSession } from '@/sync/event-reducer';
import { observeLaneSession } from '@/lib/multirun/observation';
import { useSelectionStore } from '@/sync/selection-store';
import { admitLaneAttachments } from '@/lib/multirun/attachments';

export const toGitSafeSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};

export const toModelSlug = (providerID: string, modelID: string): string => {
  const provider = toGitSafeSlug(providerID);
  const model = toGitSafeSlug(modelID);
  return `${provider}-${model}`.substring(0, 60);
};

const generateWorktreeNameSeed = (groupSlug: string, modelSlug: string): string => {
  return `${groupSlug}/${modelSlug}`;
};

const normalizePath = (value: string | null | undefined): string => normalizePathImpl(value) ?? '';

export const registerMultiRunSession = (session: Session, directory: string, metadata?: SessionMetadataState): Session => {
  const normalizedDirectory = normalizePath(directory);
  const ownedDirectory = resolveWorkspaceDirectory(session.workspaceId);
  if (ownedDirectory !== normalizedDirectory) throw new Error('Multi-run session directory changed');
  registerSessionDirectory(session.sessionId, normalizedDirectory);
  useSessionUIStore.getState().markSessionAsOpenChamberCreated(session.sessionId);
  const previous = useGlobalSessionsStore.getState().entityById.get(session.sessionId);
  const published = mergeHostSession(metadata
    ? { ...(previous ?? session), metadata: metadata.metadata, metadataRevision: metadata.revision }
    : session, previous);
  useGlobalSessionsStore.getState().upsertSession(published);

  try {
    const store = getSyncChildStores().ensureChild(normalizedDirectory, { bootstrap: false });
    store.setState((state) => {
      const next = metadata && state.session.some((candidate) => candidate.sessionId === session.sessionId)
        ? installSessionMetadata(state, metadata)
        : installHostSession(state, published);
      if (next === state) return state;
      const deleted = { ...next.sessionDeletedRevision };
      delete deleted[session.sessionId];
      return { ...next, sessionListSource: 'live', sessionDeletedRevision: deleted, limit: Math.max(next.limit, next.session.length) };
    });
  } catch {
    // SyncProvider can be unavailable in tests or detached surfaces; the global
    // session upsert above is enough for the sidebar to show the session.
  }

  return published;
};

export async function dispatchRunPrompt(input: {
  runtimeKey: string;
  assertCurrent: () => void;
  sessionId: string;
  workspaceId: string;
  attachmentWorkspaceId?: string;
  directory: string;
  prompt: string;
  providerId: string;
  modelId: string;
  variant?: string;
  reasoningEffort?: string;
  files?: PromptAttachment[];
  /** Every lane starts a goal of its own, with its expanded prompt as the objective. */
  goal?: { tokenBudget: number | null };
}): Promise<void> {
  const directoryOwner = resolveWorkspaceDirectory(input.workspaceId);
  const session = useGlobalSessionsStore.getState().entityById.get(input.sessionId);
  const assertCurrent = () => {
    input.assertCurrent();
    const current = useGlobalSessionsStore.getState().entityById.get(input.sessionId);
    if (session && (!current || current.workspaceId !== session.workspaceId || current.epoch !== session.epoch)) throw new Error('Multi-run session changed');
    if (getRuntimeKey() !== input.runtimeKey || resolveWorkspaceDirectory(input.workspaceId) !== directoryOwner) throw new Error('Multi-run prompt scope changed');
  };
  assertCurrent();
  await observeLaneSession({ sessionId: input.sessionId, directory: input.directory }, assertCurrent);
  if (input.files?.length && !input.attachmentWorkspaceId) throw new Error('Attachment source workspace is required');
  const attachments = input.files?.length ? await admitLaneAttachments({
    files: input.files, sourceWorkspaceId: input.attachmentWorkspaceId!, destinationWorkspaceId: input.workspaceId, assertCurrent,
  }) : [];
  assertCurrent();
  const expanded = await expandNativeFileResource(input.prompt, input.directory);
  assertCurrent();
  if (input.goal) {
<<<<<<< HEAD
    // Before the prompt, as on an ordinary send: a lane that cannot get its
    // goal stays unstarted instead of running as a plain session.
    await canonicalClient.goal(input.sessionId, {
      op: 'create',
      objective: (expanded?.content ?? input.prompt).trim(),
      tokenBudget: input.goal.tokenBudget,
||||||| bc50ba56aa
    // Before the prompt, as on an ordinary send: a lane that cannot get its
    // goal stays unstarted instead of running as a plain session.
    await setSessionGoal(
      input.sessionId,
      input.directory,
      { objective: resolveGoalObjective(text, input.directory), tokenBudget: input.goal.tokenBudget },
      null,
      input.runtimeKey,
    );
    input.assertCurrent();
  }
  try {
    await routeMessage({
      runtimeKey: input.runtimeKey,
      sessionId: input.sessionId,
      directory: input.directory,
      content: text,
      providerID: input.providerID,
      modelID: input.modelID,
      variant: input.variant,
      agent: input.agent,
      files: input.files,
      additionalParts: input.goal ? [{ text: sessionGoalIntro(input.goal.tokenBudget), synthetic: true }] : undefined,
      ready: knowledgeSync,
=======
    await setSessionGoal(
      input.sessionId,
      input.directory,
      { objective: resolveGoalObjective(text, input.directory), tokenBudget: input.goal.tokenBudget },
      null,
      input.runtimeKey,
    );
    input.assertCurrent();
  }
  try {
    await routeMessage({
      runtimeKey: input.runtimeKey,
      sessionId: input.sessionId,
      directory: input.directory,
      content: text,
      providerID: input.providerID,
      modelID: input.modelID,
      variant: input.variant,
      agent: input.agent,
      files: input.files,
      additionalParts: input.goal ? [{ text: sessionGoalIntro(input.goal.tokenBudget), synthetic: true }] : undefined,
      ready: knowledgeSync,
>>>>>>> upstream/main
    });
<<<<<<< HEAD
    assertCurrent();
||||||| bc50ba56aa
  } catch (error) {
    // With no turn the server never settles the goal, and an active goal
    // keeps the lane working and holds auto-fusion for good.
    if (input.goal) await clearSessionGoal(input.sessionId, input.directory).catch(() => undefined);
    throw error;
=======
  } catch (error) {
    if (input.goal) await clearSessionGoal(input.sessionId, input.directory).catch(() => undefined);
    throw error;
>>>>>>> upstream/main
  }
  const model = expanded?.modelSelection ?? { providerId: input.providerId, modelId: input.modelId };
  useSelectionStore.getState().saveSessionModelSelection(input.sessionId, model.providerId, model.modelId);
  useSelectionStore.getState().saveSessionAgentSelection(input.sessionId, '');
  await sendMessage({
    runtimeKey: input.runtimeKey,
    sessionId: input.sessionId,
    request: {
      options: { ...model, variant: input.variant ?? null, agentId: null, reasoningEffort: input.reasoningEffort ?? null },
      input: { text: expanded?.content ?? input.prompt, attachments, context: [] },
    },
  });
  assertCurrent();
}

const resolveActiveProject = (): ProjectRef | null => {
  const projectsState = useProjectsStore.getState();
  const activeProjectId = projectsState.activeProjectId;
  if (!activeProjectId) return null;

  const project = projectsState.projects.find((entry) => entry.id === activeProjectId);
  if (project?.path) return { id: project.id, path: project.path };

  const currentDirectory = useDirectoryStore.getState().currentDirectory ?? null;
  if (currentDirectory && currentDirectory.trim().length > 0) {
    const normalized = normalizePath(currentDirectory) || currentDirectory;
    return { id: `path:${normalized}`, path: normalized };
  }

  return null;
};

interface MultiRunState {
  isLoading: boolean;
  error: string | null;
}

interface MultiRunActions {
  createMultiRun: (params: CreateMultiRunParams) => Promise<CreateMultiRunResult | null>;
  clearError: () => void;
  resetForRuntimeSwitch: () => void;
}

type MultiRunStore = MultiRunState & MultiRunActions;

export const useMultiRunStore = create<MultiRunStore>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

      createMultiRun: async (params: CreateMultiRunParams) => {
        const runtimeKey = getRuntimeKey();
        const assertCurrent = () => {
          if (getRuntimeKey() !== runtimeKey) throw new Error('Runtime changed');
        };
        const groupName = params.name.trim();
        const runTitle = (params.title ?? params.name).trim().slice(0, 200);
        const { groups, files, setupCommands } = params;

        if (!groupName) {
          set({ error: 'Group name is required' });
          return null;
        }

        if (!groups || groups.length === 0) {
          set({ error: 'At least one run group is required' });
          return null;
        }

        for (let gi = 0; gi < groups.length; gi++) {
          if (!groups[gi].prompt.trim()) {
            set({ error: `Group ${gi + 1}: prompt is required` });
            return null;
          }
          if (groups[gi].models.length < 1) {
            set({ error: `Group ${gi + 1}: select at least 1 model` });
            return null;
          }
        }

        set({ isLoading: true, error: null });

        try {
          const project = resolveActiveProject();
          if (!project) {
            set({ error: 'Select a project', isLoading: false });
            return null;
          }

          const directory = project.path;

          const isGit = await checkIsGitRepository(directory);
          assertCurrent();
          const shouldIsolateRuns = isGit && params.isolateRuns !== false;

          const groupSlug = toGitSafeSlug(groupName) || 'multi-run';
          const membershipGroup: MultiRunMembership['group'] = { kind: 'id', id: generateUuid() };
          const rootBranch = shouldIsolateRuns ? await getRootBranch(directory) : undefined;
          assertCurrent();
          const rootTrackingRemote = shouldIsolateRuns ? await resolveRootTrackingRemote(directory) : null;
          assertCurrent();

          const createdRuns: Array<{
            sessionId: string;
<<<<<<< HEAD
            workspaceId: string;
||||||| bc50ba56aa
            /** Where the run's session starts: the worktree root, or the project's folder inside it. */
=======
>>>>>>> upstream/main
            directory: string;
            providerID: string;
            modelID: string;
            variant?: string;
            reasoningEffort?: string;
            prompt: string;
            files?: CreateMultiRunParams['files'];
          }> = [];
          const autoFusion = params.autoFusion ? { providerID: params.autoFusion.providerId, modelID: params.autoFusion.modelId, variant: params.autoFusion.variant, launcherId: RUN_LAUNCHER_ID } : undefined;

          const commandsToRun = setupCommands?.filter((cmd) => cmd.trim().length > 0) ?? [];

          for (let gi = 0; gi < groups.length; gi++) {
            assertCurrent();
            const group = groups[gi];
            const prompt = group.prompt;

            const modelCounts = new Map<string, number>();
            for (const model of group.models) {
              assertCurrent();
              const key = modelRefInstanceKey(model.providerId, model.modelId);
              modelCounts.set(key, (modelCounts.get(key) || 0) + 1);
            }

            const modelIndexes = new Map<string, number>();

            for (const model of group.models) {
              const key = modelRefInstanceKey(model.providerId, model.modelId);
              const count = modelCounts.get(key) || 1;
              const index = (modelIndexes.get(key) || 0) + 1;
              modelIndexes.set(key, index);

              const modelSlug = toModelSlug(model.providerId, model.modelId);
              const runGroup = groups.length > 1 ? `g${gi + 1}` : undefined;
              const modelPart = count > 1
                ? generateWorktreeNameSeed(groupSlug, `${modelSlug}/${index}`)
                : generateWorktreeNameSeed(groupSlug, modelSlug);
              const preferredName = runGroup
                ? `${runGroup}/${modelPart}`
                : modelPart;

              const sessionTitle = [
                `${model.displayName || model.modelId}${count > 1 ? ` #${index}` : ''}`,
                ...(runGroup ? [multiRunVariantLabel(runGroup)] : []),
                runTitle,
              ].join(' · ');

              try {
                const createRun = (runDirectory: string) => createMultiRunSession({
                  title: sessionTitle, directory: runDirectory,
                  identity: { group: membershipGroup, groupSlug, runGroup, providerID: model.providerId,
                    modelID: model.modelId, index: count > 1 ? index : undefined, role: 'run', title: runTitle, autoFusion },
                  selection: { providerId: model.providerId, modelId: model.modelId, variant: model.variant ?? null, agentId: null, reasoningEffort: model.reasoningEffort ?? null },
                }, assertCurrent);
                if (!shouldIsolateRuns) {
                  const session = await createRun(directory);
                  registerMultiRunSession(session, directory);

                  createdRuns.push({
                    sessionId: session.sessionId,
                    workspaceId: session.workspaceId,
                    directory,
                    providerID: model.providerId,
                    modelID: model.modelId,
                    variant: model.variant,
                    reasoningEffort: model.reasoningEffort,
                    prompt,
                    files: group.files,
                  });
                  continue;
                }

                assertCurrent();
                const worktreeMetadata = await createWorktreeWithDefaults(project, {
                  preferredName,
                  mode: 'new',
                  branchName: preferredName,
                  worktreeName: preferredName,
                  startRef: params.worktreeBaseBranch || 'HEAD',
                  setupCommands: commandsToRun,
                  returnAfterDirectoryCreated: true,
                }, {
                  resolvedRootTrackingRemote: rootTrackingRemote,
                });
                assertCurrent();

                const enrichedMetadata = {
                  ...worktreeMetadata,
                  createdFromBranch: rootBranch,
                  kind: 'standard' as const,
                };

                const waitForSetup = await getWorktreeSetupWaitEnabled(project);
                assertCurrent();
                if (waitForSetup) {
                  await waitForWorktreeBootstrap(worktreeMetadata.path);
                  assertCurrent();
                }

                const startDirectory = await resolveCreatedWorktreeStartDirectory(project, worktreeMetadata);
                assertCurrent();
                const session = await createRun(startDirectory);
                registerMultiRunSession(session, startDirectory);

                useSessionUIStore.getState().setWorktreeMetadata(session.sessionId, enrichedMetadata, startDirectory);

                createdRuns.push({
                  sessionId: session.sessionId,
                  workspaceId: session.workspaceId,
                  directory: startDirectory,
                  providerID: model.providerId,
                  modelID: model.modelId,
                  variant: model.variant,
                  reasoningEffort: model.reasoningEffort,
                  prompt,
                  files: group.files,
                });
              } catch (err) {
                assertCurrent();
                console.warn('[MultiRun] Failed to create session:', err);
              }
            }
          }

          const commandsToSave = setupCommands?.filter((cmd) => cmd.trim().length > 0) ?? [];
          assertCurrent();
          if (commandsToSave.length > 0) {
            saveWorktreeSetupCommands(project, commandsToSave).catch(() => {
              console.warn('[MultiRun] Failed to save worktree setup commands');
            });
          }

          const sessionIds = createdRuns.map((r) => r.sessionId);
          const firstSessionId = createdRuns[0]?.sessionId ?? null;

          if (sessionIds.length === 0) {
            set({ error: 'Failed to create any sessions', isLoading: false });
            return null;
          }

          const filesForMessage = files;

          void Promise.allSettled(createdRuns.map(async (run) => {
            try {
              await dispatchRunPrompt({
                runtimeKey,
                assertCurrent,
                sessionId: run.sessionId,
                workspaceId: run.workspaceId,
                attachmentWorkspaceId: params.attachmentWorkspaceId,
                directory: run.directory,
                prompt: run.prompt,
                providerId: run.providerID,
                modelId: run.modelID,
                variant: run.variant,
                reasoningEffort: run.reasoningEffort,
                files: [...(filesForMessage ?? []), ...(run.files ?? [])],
                goal: params.goal,
              });
            } catch (err) {
              console.warn('[MultiRun] Failed to start run:', err);
            }
          }));

          set({ isLoading: false });
          const failedCount = groups.reduce((total, group) => total + group.models.length, 0) - sessionIds.length;
          return { groupSlug, groupKey: multiRunGroupKey(membershipGroup, groupSlug), sessionIds, firstSessionId, failedCount };
        } catch (error) {
          if (getRuntimeKey() !== runtimeKey) return null;
          set({
            error: error instanceof Error ? error.message : 'Failed to create Multi-Run',
            isLoading: false,
          });
          return null;
        }
      },

      clearError: () => {
        set({ error: null });
      },
      resetForRuntimeSwitch: () => set({ isLoading: false, error: null }),
    }),
    { name: 'multirun-store' },
  ),
);
