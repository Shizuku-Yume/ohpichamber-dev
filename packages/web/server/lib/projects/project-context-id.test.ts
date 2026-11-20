import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHostPromptDeliveryRuntime } from '../host/prompt-delivery-runtime.js';
import { createSessionKnowledgeRuntime } from '../session-knowledge/runtime.js';
import { createProjectIdFromPath } from './project-id.js';
import { resolveProjectContextId } from './project-context-id.js';

describe('project context directory resolution', () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'project-context-id-')));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('encodes the root path rather than the Git result record', async () => {
    execFileSync('git', ['init', '--quiet', directory]);
    const nested = path.join(directory, 'nested');
    fs.mkdirSync(nested);
    expect(await resolveProjectContextId(nested)).toBe(createProjectIdFromPath(directory));
  });

  it.each([null, undefined, ''])('skips an absent directory: %s', async (directory: string | null | undefined) => {
    expect(await resolveProjectContextId(directory)).toBeNull();
  });

  it('retains a non-repository directory', async () => {
    expect(await resolveProjectContextId(directory)).toBe(createProjectIdFromPath(directory));
  });

  it('retains the supplied path when Git cannot access the directory', async () => {
    const missing = path.join(directory, 'missing');
    expect(await resolveProjectContextId(missing)).toBe(createProjectIdFromPath(missing));
  });

  it('captures the first prompt with fresh metadata and no pins', async () => {
    execFileSync('git', ['init', '--quiet', directory]);
    const readContext = vi.fn(async () => ({ notes: [], plans: [] }));
    const sessionKnowledgeRuntime = createSessionKnowledgeRuntime({
      resolveProjectId: resolveProjectContextId,
      readSessionMetadata: async () => ({}),
      projectContextRuntime: { readContext },
    });
    const scope = { sessionId: 'session-new', rootSessionId: 'session-new', projectId: 'project-a', workspaceId: 'workspace-a', cwd: directory };
    const delivery = createHostPromptDeliveryRuntime({
      resolveSessionScope: async () => scope,
      routingRuntime: { resolveAutoSelection: async () => null },
      sessionKnowledgeRuntime,
      sessionRuntime: { markUserMessageSent: vi.fn() },
      scheduledTasksRuntime: undefined,
      behaviorPromptSource: undefined,
    });
    const request = {
      input: { text: 'first prompt', attachments: [], context: [] },
      options: { providerId: 'provider-a', modelId: 'model-a', agentId: null, variant: null, reasoningEffort: null },
    };
    expect(await delivery.capturePrompt(scope, request)).toEqual(request);
    expect(readContext).toHaveBeenCalledWith(createProjectIdFromPath(directory));
  });
});
