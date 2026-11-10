import React from 'react';
import { toast } from '@/components/ui';
import { clearChatDraft, createChatDraftIdentity } from '@/lib/chatDraftPersistence';
import { useI18n } from '@/lib/i18n';
import { normalizePath } from '@/lib/pathNormalization';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { useSessionDraftsStore, type SessionDraft } from '@/stores/useSessionDraftsStore';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { openSessionDraft } from './openSessionDraft';

/**
 * What a draft's row knows and does, whatever draws it. Opening puts it in the
 * composer, where its text goes on as the device's own draft for that
 * directory; the Host's copy keeps the files for other devices.
 */
export function useSessionDraftRow(draft: SessionDraft, onNavigate: () => void) {
  const { t } = useI18n();
  // The draft in the composer right now: its row is the selected one.
  const isOpen = useSessionUIStore((state) => (
    !state.currentSessionId
    && state.newSessionDraft.open
    && normalizePath(state.newSessionDraft.directoryOverride) === normalizePath(draft.directory)
  ));
  const firstLine = React.useMemo(() => draft.text.split(/\r?\n/).find((line) => line.trim())?.trim() ?? '', [draft.text]);
  const attachmentCount = draft.attachments.length;
  const label = firstLine || (attachmentCount === 1
    ? t('sessions.sidebar.draft.attachmentsSingle', { count: attachmentCount })
    : t('sessions.sidebar.draft.attachmentsPlural', { count: attachmentCount }));
  const open = (): void => {
    // Leaves a full-page surface (a run's overview, Archive) as a session row does.
    useUIStore.getState().closeMainSurfaces();
    onNavigate();
    if (isOpen) return;
    void openSessionDraft(draft).then((complete) => {
      if (!complete) toast.error(t('sessions.sidebar.draft.attachmentsMissing'));
    });
  };
  const discard = (): void => {
    void useSessionDraftsStore.getState().discard(draft.id, { final: true }).catch(() => toast.error(t('sessions.sidebar.draft.discardFailed')));
    if (!isOpen) return;
    // Thrown away while in the composer: its text goes too, and the composer
    // starts a fresh draft in the same place.
<<<<<<< HEAD
    const identity = createChatDraftIdentity(getRuntimeKey(), draft.directory, null);
    if (identity) clearChatDraft(identity);
=======
    const identity = createChatDraftIdentity(getRuntimeKey(), draft.directory, workDraftComposerKey(draft.id));
    if (identity) clearChatDraft(identity, true);
>>>>>>> bc50ba56a
    useSessionUIStore.getState().openNewSessionDraft({ selectedProjectId: draft.projectId ?? undefined, directoryOverride: draft.directory });
  };
  return { isOpen, firstLine, attachmentCount, label, open, discard };
}
