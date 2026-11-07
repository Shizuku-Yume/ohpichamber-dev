import type { I18nKey, I18nParams } from '@/lib/i18n/store';

/** The handles the dirty-branch switch dialog needs from the screen that opened it. */
interface DirtyBranchSwitchDeps {
  /** The branch being switched to; null when no switch is pending. */
  branch: string | null;
  directory: string | null;
  /** The branch that was checked out before the switch, for the success message. */
  sourceBranch: string | null;
  createCommit: (directory: string, message: string, options: { addAll: true }) => Promise<void>;
  /** Runs the managed publish chooser and returns the push it prepared. */
  preparePush: () => Promise<() => Promise<void>>;
  refresh: () => Promise<void>;
  close: () => void;
  checkout: (branch: string) => Promise<void>;
  toast: { success: (message: string) => void; error: (message: string) => void };
  t: (key: I18nKey, params?: I18nParams) => string;
}

/**
 * Commits the worktree, publishes it when asked, and switches branches. A
 * failed push keeps the branch and reports the error: the commit stays, so
 * checking out the target would strand the work on a branch the person just
 * left. The switch only happens after the publish it asked for succeeded.
 */
export const commitAndSwitchDirtyBranch = async (
  deps: DirtyBranchSwitchDeps,
  message: string,
  pushAfter: boolean,
): Promise<void> => {
  const { branch, directory, sourceBranch, toast, t } = deps;
  if (!branch || !directory) return;
  await deps.createCommit(directory, message, { addAll: true });
  if (pushAfter) {
    try {
      const executePush = await deps.preparePush();
      await executePush();
    } catch {
      toast.error(t('gitView.dirtySwitch.pushFailed'));
      await deps.refresh();
      deps.close();
      return;
    }
  }
  toast.success(sourceBranch
    ? pushAfter
      ? t('gitView.publish.succeeded')
      : t('gitView.dirtySwitch.committedNotPushed', { branch: sourceBranch })
    : t('gitView.toast.commitCreated'));
  await deps.refresh();
  deps.close();
  await deps.checkout(branch);
};
