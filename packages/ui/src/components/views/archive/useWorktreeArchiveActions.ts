import React from 'react';
import { toast } from '@/components/ui';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { GitWorktreeRequestError, type GitWorktreeArchive } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { git } from '@/lib/gitApi';
import type { ProjectRef } from '@/lib/worktrees/worktreeManager';
import { archivedWorktreeLabel, deleteArchivedWorktree, loadWorktreeArchives, restoreArchivedWorktree } from '@/lib/worktrees/worktreeArchive';

export function useWorktreeArchiveActions() {
  const { t } = useI18n();
  const { confirm, confirmWithCheckbox, dialog } = useConfirmDialog();
  const [busyIds, setBusyIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const track = React.useCallback(async (id: string, work: () => Promise<void>) => {
    setBusyIds((current) => new Set(current).add(id));
    try {
      await work();
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const restore = React.useCallback(async (project: ProjectRef, archive: GitWorktreeArchive) => {
    const label = archivedWorktreeLabel(archive);
    if (archive.sessionBinding.status === 'unbound' && !await confirm({ title: t('sessions.archive.worktree.restoreAria', { label }),
      message: t('sessions.archive.worktree.legacyWarning'), action: t('sessions.archive.worktree.restore') })) return;
    await track(archive.id, async () => {
      try {
        let recovery: { head: string; revision: number } | undefined;
        if (archive.sessionBinding.phase === 'restoring' && archive.sessionBinding.revision) {
          try {
            const resumed = await git.worktree.restoreArchive(project.path, archive.id, { mode: 'same_target', revision: archive.sessionBinding.revision });
            void loadWorktreeArchives(project.path).catch(() => undefined);
            if (resumed.conflicts) toast.warning(t('sessions.archive.worktree.restoredWithConflicts'), { description: t('sessions.archive.worktree.restoredWithConflictsDescription') });
            else toast.success(t('sessions.archive.worktree.restored'), { description: label });
            return;
          } catch (error) {
            if (!(error instanceof GitWorktreeRequestError) || error.code !== 'WORKTREE_ARCHIVE_RESTORE_RECOVERY_REQUIRED') throw error;
            const fresh = (await loadWorktreeArchives(project.path)).find(item => item.id === archive.id);
            if (!fresh?.sessionBinding.recoveryHead || !fresh.sessionBinding.revision) throw error;
            recovery = { head: fresh.sessionBinding.recoveryHead, revision: fresh.sessionBinding.revision };
            if (!await confirm({ title: t('sessions.archive.worktree.recoverNew'), message: t('sessions.archive.worktree.recoverWarning'),
              action: t('sessions.archive.worktree.recoverNew') })) return;
          }
        }
        const result = await restoreArchivedWorktree({ project, archive, recovery });
        if (result.outcome === 'cancelled') return;
        if (result.conflicts) {
          toast.warning(t('sessions.archive.worktree.restoredWithConflicts'), { description: t('sessions.archive.worktree.restoredWithConflictsDescription') });
        } else {
          toast.success(t('sessions.archive.worktree.restored'), { description: label });
        }
      } catch (error) {
        toast.error(t('sessions.archive.worktree.restoreFailed'), { description: error instanceof Error ? error.message : String(error) });
      }
    });
  }, [confirm, t, track]);

  const remove = React.useCallback(async (project: ProjectRef, archive: GitWorktreeArchive) => {
    const label = archivedWorktreeLabel(archive);
    const choice = await confirmWithCheckbox({
      title: t('sessions.archive.worktree.deleteTitle', { label }),
      message: archive.sessionBinding.status === 'unbound' ? t('sessions.archive.worktree.legacyWarning') : t('sessions.archive.worktree.deleteMessage'),
      action: t('sessions.archive.worktree.deleteAction'),
      destructive: true,
      checkbox: { label: t('sessions.archive.worktree.deleteBranchOption'), defaultChecked: false },
    });
    if (!choice.confirmed) return;
    await track(archive.id, async () => {
      try {
        await deleteArchivedWorktree({ project, archive, deleteBranch: choice.checkboxChecked });
        toast.success(t('sessions.archive.worktree.deleted'), { description: label });
      } catch (error) {
        toast.error(t('sessions.archive.worktree.deleteFailed'), { description: error instanceof Error ? error.message : String(error) });
      }
    });
  }, [confirmWithCheckbox, t, track]);

  return { restore, remove, busyIds, dialog };
}
