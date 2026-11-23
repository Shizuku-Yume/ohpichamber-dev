import { afterAll, afterEach, expect, mock, spyOn, test } from 'bun:test';
import { toast } from '@/components/ui';
import { useInputStore } from '@/sync/input-store';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { saveAttachmentsHeldForSend } from './saveAttachmentsHeldForSend';

const original = useInputStore.getState();
const notify = spyOn(toast, 'error').mockImplementation(() => 'error');
const file: AttachedFile = { id: 'held', filename: 'held.png', mimeType: 'image/png', size: 1, source: 'local', file: new File(['x'], 'held.png'), dataUrl: 'data:image/png;base64,eA==', saveOnSend: true };
const t = (key: string) => key;

afterAll(() => notify.mockRestore());

afterEach(() => {
    useInputStore.setState(original);
    notify.mockClear();
});

test('empty and ordinary attachments need no save', async () => {
    const save = mock(async () => [] as string[]);
    useInputStore.setState({ attachmentDraftKey: null, saveAttachmentsHeldForSend: save });
    expect(await saveAttachmentsHeldForSend(null, '/project', [], t)).toBe('none');
    expect(await saveAttachmentsHeldForSend(null, '/project', [{ ...file, saveOnSend: undefined }], t)).toBe('none');
    expect(save).not.toHaveBeenCalled();
});

test('saves only the sent attachment IDs in the captured directory', async () => {
    const save = mock(async () => [] as string[]);
    useInputStore.setState({ attachmentDraftKey: null, saveAttachmentsHeldForSend: save });
    expect(await saveAttachmentsHeldForSend(null, '/project', [file], t)).toBe('saved');
    expect(save).toHaveBeenCalledWith(null, '/project', new Set(['held']));
});

test('a failed save blocks Send and reports the failure', async () => {
    useInputStore.setState({ attachmentDraftKey: null, saveAttachmentsHeldForSend: async () => ['held.png'] });
    expect(await saveAttachmentsHeldForSend(null, '/project', [file], t)).toBe('stopped');
    expect(notify).toHaveBeenCalledWith('chat.chatInput.toast.imageCopySaveFailed');
});

test('a draft switch while saving suppresses stale publication', async () => {
    useInputStore.setState({ attachmentDraftKey: null, saveAttachmentsHeldForSend: async () => {
        useInputStore.setState({ attachmentDraftKey: 'another-draft' });
        return ['held.png'];
    } });
    expect(await saveAttachmentsHeldForSend(null, '/project', [file], t)).toBe('stopped');
    expect(notify).not.toHaveBeenCalled();
});

test('settled intake requests a fresh snapshot without saving stale files', async () => {
    const save = mock(async () => [] as string[]);
    useInputStore.setState({ attachmentDraftKey: null, saveAttachmentsHeldForSend: save });
    expect(await saveAttachmentsHeldForSend(null, '/project', [], t, async () => true)).toBe('saved');
    expect(save).not.toHaveBeenCalled();
});

test('a draft switch during intake blocks the retry', async () => {
    useInputStore.setState({ attachmentDraftKey: null });
    expect(await saveAttachmentsHeldForSend(null, '/project', [], t, async () => {
        useInputStore.setState({ attachmentDraftKey: 'another-draft' });
        return true;
    })).toBe('stopped');
});
