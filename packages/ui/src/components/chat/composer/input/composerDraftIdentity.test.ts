import { expect, test } from 'bun:test';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { keepWorkDraftOwnSlot } from '@/lib/chatDraftPersistence';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { resolveWorkDraftComposerKey } from './composerDraftIdentity';

test('project drafts keep their work slot while ordinary Chats use the folder slot', () => {
    const draft = useSessionUIStore.getState().newSessionDraft;
    expect(resolveWorkDraftComposerKey({ ...draft, open: true, target: 'project', workDraftId: 'project' })).toBe('draft:project');
    expect(resolveWorkDraftComposerKey({ ...draft, open: true, target: 'chat', workDraftId: 'ordinary' })).toBeNull();
    expect(resolveWorkDraftComposerKey(null)).toBeNull();
    expect(resolveWorkDraftComposerKey({ ...draft, open: false })).toBeNull();
});

test('explicit work-slot ownership is retained only in its runtime', () => {
    const draft = { ...useSessionUIStore.getState().newSessionDraft, open: true, target: 'chat' as const, workDraftId: 'shared' };
    keepWorkDraftOwnSlot('shared', 'another-runtime');
    expect(resolveWorkDraftComposerKey(draft)).toBeNull();
    keepWorkDraftOwnSlot('shared', getRuntimeKey());
    expect(resolveWorkDraftComposerKey(draft)).toBe('draft:shared');
});
