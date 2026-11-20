import { beforeEach, expect, mock, test } from 'bun:test';

let revision = 0;
const createDirectory = mock(async (path: string) => ({ success: true, path }));
const upload = mock(async (path: string, _file: Blob, _options: { directory?: string }) => ({ success: true, path }));
mock.module('@/contexts/runtimeAPIRegistry', () => ({ getRegisteredRuntimeAPIs: () => ({ files: { createDirectory, uploadFile: upload } }) }));
mock.module('./runtime-switch', () => ({ getRuntimeSwitchRevision: () => revision }));
const { saveWorkspaceAttachments } = await import('./workspace-attachments');

beforeEach(() => {
  revision = 0;
  createDirectory.mockReset();
  createDirectory.mockImplementation(async (path) => ({ success: true, path }));
  upload.mockReset();
  upload.mockImplementation(async (path) => ({ success: true, path }));
});

test('saves bytes through the workspace Host upload with a unique path', async () => {
  const [result] = await saveWorkspaceAttachments('/workspace', [{ filename: 'image.png', bytes: new Uint8Array([1, 2]) }]);
  expect(result.filename).toBe('image.png');
  if (!('path' in result)) throw result.error;
  expect(result.path).toMatch(/^\/workspace\/\.ohpichamber\/attachments\/[^/]+\/image\.png$/);
  expect(upload).toHaveBeenCalledTimes(1);
  const [path, file, options] = upload.mock.calls[0];
  expect(path).toBe(result.path);
  expect(options.directory).toBe('/workspace');
  expect(await file.arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
});

test('an empty batch never creates a directory or writes files', async () => {
  expect(await saveWorkspaceAttachments(null, [])).toEqual([]);
  expect(createDirectory).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});

test('directory creation failure is not an empty successful save', async () => {
  createDirectory.mockRejectedValueOnce(new Error('permission denied'));
  await expect(saveWorkspaceAttachments('/workspace', [{ filename: 'image.png', bytes: new Uint8Array() }])).rejects.toThrow('permission denied');
  expect(upload).not.toHaveBeenCalled();
});

test('a failed upload does not hide another successful attachment', async () => {
  upload.mockRejectedValueOnce(new Error('permission denied'));
  const result = await saveWorkspaceAttachments('/workspace', [
    { filename: 'first.png', bytes: new Uint8Array() },
    { filename: 'second.png', bytes: new Uint8Array() },
  ]);
  expect(result[0]).toMatchObject({ filename: 'first.png', error: expect.any(Error) });
  expect(result[1]).toMatchObject({ filename: 'second.png', path: expect.stringContaining('/second.png') });
});

test('a runtime switch while preparing the directory prevents uploads', async () => {
  createDirectory.mockImplementationOnce(async (path) => { revision += 1; return { success: true, path }; });
  await expect(saveWorkspaceAttachments('/workspace', [{ filename: 'image.png', bytes: new Uint8Array() }])).rejects.toThrow('Runtime changed');
  expect(upload).not.toHaveBeenCalled();
});

test('filenames cannot escape the workspace attachment directory', async () => {
  const [result] = await saveWorkspaceAttachments('/workspace', [{ filename: '../outside.png', bytes: new Uint8Array() }]);
  expect(result).toMatchObject({ filename: '../outside.png', error: expect.any(Error) });
  expect(upload).not.toHaveBeenCalled();
});
