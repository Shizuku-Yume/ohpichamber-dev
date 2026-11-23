import { useKeybinds } from '@/hooks/useKeybind';
import { useI18n } from '@/lib/i18n';
import {
  addProject,
  copyCurrentSessionId,
  openArchive,
  openMultiRun,
  openNewWorktreeDialog,
  openNotes,
  openOverview,
  openTodos,
  pinCurrentSession,
  reloadUi,
  showContextUsage,
  toggleReasoningTraces,
  toggleWorkCurrentSession,
} from '@/lib/paletteCommands';

export function usePaletteShortcuts(): void {
  const { t } = useI18n();
  useKeybinds({
    open_new_worktree_dialog: openNewWorktreeDialog,
    add_project: addProject,
    show_context_usage: showContextUsage,
    open_overview: openOverview,
    reload_ui: reloadUi,
    toggle_reasoning_traces: toggleReasoningTraces,
    open_archive: openArchive,
    open_notes: openNotes,
    open_todos: openTodos,
    pin_current_session: pinCurrentSession(t),
    copy_current_session_id: copyCurrentSessionId(t),
    toggle_work_current_session: toggleWorkCurrentSession(t),
    open_multi_run: openMultiRun,
  });
}
