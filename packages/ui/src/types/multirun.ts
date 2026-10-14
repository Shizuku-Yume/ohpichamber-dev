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
  agentId?: string;
}

export interface CreateMultiRunParams {
  /** Seed for the group slug, worktree and branch names. */
  name: string;
  /** Human title shown in the sidebar and overview; defaults to `name`. */
  title?: string;
  groups: MultiRunGroup[];
  agent?: string;
  worktreeBaseBranch?: string;
  isolateRuns?: boolean;
  /** Files sent with every variant. */
  files?: PromptAttachment[];
  /** Workspace owning shared and variant attachment references; required when files are present. */
  attachmentWorkspaceId?: string;
  setupCommands?: string[];
  /** Fuse the lanes automatically once all of them finish. */
  autoFusion?: MultiRunAutoFusion;
}

export interface CreateMultiRunResult {
  groupSlug: string;
  groupKey: string;
  sessionIds: string[];
  firstSessionId: string | null;
  failedCount: number;
}
