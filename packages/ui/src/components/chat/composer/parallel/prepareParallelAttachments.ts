import type { PromptAttachment } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';
import { runtimeFetch } from '@/lib/runtime-fetch';
import type { AttachedFile } from '@/stores/types/sessionTypes';

export async function prepareParallelAttachments(files: readonly AttachedFile[], directory: string, isCurrent: () => boolean): Promise<{ files: PromptAttachment[]; workspaceId?: string }> {
    const assertCurrent = () => { if (!isCurrent()) throw new Error('Runtime or draft changed'); };
    assertCurrent();
    if (files.length === 0) return { files: [] };
    const { workspaceId } = await canonicalClient.resolveWorkspace(directory);
    assertCurrent();
    const prepared: PromptAttachment[] = [];
    for (const file of files) {
        assertCurrent();
        const uri = file.serverPath?.startsWith('attachment://') ? file.serverPath : file.dataUrl;
        const attachmentId = /^attachment:\/\/([^/?#]+)$/.exec(uri)?.[1];
        if (attachmentId) {
            prepared.push({ attachmentId, uri, name: file.filename, mediaType: file.mimeType, size: file.size });
            continue;
        }
        let blob: Blob = file.file;
        if (file.source === 'server') {
            const source = file.serverPath ?? file.dataUrl;
            const path = source.startsWith('file://') ? decodeURIComponent(source.slice(7)).replace(/^\/([A-Za-z]:\/)/, '$1') : source;
            if (!path || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(path)) throw new Error('Server attachment has no Host file path');
            const response = await runtimeFetch('/api/fs/raw', { query: { path, directory, allowOutsideWorkspace: 'true' } });
            assertCurrent();
            if (!response.ok) throw new Error('Failed to read attachment file bytes');
            blob = await response.blob();
            assertCurrent();
        }
        const bytes = new Uint8Array(await blob.arrayBuffer());
        assertCurrent();
        let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        const uploaded = await canonicalClient.uploadAttachment(workspaceId, { name: file.filename, mediaType: file.mimeType, size: blob.size }, btoa(binary));
        assertCurrent();
        prepared.push({ attachmentId: uploaded.attachmentId, uri: uploaded.uri, name: uploaded.name, mediaType: uploaded.mediaType, size: uploaded.size });
    }
    return { files: prepared, workspaceId };
}
