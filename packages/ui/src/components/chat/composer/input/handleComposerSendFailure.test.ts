import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test';
import { useInputStore } from '@/sync/input-store';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { handleComposerSendFailure } from './handleComposerSendFailure';
import { AttachmentPathSaveError } from '@/sync/model-attachment-paths';

const originalRestore = useInputStore.getState().restoreAttachedFiles;
const log = spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => log.mockRestore());

afterEach(() => {
    useInputStore.setState({ restoreAttachedFiles: originalRestore });
    log.mockClear();
});

const cases: [string | undefined, boolean, string | undefined][] = [
    ['failure', false, 'failure'],
    [undefined, false, 'chat.chatInput.toast.messageSendFailed'],
    ['413 payload too large', true, 'chat.chatInput.toast.attachmentsTooLarge'],
    ['network error', true, 'chat.chatInput.toast.sendAttachmentsFailed'],
    ['network error', false, undefined],
    ['runtime changed', true, 'chat.chatInput.toast.messageSendFailed'],
];
test('path-save errors restore held and server-backed files to their original owner', () => {
    const target = { runtimeKey: 'host', directory: '/project', sessionId: 'session' };
    const files: AttachedFile[] = [
        { id: 'held', filename: 'held.png', file: new File(['x'], 'held.png'), dataUrl: 'data:image/png;base64,eA==', mimeType: 'image/png', size: 1, source: 'local', saveOnSend: true },
        { id: 'server', filename: 'server.png', file: new File([], 'server.png'), dataUrl: 'file:///project/server.png', serverPath: '/project/server.png', mimeType: 'image/png', size: 1, source: 'server' },
    ];
    const restore = mock((_files: AttachedFile[], _target: Parameters<typeof originalRestore>[1]) => {});
    useInputStore.setState({ restoreAttachedFiles: restore });
    const notifyError = mock((_message: string) => {});
    handleComposerSendFailure(new AttachmentPathSaveError(['held.png']), {
        allAttachments: files, chatDraftIdentity: target, restoreConsumedDrafts: mock(), restoreComposerText: mock(), t: (key) => key, notifyError,
    });
    expect(restore).toHaveBeenCalledWith(files, target);
    expect(notifyError).toHaveBeenCalledWith('chat.chatInput.toast.textModelImageSaveFailed');
});
test.each(cases)('restores native input after %s (attachments: %s)', (error, attached, expected) => {
    const restore = mock((_files: AttachedFile[], _target: Parameters<typeof originalRestore>[1]) => {});
    useInputStore.setState({ restoreAttachedFiles: restore });
    const restoreConsumedDrafts = mock();
    const restoreComposerText = mock();
    const notifyError = mock((_message: string) => {});
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
