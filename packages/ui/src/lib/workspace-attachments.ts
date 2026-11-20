import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { getRuntimeSwitchRevision } from './runtime-switch';

type AttachmentInput = { filename: string; bytes: Uint8Array };
type SavedAttachment = { filename: string; path: string } | { filename: string; error: Error };

export async function saveWorkspaceAttachments(
  directory: string | null | undefined,
  attachments: readonly AttachmentInput[],
): Promise<SavedAttachment[]> {
  if (attachments.length === 0) return [];
  const revision = getRuntimeSwitchRevision();
  const assertCurrent = () => {
    if (revision !== getRuntimeSwitchRevision()) throw new Error('Runtime changed');
  };
  const folder = directory?.replace(/\\/g, '/');
  if (!folder) throw new Error('A workspace directory is required to save attachments');
  const files = getRegisteredRuntimeAPIs()?.files;
  const uploadFile = files?.uploadFile?.bind(files);
  if (!files || !uploadFile) throw new Error('This Host does not support file uploads');
  const target = `${folder.replace(/\/+$/, '')}/.ohpichamber/attachments/${crypto.randomUUID()}`;
  const created = await files.createDirectory(target);
  assertCurrent();
  if (!created.success) throw new Error('Could not create the attachment directory');
  return Promise.all(attachments.map(async ({ filename, bytes }): Promise<SavedAttachment> => {
    try {
      if (!filename || filename === '.' || filename === '..' || /[/\\]/.test(filename) || filename.includes(String.fromCharCode(0))) {
        throw new Error('Invalid attachment filename');
      }
      assertCurrent();
      const path = `${target}/${filename}`;
      const result = await uploadFile(path, new Blob([Uint8Array.from(bytes)]), { directory: folder });
      assertCurrent();
      if (!result.success) throw new Error(`Could not save ${filename}`);
      return { filename, path: result.path };
    } catch (error) {
      return { filename, error: error instanceof Error ? error : new Error(String(error)) };
    }
  }));
}
