import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { GENERATED_IMAGE_DIRECTORY, createImageGenerationAction, generatedImagePaths } from './generate-image.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
const tempDirs = [];
const makeDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-image-'));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
});

const setup = ({
  settings = { agentImageToolEnabled: true, agentImageModel: 'openrouter/openai/gpt-image-2' },
  workspaceScope = { workspaceId: 'ws-123' },
  handler,
} = {}) => {
  const requests = [];
  const service = {
    request: async (targetPath, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      requests.push({ path: targetPath, init, body });
      if (handler) return handler(targetPath, init, body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          model: { providerId: 'openrouter', modelId: 'openai/gpt-image-2' },
          images: Array.from({ length: body?.count ?? 1 }, () => ({
            data: PNG.toString('base64'),
            mimeType: 'image/png',
          })),
        }),
      };
    },
  };
  const generate = createImageGenerationAction({
    service,
    resolveWorkspaceScope: async () => workspaceScope,
    readSettings: async () => settings,
    fsPromises: fs.promises,
    // Local time: the file is named by the clock the user sees.
    now: () => new Date(2026, 9, 27, 17, 10, 25, 942),
  });
  return { generate, requests, service };
};

describe('image.generate', () => {
  it('asks the canonical Agent Service with the chosen model and saves the image where the agent said', async () => {
    const directory = makeDir();
    const { generate, requests } = setup();

    const result = await generate({ prompt: 'a lighthouse', aspect: '16:9', resolution: '2K', path: 'art/hero' }, { directory });

    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe('/api/agent/v1/workspaces/ws-123/images/generate');
    expect(requests[0].body).toEqual({
      workspaceId: 'ws-123',
      selection: { providerId: 'openrouter', modelId: 'openai/gpt-image-2' },
      prompt: 'a lighthouse',
      aspectRatio: '16:9',
      imageSize: '2K',
    });
    expect(result).toEqual({
      model: 'openrouter/openai/gpt-image-2',
      images: [{ path: path.join(directory, 'art', 'hero.png'), mime: 'image/png' }],
    });
    expect(fs.readFileSync(path.join(directory, 'art', 'hero.png'))).toEqual(PNG);
  });

  it('numbers the rest of several images, and saves to the temporary folder without a path', async () => {
    const directory = makeDir();
    const { generate } = setup();

    const named = await generate({ prompt: 'icons', count: 3, path: path.join(directory, 'icon.png') }, { directory });
    expect(named.images.map((image) => path.basename(image.path))).toEqual(['icon.png', 'icon-2.png', 'icon-3.png']);

    const unnamed = await generate({ prompt: 'one', count: '1' }, { directory });
    expect(path.dirname(unnamed.images[0].path)).toBe(GENERATED_IMAGE_DIRECTORY);
    expect(path.basename(unnamed.images[0].path)).toBe('omp-image-2026-10-27T17-10-25-942.png');
    fs.rmSync(unnamed.images[0].path, { force: true });
  });

  it('sends reference images and refuses a file that is not an image', async () => {
    const directory = makeDir();
    fs.writeFileSync(path.join(directory, 'ref.png'), PNG);
    fs.writeFileSync(path.join(directory, 'notes.txt'), 'hello');
    const { generate, requests } = setup();

    await generate({ prompt: 'make it blue', images: ['ref.png'], path: 'out.png' }, { directory });
    expect(requests[0].body.inputImages).toEqual([{ data: PNG.toString('base64'), mimeType: 'image/png' }]);

    await expect(generate({ prompt: 'x', images: ['notes.txt'] }, { directory })).rejects.toMatchObject({ statusCode: 400 });
    await expect(generate({ prompt: 'x', images: ['missing.png'] }, { directory })).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('Image not found') });
  });

  it('refuses while the tool is off or no model is chosen, before calling Agent Service', async () => {
    const off = setup({ settings: { agentImageToolEnabled: false, agentImageModel: 'a/b' } });
    await expect(off.generate({ prompt: 'x' }, {})).rejects.toMatchObject({ statusCode: 403 });
    const unset = setup({ settings: { agentImageToolEnabled: true } });
    await expect(unset.generate({ prompt: 'x' }, {})).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Image model') });
    expect([...off.requests, ...unset.requests]).toEqual([]);
  });

  it('refuses a relative path without a session folder before the provider bills an image', async () => {
    const { generate, requests } = setup();
    await expect(generate({ prompt: 'x', path: 'hero.png' }, {})).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('absolute path') });
    expect(requests).toEqual([]);
  });

  it('checks its inputs', async () => {
    const { generate } = setup();
    await expect(generate({}, {})).rejects.toMatchObject({ statusCode: 400, message: 'prompt is required' });
    await expect(generate({ prompt: 'x', count: 9 }, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(generate({ prompt: 'x', aspect: 'wide' }, {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(generate({ prompt: 'x', images: Array(9).fill('a.png') }, {})).rejects.toMatchObject({ statusCode: 400 });
  });

  it('maps canonical problem details correctly from Agent Service', async () => {
    const modelUnavailable = setup({
      handler: async () => ({
        ok: false,
        status: 422,
        json: async () => ({
          type: 'urn:ohpichamber:problem:MODEL_UNAVAILABLE',
          title: 'Request refused',
          status: 422,
          code: 'MODEL_UNAVAILABLE',
          detail: 'Model is disabled',
          retryable: false,
        }),
      }),
    });
    await expect(modelUnavailable.generate({ prompt: 'x' }, { directory: makeDir() })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('disabled or unavailable'),
    });

    const providerUnavailable = setup({
      handler: async () => ({
        ok: false,
        status: 422,
        json: async () => ({
          type: 'urn:ohpichamber:problem:PROVIDER_UNAVAILABLE',
          title: 'Request refused',
          status: 422,
          code: 'PROVIDER_UNAVAILABLE',
          detail: 'No credentials',
          retryable: false,
        }),
      }),
    });
    await expect(providerUnavailable.generate({ prompt: 'x' }, { directory: makeDir() })).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('disabled or has no usable credentials'),
    });

    const modelMismatch = setup({
      handler: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: { providerId: 'other-provider', modelId: 'other-model' },
          images: [{ data: PNG.toString('base64'), mimeType: 'image/png' }],
        }),
      }),
    });
    await expect(modelMismatch.generate({ prompt: 'x' }, { directory: makeDir() })).rejects.toMatchObject({
      statusCode: 502,
      message: expect.stringContaining('does not match requested model'),
    });

    const emptyImages = setup({
      handler: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          model: { providerId: 'openrouter', modelId: 'openai/gpt-image-2' },
          images: [],
        }),
      }),
    });
    await expect(emptyImages.generate({ prompt: 'x' }, { directory: makeDir() })).rejects.toMatchObject({
      statusCode: 502,
    });
  });
});

describe('generatedImagePaths', () => {
  it('reads the saved paths from a successful result envelope only', () => {
    const envelope = (ok, data) => JSON.stringify({ schemaVersion: 1, ok, action: 'image.generate', data });
    expect(generatedImagePaths(envelope(true, { images: [{ path: '/tmp/a.png' }, { path: '' }] }))).toEqual(['/tmp/a.png']);
    expect(generatedImagePaths(envelope(false, { images: [{ path: '/tmp/a.png' }] }))).toEqual([]);
    expect(generatedImagePaths('not json')).toEqual([]);
  });
});
