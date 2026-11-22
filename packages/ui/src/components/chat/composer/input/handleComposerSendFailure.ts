import type { AttachedFile } from '@/stores/types/sessionTypes';
import type { ChatDraftIdentity } from '@/lib/chatDraftPersistence';
import type { useI18n } from '@/lib/i18n';
import { useInputStore } from '@/sync/input-store';
import { AttachmentPathSaveError } from '@/sync/model-attachment-paths';
import { problemMessage } from '@/lib/problemMessage';

type SendFailureContext = {
    allAttachments: AttachedFile[];
    chatDraftIdentity: ChatDraftIdentity | null;
    restoreConsumedDrafts: () => void;
    restoreComposerText: () => void;
    t: ReturnType<typeof useI18n>['t'];
    notifyError: (message: string) => void;
};

export function handleComposerSendFailure(error: unknown, {
    allAttachments, chatDraftIdentity, restoreConsumedDrafts, restoreComposerText, t, notifyError,
}: SendFailureContext): void {
            const rawMessage =
                error instanceof Error
                    ? error.message
                    : typeof error === 'string'
                        ? error
                        : String(error ?? '');
            const normalized = rawMessage.toLowerCase();

            console.error('Message send failed:', rawMessage || error);
            restoreConsumedDrafts();
            restoreComposerText();

            const isSoftNetworkError =
                normalized.includes('timeout') ||
                normalized.includes('timed out') ||
                normalized.includes('may still be processing') ||
                normalized.includes('being processed') ||
                normalized.includes('failed to fetch') ||
                normalized.includes('networkerror') ||
                normalized.includes('network error') ||
                normalized.includes('gateway timeout') ||
                normalized === 'failed to send message';

            if (normalized.includes('payload too large') || normalized.includes('413') || normalized.includes('entity too large')) {
                notifyError(t('chat.chatInput.toast.attachmentsTooLarge'));
                if (allAttachments.length > 0) {
                    useInputStore.getState().restoreAttachedFiles(allAttachments, chatDraftIdentity);
                }
                return;
            }

            if (isSoftNetworkError) {
                if (allAttachments.length > 0) {
                    useInputStore.getState().restoreAttachedFiles(allAttachments, chatDraftIdentity);
                    notifyError(t('chat.chatInput.toast.sendAttachmentsFailed'));
                }
                return;
            }

            if (normalized.includes('runtime changed')) {
                if (allAttachments.length > 0) {
                    useInputStore.getState().restoreAttachedFiles(allAttachments, chatDraftIdentity);
                }
                notifyError(t('chat.chatInput.toast.messageSendFailed'));
                return;
            }

            if (allAttachments.length > 0) {
                useInputStore.getState().restoreAttachedFiles(allAttachments, chatDraftIdentity);
            }

            if (normalized.includes('returned a web page instead of an api response') || normalized.includes('runtime_unavailable')) {
                notifyError(t('chat.chatInput.toast.messageSendFailed'));
                return;
            }

            const unsaved = error instanceof AttachmentPathSaveError ? error
                : error instanceof Error && error.cause instanceof AttachmentPathSaveError ? error.cause : null;
            if (unsaved) {
                notifyError(t('chat.chatInput.toast.textModelImageSaveFailed', { files: unsaved.filenames.join(', ') }));
                return;
            }
            notifyError(problemMessage(error, rawMessage || t('chat.chatInput.toast.messageSendFailed')));

}
