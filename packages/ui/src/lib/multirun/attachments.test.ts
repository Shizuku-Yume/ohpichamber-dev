import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { PromptAttachment } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { admitLaneAttachments } from './attachments';

const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const attachment: PromptAttachment = { attachmentId: 'source-file', name: 'file.bin', mediaType: 'application/octet-stream', size: 3, uri: 'attachment://source-file' };
const assertCurrent = () => {};

describe('native lane attachment ownership', () => {
  test('shared bytes are re-admitted separately into every destination workspace', async () => {
    const read = spyOn(canonicalClient, 'readAttachment').mockResolvedValue(new Blob([new Uint8Array([0, 127, 255])]));
    const upload = spyOn(canonicalClient, 'uploadAttachment').mockImplementation(async (workspaceId, metadata) => ({
      ...metadata, attachmentId: `file-${workspaceId}`, uri: `attachment://file-${workspaceId}`, createdAt: 1,
    }));
    spies.push(read, upload);
    for (const destinationWorkspaceId of ['lane-a', 'lane-b']) {
      expect(await admitLaneAttachments({ files: [attachment], sourceWorkspaceId: 'source', destinationWorkspaceId, assertCurrent })).toEqual([
        { ...attachment, attachmentId: `file-${destinationWorkspaceId}`, uri: `attachment://file-${destinationWorkspaceId}` },
      ]);
    }
    expect(read.mock.calls).toEqual([['source', 'source-file'], ['source', 'source-file']]);
    expect(upload.mock.calls).toEqual([
      ['lane-a', { name: 'file.bin', mediaType: 'application/octet-stream', size: 3 }, 'AH//'],
      ['lane-b', { name: 'file.bin', mediaType: 'application/octet-stream', size: 3 }, 'AH//'],
    ]);
  });
  test('same workspace keeps its already admitted identity without reading bytes', async () => {
    const read = spyOn(canonicalClient, 'readAttachment');
    const upload = spyOn(canonicalClient, 'uploadAttachment');
    spies.push(read, upload);
    expect(await admitLaneAttachments({ files: [attachment], sourceWorkspaceId: 'same', destinationWorkspaceId: 'same', assertCurrent })).toEqual([attachment]);
    expect(read.mock.calls.length).toBe(0);
    expect(upload.mock.calls.length).toBe(0);
  });
  test('source owner failures propagate without dispatching source references', async () => {
    spies.push(spyOn(canonicalClient, 'readAttachment').mockRejectedValue(new Error('Attachment owner mismatch')));
    const upload = spyOn(canonicalClient, 'uploadAttachment');
    spies.push(upload);
    await expect(admitLaneAttachments({ files: [attachment], sourceWorkspaceId: 'source', destinationWorkspaceId: 'lane', assertCurrent })).rejects.toThrow('Attachment owner mismatch');
    expect(upload.mock.calls.length).toBe(0);
  });
  test('runtime switch after read prevents uploading into another runtime', async () => {
    let current = true;
    spies.push(spyOn(canonicalClient, 'readAttachment').mockImplementation(async () => { current = false; return new Blob(['abc']); }));
    const upload = spyOn(canonicalClient, 'uploadAttachment');
    spies.push(upload);
    await expect(admitLaneAttachments({ files: [attachment], sourceWorkspaceId: 'source', destinationWorkspaceId: 'lane', assertCurrent: () => { if (!current) throw new Error('Runtime changed'); } })).rejects.toThrow('Runtime changed');
    expect(upload.mock.calls.length).toBe(0);
  });
});
