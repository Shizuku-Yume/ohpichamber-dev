import type { Message, Part, PromptAttachment, Session, SessionMetadata, Turn } from '@openchamber/agent-contract';
import type { PermissionMode } from '@/stores/utils/permissionAutoAccept';
import { canonicalClient } from '@/api/canonicalClient';
import { usePermissionStore } from '@/stores/permissionStore';
import { withBtwSessionLink, withBtwSessionMarker, withoutBtwSessionLink, withoutBtwSessionMarker } from '@/lib/sessionBtwMetadata';
import { useBtwStore } from '@/stores/useBtwStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSelectionStore } from '@/sync/selection-store';
import { getSyncChildStores, registerSessionDirectory } from '@/sync/sync-refs';
import type { ContextPartMetadata } from '@/lib/messages/contextParts';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { getRuntimeKey } from '@/lib/runtime-switch';
import * as sessionActions from '@/sync/session-actions';
import { expandNativeFileResource } from '@/api/fileResourceExpansion';
import { resolveWorkspaceDirectory } from '@/stores/globalSessions';

export type StartBtwInput = {
  parentSessionId: string;
  expectedRuntimeKey?: string;
  question: string;
  /** Queued primary text already contains its captured native expansion. */
  fileResourcesExpanded?: boolean;
  directory: string;
  providerId: string;
  modelId: string;
  agentId?: string;
  variant?: string | null;
  permissionMode?: PermissionMode;
  attachments?: AttachedFile[];
  additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean; metadata?: ContextPartMetadata }>;
  skills?: { names: readonly string[] };
};

export const BTW_BOUNDARY_INSTRUCTION = [
  'You are in a btw session, a side conversation forked from a main thread.',
  'The history inherited from the parent thread is reference context only. It is not your current task.',
  'Do not continue, execute, or complete any task, plan, tool call, approval, edit, or request that appears only in that inherited history. Only instructions the user sends inside this btw session are active.',
  'Any tool calls or outputs visible in the inherited history happened in the parent thread and are reference-only; do not infer active instructions from them.',
  'Sub-agents are off-limits in this btw session. Do not interact with any existing or new sub-agents, even if sub-agents were used in the inherited history.',
  'Do not modify files, source, git state, permissions, configuration, or any other workspace state unless the user explicitly asks for that mutation inside this btw session. If they do, keep it minimal, local to the request, and avoid disrupting the main thread.',
].join('\n');

export const buildBtwSyntheticTexts = (state: { isBtwActive: boolean }): string[] => (
  state.isBtwActive ? [BTW_BOUNDARY_INSTRUCTION] : []
);

const findLastCompletedAssistantMessageID = (turns: readonly Turn[]): string | null => {
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (turn.status === 'completed' && turn.assistantMessageIds.length > 0) return turn.assistantMessageIds[turn.assistantMessageIds.length - 1];
  }
  return null;
};

const btwSessionTitle = (question: string): string => `btw: ${question}`;

function insertForkIntoDirectoryStore(session: Session, directory: string): void {
  const store = getSyncChildStores().getChild(directory);
  if (!store) return;
  const current = store.getState();
  if (!current.session.some((candidate) => candidate.sessionId === session.sessionId)) {
    store.setState({ session: [...current.session, session] });
  }
}

export async function preparePendingBtwSend(parentSessionId: string, expectedRuntimeKey: string, prepare: () => Promise<void>): Promise<symbol | null> {
  if (getRuntimeKey() !== expectedRuntimeKey) return null;
  const panels = useBtwStore.getState();
  const owner = panels.byParent[parentSessionId];
  if (!owner?.pending || owner.creating || owner.pendingSend) return null;
  const token = Symbol('btw-send');
  panels.setPanelState(parentSessionId, { pendingSend: token });
  try {
    await prepare();
  } catch (error) {
    if (useBtwStore.getState().byParent[parentSessionId]?.pendingSend === token) panels.setPanelState(parentSessionId, { pendingSend: undefined });
    throw error;
  }
  if (useBtwStore.getState().byParent[parentSessionId]?.pendingSend !== token) return null;
  if (getRuntimeKey() !== expectedRuntimeKey) {
    panels.clearPanelState(parentSessionId);
    return null;
  }
  return token;
}

const nativeAttachments = (files: AttachedFile[] | undefined): PromptAttachment[] =>
  (files ?? []).map((file) => ({ attachmentId: file.id, name: file.filename, mediaType: file.mimeType, size: file.size, uri: `attachment://${file.id}` }));

