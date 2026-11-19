import type { ModelSelection, PromptAttachment } from '@openchamber/agent-contract';

export type MultiRunModelSelection = ModelSelection & {
  displayName?: string;
  variant?: string;
  reasoningEffort?: string;
};


export interface MultiRunGroup {
  prompt: string;
  models: MultiRunModelSelection[];
  /** Files that belong to this prompt variant only (for example resolved @mentions). */
  files?: PromptAttachment[];
}

export interface MultiRunAutoFusion extends ModelSelection {
  variant?: string;
}

export interface CreateMultiRunParams {
  name: string;
  title?: string;
  groups: MultiRunGroup[];
  worktreeBaseBranch?: string;
  isolateRuns?: boolean;
  /** Files sent with every variant. */
  files?: PromptAttachment[];
  /** Workspace owning shared and variant attachment references; required when files are present. */
  attachmentWorkspaceId?: string;
  setupCommands?: string[];
  autoFusion?: MultiRunAutoFusion;
  goal?: MultiRunGoal;
}

export interface MultiRunGoal {
  /** Applies to each lane separately. */
  tokenBudget: number | null;
}

export interface CreateMultiRunResult {
  groupSlug: string;
  groupKey: string;
  sessionIds: string[];
  firstSessionId: string | null;
  failedCount: number;
}
