import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test';
import { useInputStore } from '@/sync/input-store';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { handleComposerSendFailure } from './handleComposerSendFailure';

const originalRestore = useInputStore.getState().restoreAttachedFiles;
const log = spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => log.mockRestore());

afterEach(() => {
    useInputStore.setState({ restoreAttachedFiles: originalRestore });
    log.mockClear();
});

test.each([
    ['failure', false, 'failure'],
    [undefined, false, 'chat.chatInput.toast.messageSendFailed'],
    ['413 payload too large', true, 'chat.chatInput.toast.attachmentsTooLarge'],
    ['network error', true, 'chat.chatInput.toast.sendAttachmentsFailed'],
    ['network error', false, undefined],
    ['runtime changed', true, 'chat.chatInput.toast.messageSendFailed'],
] as const)('restores native input after %s (attachments: %s)', (error, attached, expected) => {
    const restore = mock();
    useInputStore.setState({ restoreAttachedFiles: restore });
    const restoreConsumedDrafts = mock();
    const restoreComposerText = mock();
    const notifyError = mock();
    const attachments: AttachedFile[] = attached ? [{ id: 'attachment', filename: 'photo.png', file: new File(['x'], 'photo.png'), dataUrl: 'data:image/png;base64,eA==', mimeType: 'image/png', size: 1, source: 'local' }] : [];
    handleComposerSendFailure(error, {
        allAttachments: attachments,
        chatDraftIdentity: null,
        restoreConsumedDrafts,
        restoreComposerText,
        t: (key) => key,
        notifyError,
    });
    expect(restoreConsumedDrafts).toHaveBeenCalledTimes(1);
    expect(restoreComposerText).toHaveBeenCalledTimes(1);
    expect(restore).toHaveBeenCalledTimes(attached ? 1 : 0);
    if (expected) expect(notifyError).toHaveBeenCalledWith(expected);
    else expect(notifyError).not.toHaveBeenCalled();
});
