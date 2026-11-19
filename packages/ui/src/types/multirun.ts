import type { ModelSelection, PromptAttachment } from '@openchamber/agent-contract';

export type MultiRunModelSelection = ModelSelection & {
  displayName?: string;
  variant?: string;
  reasoningEffort?: string;
};


export interface MultiRunGroup {
  prompt: string;
  models: MultiRunModelSelection[];
<<<<<<< HEAD
  /** Files that belong to this prompt variant only (for example resolved @mentions). */
  files?: PromptAttachment[];
||||||| bc50ba56aa
  /** Files that belong to this prompt variant only (for example resolved @mentions). */
  files?: MultiRunFileAttachment[];
=======
  files?: MultiRunFileAttachment[];
>>>>>>> upstream/main
}

export interface MultiRunAutoFusion extends ModelSelection {
  variant?: string;
<<<<<<< HEAD
||||||| bc50ba56aa
  agent?: string;
}

export interface MultiRunGoal {
  /** Applies to each lane separately. */
  tokenBudget: number | null;
=======
  agent?: string;
}

export interface MultiRunGoal {
  tokenBudget: number | null;
>>>>>>> upstream/main
}

export interface CreateMultiRunParams {
  name: string;
  title?: string;
  groups: MultiRunGroup[];
  worktreeBaseBranch?: string;
  isolateRuns?: boolean;
<<<<<<< HEAD
  /** Files sent with every variant. */
  files?: PromptAttachment[];
  /** Workspace owning shared and variant attachment references; required when files are present. */
  attachmentWorkspaceId?: string;
||||||| bc50ba56aa
  /** Files sent with every variant. */
  files?: MultiRunFileAttachment[];
=======
  files?: MultiRunFileAttachment[];
>>>>>>> upstream/main
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
