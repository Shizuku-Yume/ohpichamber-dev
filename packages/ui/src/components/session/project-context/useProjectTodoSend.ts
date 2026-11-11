import React from 'react';

import { toast } from '@/components/ui';
import { generateBranchName } from '@/lib/git/branchNameGenerator';
import { useI18n } from '@/lib/i18n';
import { loadMagicPrompts } from '@/lib/magicPrompts';
import { getRuntimeKey, getRuntimeSwitchRevision } from '@/lib/runtime-switch';
import type { ProjectRef } from '@/lib/projectContextApi';
import { createWorktreeSessionForNewBranch } from '@/lib/worktreeSessionCreator';
import { useUIStore } from '@/stores/useUIStore';
import { useInputStore } from '@/sync/input-store';
import { useSelectionStore } from '@/sync/selection-store';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveExecutionForDirectory, type TodoSendExecution } from '../todoSendExecution';

type PendingSendTarget = {
  kind: 'session' | 'worktree';
  todoId: string;
  todoText: string;
};

/**
 * Sending a todo to an agent.
 *
 * Creating a session, picking its model/agent, and dispatching the prompt is
 * the heaviest thing this surface does and has nothing to do with how todos are
 * stored, so it lives apart from the list that triggers it.
 */
export const useProjectTodoSend = (options: {
  projectRef: ProjectRef | null;
  canCreateWorktree: boolean;
  onActionComplete?: () => void;
}) => {
  const { projectRef, canCreateWorktree, onActionComplete } = options;
  const { t } = useI18n();

  const [pendingSendTarget, setPendingSendTarget] = React.useState<PendingSendTarget | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [sendingTodoId, setSendingTodoId] = React.useState<string | null>(null);

  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const createSession = useSessionUIStore((state) => state.createSession);
  const sendMessage = useSessionUIStore((state) => state.sendMessage);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);
  const setPendingInputText = useInputStore((state) => state.setPendingInputText);
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);

  const routeToChat = React.useCallback(() => {
    setSessionSwitcherOpen(false);
  }, [setSessionSwitcherOpen]);

  const sendToCurrentSession = React.useCallback(
    (todoText: string) => {
      if (!currentSessionId) {
        toast.error(t('rightSidebar.contextNotesTodo.toast.noActiveSession'));
        return;
      }
      routeToChat();
      const fenced = `\`\`\`md\n${todoText}\n\`\`\``;
      setPendingInputText(fenced, 'append');
      toast.success(t('rightSidebar.contextNotesTodo.toast.sentToCurrentSession'));
      onActionComplete?.();
    },
    [currentSessionId, onActionComplete, routeToChat, setPendingInputText, t]
  );

  const sendToNewSession = React.useCallback(
    (todoId: string, todoText: string) => {
      if (!projectRef || sendingTodoId) {
        return;
      }
      setPendingSendTarget({ kind: 'session', todoId, todoText });
    },
    [projectRef, sendingTodoId]
  );

  const sendToNewWorktreeSession = React.useCallback(
    (todoId: string, todoText: string) => {
      if (!projectRef || sendingTodoId) {
        return;
      }
      if (!canCreateWorktree) {
        toast.error(t('rightSidebar.contextNotesTodo.toast.worktreeRequiresGitRepo'));
        return;
      }
      setPendingSendTarget({ kind: 'worktree', todoId, todoText });
    },
    [canCreateWorktree, projectRef, sendingTodoId, t]
  );

  const confirmSend = React.useCallback(
    async (dialogExecution: TodoSendExecution) => {
      if (!projectRef || !pendingSendTarget) {
        return;
      }
      const runtimeKey = getRuntimeKey();
      const revision = getRuntimeSwitchRevision();
      const assertOwner = () => {
        if (getRuntimeKey() !== runtimeKey || getRuntimeSwitchRevision() !== revision) throw new Error('Runtime changed');
      };


      setIsSubmitting(true);
      setSendingTodoId(pendingSendTarget.todoId);

      try {
        routeToChat();

        let sessionId: string | null = null;
        let directoryHint: string | null = projectRef.path;
        let execution = dialogExecution;

        if (pendingSendTarget.kind === 'worktree') {
          if (!canCreateWorktree) {
            toast.error(t('rightSidebar.contextNotesTodo.toast.worktreeRequiresGitRepo'));
            return;
          }
          const created = await createWorktreeSessionForNewBranch(projectRef.path, generateBranchName());
          assertOwner();
          if (!created?.id) {
            return;
          }
          sessionId = created.id;
          directoryHint = created.directory;
          execution = await resolveExecutionForDirectory(created.directory, dialogExecution);
        } else {
          const session = await createSession(undefined, projectRef.path, undefined, {
            model: { providerId: execution.providerID, modelId: execution.modelID },
            variant: execution.variant || undefined,
          });
          assertOwner();
          if (!session?.sessionId) {
            toast.error(t('rightSidebar.contextNotesTodo.toast.createSessionFailed'));
            return;
          }
          sessionId = session.sessionId;
          directoryHint = projectRef.path;
        }

        if (!sessionId) {
          return;
        }
        const prompts = await loadMagicPrompts(directoryHint);
        assertOwner();
        const visiblePrompt = prompts.render('plan.todo.visible', { todo_text: pendingSendTarget.todoText });
        const instructionsText = prompts.render('plan.todo.instructions', { todo_text: pendingSendTarget.todoText });
        const syntheticParts = [{ synthetic: true as const, text: instructionsText }];


        const selectionState = useSelectionStore.getState();
        selectionState.saveSessionModelSelection(sessionId, execution.providerID, execution.modelID);
        const agentName = execution.agent.trim();
        if (agentName) {
          selectionState.saveSessionAgentSelection(sessionId, agentName);
          selectionState.saveAgentModelForSession(sessionId, agentName, execution.providerID, execution.modelID);
          selectionState.saveAgentModelVariantForSession(
            sessionId,
            agentName,
            execution.providerID,
            execution.modelID,
            execution.variant || undefined,
          );
        }

        setCurrentSession(sessionId, directoryHint);
        await sendMessage(
          visiblePrompt,
          execution.providerID,
          execution.modelID,
          execution.agent.trim() || undefined,
          undefined,
          undefined,
          syntheticParts,
          execution.variant || undefined,
          undefined,
          { target: { runtimeKey, sessionId, directory: directoryHint }, runtimeRevision: revision },
        );
        assertOwner();

        toast.success(
          pendingSendTarget.kind === 'worktree'
            ? t('rightSidebar.contextNotesTodo.toast.sentToNewWorktreeSession')
            : t('rightSidebar.contextNotesTodo.toast.sentToNewSession')
        );
        setPendingSendTarget(null);
        onActionComplete?.();
      } catch (error) {
        if (getRuntimeKey() !== runtimeKey || getRuntimeSwitchRevision() !== revision) return;
        const description = error instanceof Error ? error.message : undefined;
        toast.error(t('rightSidebar.contextNotesTodo.toast.sendTodoFailed'), description ? { description } : undefined);
      } finally {
        setIsSubmitting(false);
        setSendingTodoId(null);
      }
    },
    [canCreateWorktree, createSession, onActionComplete, pendingSendTarget, projectRef, routeToChat, sendMessage, setCurrentSession, t]
  );

  const closeDialog = React.useCallback(() => {
    if (!isSubmitting) {
      setPendingSendTarget(null);
    }
  }, [isSubmitting]);

  return {
    pendingSendTarget,
    isSubmitting,
    sendingTodoId,
    sendToCurrentSession,
    sendToNewSession,
    sendToNewWorktreeSession,
    confirmSend,
    closeDialog,
  };
};