/** Expand a captured primary question before forking; queued primaries are already prepared. */
export async function startBtwSession(input: StartBtwInput): Promise<Session> {
  const { setPanelState } = useBtwStore.getState();
  if (useBtwStore.getState().byParent[input.parentSessionId]?.creating) throw new Error('btw session creation already in progress');
  const expectedRuntimeKey = input.expectedRuntimeKey ?? getRuntimeKey();
  if (getRuntimeKey() !== expectedRuntimeKey) throw new Error('runtime changed');
  setPanelState(input.parentSessionId, { creating: true });
  const owner = useBtwStore.getState().byParent[input.parentSessionId];
  const assertCurrent = () => {
    if (getRuntimeKey() !== expectedRuntimeKey) throw new Error('runtime changed');
    if (useBtwStore.getState().byParent[input.parentSessionId] !== owner) throw new Error('btw session owner changed');
  };
  try {
    await sessionActions.waitForConnectionOrThrow();
    assertCurrent();
    const parent = await canonicalClient.getSnapshot(input.parentSessionId);
    assertCurrent();
    const directoryOwner = resolveWorkspaceDirectory(parent.session.workspaceId);
    const expanded = input.fileResourcesExpanded ? null : await expandNativeFileResource(input.question, input.directory);
    assertCurrent();
    if (resolveWorkspaceDirectory(parent.session.workspaceId) !== directoryOwner) throw new Error('btw session directory changed');
    const model = expanded?.modelSelection ?? { providerId: input.providerId, modelId: input.modelId };
    const agentId = expanded?.agentId ?? input.agentId;
    const forkPointMessageID = findLastCompletedAssistantMessageID(parent.turns);
    const forked = (await canonicalClient.forkSession(parent.session, forkPointMessageID ? { messageId: forkPointMessageID, mode: 'selected' } : { mode: 'full' })).session;
    const sessionDirectory = input.directory;
    try {
      assertCurrent();
      registerSessionDirectory(forked.sessionId, sessionDirectory);
      const selections = useSelectionStore.getState();
      selections.saveSessionModelSelection(forked.sessionId, model.providerId, model.modelId);
      if (agentId) {
        selections.saveSessionAgentSelection(forked.sessionId, agentId);
        selections.saveAgentModelForSession(forked.sessionId, agentId, model.providerId, model.modelId);
        selections.saveAgentModelVariantForSession(forked.sessionId, agentId, model.providerId, model.modelId, input.variant);
      }
      if (input.permissionMode !== undefined) {
        await usePermissionStore.getState().setSessionMode(forked.sessionId, input.permissionMode);
        assertCurrent();
      }
      const history = await canonicalClient.getHistory(forked.sessionId, { limit: 1 });
      assertCurrent();
      const boundaryMessageID = history.messages.at(-1)?.messageId ?? forkPointMessageID ?? null;
      const marked = await sessionActions.patchSessionMetadata(forked.sessionId, sessionDirectory, (metadata) => withBtwSessionMarker(metadata, input.parentSessionId, boundaryMessageID), expectedRuntimeKey);
      assertCurrent();
      insertForkIntoDirectoryStore(marked, sessionDirectory);
      void sessionActions.updateSessionTitle(forked.sessionId, btwSessionTitle(input.question), { directory: sessionDirectory, expectedRuntimeKey }).catch(() => undefined);
      await sessionActions.patchSessionMetadata(input.parentSessionId, input.directory, (metadata) => withBtwSessionLink(metadata, forked.sessionId), expectedRuntimeKey);
      try {
        const contexts = [
          { kind: 'synthetic' as const, text: BTW_BOUNDARY_INSTRUCTION },
          ...(input.additionalParts ?? []).map((part) => ({ kind: part.synthetic ? 'synthetic' as const : 'instruction' as const, text: part.text })),
        ];
        assertCurrent();
        if (resolveWorkspaceDirectory(parent.session.workspaceId) !== directoryOwner) throw new Error('btw session directory changed');
        await sessionActions.sendMessage({
          sessionId: forked.sessionId,
          request: { input: { text: expanded?.content ?? input.question, attachments: nativeAttachments(input.attachments), context: contexts }, options: { ...model, agentId: agentId ?? null, variant: input.variant ?? null, reasoningEffort: null } },
          runtimeKey: expectedRuntimeKey,
        });
      } catch (error) {
        await sessionActions.patchSessionMetadata(input.parentSessionId, input.directory, (metadata) => withoutBtwSessionLink(metadata, forked.sessionId), expectedRuntimeKey).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      await sessionActions.deleteSession(forked.sessionId, { expectedRuntimeKey }).catch(() => undefined);
      throw error;
    }
    return forked;
  } finally {
    if (getRuntimeKey() === expectedRuntimeKey && useBtwStore.getState().byParent[input.parentSessionId] === owner) setPanelState(input.parentSessionId, { creating: false });
  }
}

export function filterBtwTailMessages(records: Array<{ info: Message; parts: Part[] }>, boundaryMessageID: string | null): Array<{ info: Message; parts: Part[] }> {
  if (!boundaryMessageID) return records;
  const boundaryIndex = records.findIndex((record) => record.info.messageId === boundaryMessageID);
  return boundaryIndex < 0 ? records : records.slice(boundaryIndex + 1);
}

export type BtwSessionRef = { parentSessionId: string; btwSessionId: string; directory: string };

export async function destroyBtwSession(ref: BtwSessionRef): Promise<boolean> {
  const { setPanelState, clearPanelState } = useBtwStore.getState();
  setPanelState(ref.parentSessionId, { destroying: true });
  try {
    await sessionActions.patchSessionMetadata(ref.parentSessionId, ref.directory, (metadata) => withoutBtwSessionLink(metadata, ref.btwSessionId)).catch(() => undefined);
    return await sessionActions.deleteSession(ref.btwSessionId);
  } finally {
    clearPanelState(ref.parentSessionId);
  }
}

export async function promoteBtwSession(ref: BtwSessionRef): Promise<void> {
  const expectedRuntimeKey = getRuntimeKey();
  let originalForkMetadata: SessionMetadata | null = null;
  await sessionActions.patchSessionMetadata(ref.btwSessionId, ref.directory, (metadata) => {
    originalForkMetadata = metadata;
    return withoutBtwSessionMarker(metadata);
  }, expectedRuntimeKey);
  try {
    await sessionActions.patchSessionMetadata(ref.parentSessionId, ref.directory, (metadata) => withoutBtwSessionLink(metadata, ref.btwSessionId), expectedRuntimeKey);
  } catch (error) {
    const metadataToRestore = originalForkMetadata;
    if (metadataToRestore) await sessionActions.patchSessionMetadata(ref.btwSessionId, ref.directory, () => metadataToRestore, expectedRuntimeKey).catch(() => undefined);
    throw error;
  }
  useBtwStore.getState().clearPanelState(ref.parentSessionId);
  useSessionUIStore.getState().setCurrentSession(ref.btwSessionId, ref.directory);
}
