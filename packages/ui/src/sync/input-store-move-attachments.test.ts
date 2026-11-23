import { afterEach, expect, test } from 'bun:test';
import { getChatDraftIdentityKey } from '@/lib/chatDraftPersistence';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { useInputStore } from './input-store';

const initial = useInputStore.getState();
afterEach(() => useInputStore.setState(initial));
const from = { runtimeKey: 'host', directory: '/before', sessionId: 'draft:one' };
const to = { ...from, directory: '/after' };
const file: AttachedFile = { id: 'one', filename: 'photo.png', file: new File(['x'], 'photo.png'), dataUrl: '', source: 'server', serverPath: '/before/photo.png', mimeType: 'image/png', size: 1 };

test('moving to an inactive slot is atomic and preserves server references', () => {
    useInputStore.setState({ attachmentDraftKey: getChatDraftIdentityKey(from), attachedFiles: [file], attachmentDrafts: new Map() });
    let notifications = 0;
    const stop = useInputStore.subscribe(() => { notifications += 1; });
    try { useInputStore.getState().moveAttachedFiles(from, to); } finally { stop(); }
    expect(notifications).toBe(1);
    expect(useInputStore.getState().getAttachedFiles(from)).toEqual([]);
    expect(useInputStore.getState().getAttachedFiles(to)).toEqual([file]);
});

test('moving into the active slot merges without duplicates or disturbing siblings', () => {
    const other = { ...file, id: 'other', saveOnSend: true };
    const sibling = { ...to, sessionId: 'sibling' };
    useInputStore.setState({ attachmentDraftKey: getChatDraftIdentityKey(to), attachedFiles: [file], attachmentDrafts: new Map([[getChatDraftIdentityKey(from), [file, other]], [getChatDraftIdentityKey(sibling), [other]]]) });
    useInputStore.getState().moveAttachedFiles(from, to);
    expect(useInputStore.getState().getAttachedFiles(from)).toEqual([]);
    expect(useInputStore.getState().getAttachedFiles(to)).toEqual([file, other]);
    expect(useInputStore.getState().getAttachedFiles(sibling)).toEqual([other]);
});

test('empty and identical slots are no-ops', () => {
    useInputStore.setState({ attachmentDraftKey: null, attachedFiles: [], attachmentDrafts: new Map() });
    const before = useInputStore.getState();
    before.moveAttachedFiles(from, to);
    before.moveAttachedFiles(from, from);
    expect(useInputStore.getState()).toBe(before);
});

test('cross-runtime moves fail without changing either slot', () => {
    const before = useInputStore.getState();
    expect(() => before.moveAttachedFiles(from, { ...to, runtimeKey: 'remote' })).toThrow('Cannot move attachments between runtimes');
    expect(useInputStore.getState()).toBe(before);
});
