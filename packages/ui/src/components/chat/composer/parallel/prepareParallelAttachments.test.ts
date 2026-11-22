import { afterEach, expect, spyOn, test } from 'bun:test';
import { canonicalClient } from '@/api/canonicalClient';
import * as host from '@/lib/runtime-fetch';
import type { AttachedFile } from '@/stores/types/sessionTypes';
import { prepareParallelAttachments } from './prepareParallelAttachments';

const file = (extra: Partial<AttachedFile> = {}): AttachedFile => ({ id: 'file', filename: 'note.txt', mimeType: 'text/plain', size: 3, source: 'local', file: new File(['abc'], 'note.txt', { type: 'text/plain' }), dataUrl: 'data:text/plain;base64,YWJj', ...extra });
const workspace = spyOn(canonicalClient, 'resolveWorkspace');
const upload = spyOn(canonicalClient, 'uploadAttachment');
const fetch = spyOn(host, 'runtimeFetch');
afterEach(() => { workspace.mockReset(); upload.mockReset(); fetch.mockReset(); });
function ready() {
    workspace.mockResolvedValue({ workspaceId: 'workspace' } as Awaited<ReturnType<typeof canonicalClient.resolveWorkspace>>);
    upload.mockResolvedValue({ attachmentId: 'uploaded', uri: 'attachment://uploaded', name: 'note.txt', mediaType: 'text/plain', size: 3, createdAt: 1 });
}
test('empty inputs do not resolve or upload anything', async () => {
    expect(await prepareParallelAttachments([], '/project', () => true)).toEqual({ files: [] });
    expect(workspace).not.toHaveBeenCalled();
});
test('uploads actual bytes instead of a data URL', async () => {
    ready();
    const result = await prepareParallelAttachments([file()], '/project', () => true);
    expect(upload.mock.calls[0]).toEqual(['workspace', { name: 'note.txt', mediaType: 'text/plain', size: 3 }, 'YWJj']);
    expect(result.files[0]?.attachmentId).toBe('uploaded');
});
test('existing native attachment references remain references', async () => {
    ready();
    const result = await prepareParallelAttachments([file({ source: 'server', serverPath: 'attachment://existing' })], '/project', () => true);
    expect(result.files[0]?.uri).toBe('attachment://existing');
    expect(upload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
});
test('reads server-backed files through the Host before Canonical upload', async () => {
    ready();
    fetch.mockResolvedValue(new Response('abc'));
    await prepareParallelAttachments([file({ source: 'server', serverPath: '/project/note.txt', dataUrl: '' })], '/project', () => true);
    expect(fetch.mock.calls[0]?.[0]).toBe('/api/fs/raw');
    expect(upload.mock.calls[0]?.[2]).toBe('YWJj');
});
test('Host failure blocks admission rather than uploading empty bytes', async () => {
    ready();
    fetch.mockResolvedValue(new Response('Denied', { status: 403 }));
    await expect(prepareParallelAttachments([file({ source: 'server', serverPath: '/denied', dataUrl: '' })], '/project', () => true)).rejects.toThrow('Failed to read');
    expect(upload).not.toHaveBeenCalled();
});
test('a runtime or draft change after workspace resolution blocks upload', async () => {
    ready();
    let current = true;
    workspace.mockImplementation(async () => { current = false; return { workspaceId: 'workspace' } as Awaited<ReturnType<typeof canonicalClient.resolveWorkspace>>; });
    await expect(prepareParallelAttachments([file()], '/project', () => current)).rejects.toThrow('Runtime or draft changed');
    expect(upload).not.toHaveBeenCalled();
});
