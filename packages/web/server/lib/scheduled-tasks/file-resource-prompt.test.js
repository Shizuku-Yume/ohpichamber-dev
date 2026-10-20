import { describe, expect, it, vi } from 'vitest';
import { createScheduledPromptExpander } from './file-resource-prompt.js';

const scope = { workspaceId: 'workspace', projectId: 'project', hostProjectId: 'host-project', cwd: '/repo', agentDirectoryId: 'agent-directory', agentDirectory: '/agent' };
const prompt = (text) => ({ input: { text, attachments: [], context: [{ kind: 'synthetic', text: 'captured context' }] },
  options: { providerId: 'selected-provider', modelId: 'selected-model', agentId: 'selected-agent', variant: 'high', reasoningEffort: 'high' } });
const setup = (result, resolveWorkspaceScope = vi.fn(async () => scope)) => {
  const service = { request: vi.fn(async () => Response.json(result)) };
  return { service, resolveWorkspaceScope, expand: createScheduledPromptExpander({ service, resolveWorkspaceScope }) };
};

describe('native scheduled prompt capture', () => {
  it('does no native catalog or worker work for ordinary text', async () => {
    const h = setup({ kind: 'text', content: 'unused' });
    const original = prompt('Explain #deploy and /deploy inline\n');
    expect(await h.expand(scope, original)).toEqual(original);
    expect(h.resolveWorkspaceScope).not.toHaveBeenCalled();
    expect(h.service.request).not.toHaveBeenCalled();
  });

  it.each(['command', 'template'])('captures %s content and bindings in one exact worker pipeline operation', async (kind) => {
    const h = setup({ kind, content: '/rendered-content-not-a-second-invocation\n',
      agentId: 'bound-agent', modelSelection: { providerId: 'bound-provider', modelId: 'bound-model' } });
    const text = '/deploy "release one"  two\n  trailing  ';
    const original = prompt(text);
    const captured = await h.expand(scope, original);
    expect(h.resolveWorkspaceScope).toHaveBeenCalledWith('workspace');
    expect(h.service.request).toHaveBeenCalledTimes(1);
    const [pathname, init] = h.service.request.mock.calls[0];
    expect(pathname).toBe('/api/agent/v1/workspaces/workspace/commands/expand-text');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ text });
    expect(captured.input).toEqual({ ...original.input, text: '/rendered-content-not-a-second-invocation\n' });
    expect(captured.options).toEqual({ providerId: 'bound-provider', modelId: 'bound-model', agentId: 'bound-agent', variant: 'high', reasoningEffort: 'high' });
    expect(original.input.text).toBe(text);
    expect(original.options.agentId).toBe('selected-agent');
  });

  it('preserves exact unmatched text and captured selection without speculative skill expansion', async () => {
    const text = '/skill-or-unknown "raw args"  ';
    const h = setup({ kind: 'text', content: text });
    const original = prompt(text);
    expect(await h.expand(scope, original)).toEqual(original);
    expect(h.service.request).toHaveBeenCalledTimes(1);
  });

  it('keeps the captured selection when an expanded template has no bindings', async () => {
    const h = setup({ kind: 'template', content: '# Markdown\n\n  body\n' });
    expect((await h.expand(scope, prompt('/deploy'))).options).toEqual(prompt('').options);
  });

  it.each(['workspaceId', 'projectId', 'hostProjectId', 'cwd', 'agentDirectoryId', 'agentDirectory'])('rejects a changed %s before private worker forwarding', async (field) => {
    const h = setup({ kind: 'template', content: 'must not leak' }, vi.fn(async () => ({ ...scope, [field]: 'different' })));
    await expect(h.expand(scope, prompt('/deploy'))).rejects.toMatchObject({ statusCode: 403 });
    expect(h.service.request).not.toHaveBeenCalled();
  });

  it('refuses unavailable workspace scope instead of using a path or ambient agent', async () => {
    const h = setup({ kind: 'text', content: '' }, vi.fn(async () => null));
    await expect(h.expand(scope, prompt('/deploy'))).rejects.toMatchObject({ statusCode: 403 });
    expect(h.service.request).not.toHaveBeenCalled();
  });

  it('propagates canonical worker refusal rather than queueing the original invocation', async () => {
    const h = setup({ kind: 'text', content: '' });
    h.service.request.mockResolvedValue(Response.json({ type: 'urn:problem:SERVICE_UNAVAILABLE', title: 'Unavailable', status: 503,
      code: 'SERVICE_UNAVAILABLE', detail: 'Worker could not expand the native prompt', retryable: true }, { status: 503 }));
    await expect(h.expand(scope, prompt('/deploy'))).rejects.toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: 'Worker could not expand the native prompt' });
  });

  it('rejects malformed successful responses rather than inventing an empty prompt', async () => {
    const h = setup({ content: 'missing native result discriminator' });
    await expect(h.expand(scope, prompt('/deploy'))).rejects.toThrow();
  });
});
