import type { PromptAttachment } from '@openchamber/agent-contract';
import { canonicalClient } from '@/api/canonicalClient';

/** Admission belongs to a workspace, so a worktree lane needs its own references. */
export async function admitLaneAttachments(input: {
  files: readonly PromptAttachment[];
  sourceWorkspaceId: string;
  destinationWorkspaceId: string;
  assertCurrent: () => void;
}): Promise<PromptAttachment[]> {
  input.assertCurrent();
  if (input.sourceWorkspaceId === input.destinationWorkspaceId) return [...input.files];
  const admitted: PromptAttachment[] = [];
  for (const attachment of input.files) {
    input.assertCurrent();
    const file = await canonicalClient.readAttachment(input.sourceWorkspaceId, attachment.attachmentId);
    input.assertCurrent();
    const bytes = new Uint8Array(await file.arrayBuffer());
    input.assertCurrent();
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    const uploaded = await canonicalClient.uploadAttachment(input.destinationWorkspaceId, {
      name: attachment.name, mediaType: attachment.mediaType, size: file.size,
    }, btoa(binary));
    input.assertCurrent();
    admitted.push({ attachmentId: uploaded.attachmentId, name: uploaded.name, mediaType: uploaded.mediaType, size: uploaded.size, uri: uploaded.uri });
  }
  return admitted;
}
