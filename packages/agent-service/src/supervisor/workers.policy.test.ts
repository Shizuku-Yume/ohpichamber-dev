import { afterAll, beforeAll, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HostWorkspacePolicySchema, type HostAuthorizationScope, type NativeOperationDescriptor, type WorkerPolicyRequest } from '@openchamber/agent-service/private-protocol';
import type { JsonObject } from '@openchamber/agent-contract';
import { createProjectDirectoryRuntime } from '../../../web/server/lib/host/project-directory-runtime.js';
import { createWorkerOperationAuthorizer } from '../../../web/server/lib/host/worker-operation-authorizer.js';
import { describeNativeOperation } from '../worker/native-policy-descriptor.ts';

/**
 * The supervisor describes a native tool call and hands the descriptor to the
 * Host authorizer. Plan mode drafts its plan file into OMP's `local://` sandbox,
 * so that write target must survive both steps, while a real filesystem write
 * outside the workspace stays refused exactly as before.
 */

const rootSessionId = 'policy-root';
const workerGeneration = 'policy-generation';
const projectId = 'policy-project';
const workspaceId = 'policy-workspace';
const agentDirectoryId = 'policy-agent-directory';
let environmentRoot = '';
let cwd = '';
let agentDirectory = '';
let outside = '';

const makeAuthorizer = (fileTools: string[]) => {
  const policy = HostWorkspacePolicySchema.parse({
    projectId, workspaceId, agentDirectoryId, cwd, agentDirectory,
    providers: [], mcpServers: [], fileTools, shellCommands: [], agentIds: [], providerEntry: true,
  });
  const scope: HostAuthorizationScope = { rootSessionId, workerGeneration, projectId, workspaceId, agentDirectoryId, cwd, agentDirectory };
  const directoryOwner = createProjectDirectoryRuntime({ fsPromises: fs, path, normalizeDirectoryPath: (value: string) => value });
  const authorize = createWorkerOperationAuthorizer({
    resolvePolicy: async () => policy,
    validateDirectoryPath: directoryOwner.validateDirectoryPath,
    approvalPolicyStore: { list: () => [] },
    enterprisePolicyOptions: { env: {}, readFile: () => { throw Object.assign(new Error('Absent policy'), { code: 'ENOENT' }); } },
  });
  return (request: WorkerPolicyRequest, descriptor: NativeOperationDescriptor | undefined) => authorize(scope, request, descriptor);
};

/** The supervisor's own path: describe the native call, then authorize that descriptor. */
const describeAndAuthorize = async (toolName: 'write' | 'edit', input: JsonObject, fileTools: string[]) => {
  const request: WorkerPolicyRequest = { type: 'tool', toolName, input };
  const descriptor = await describeNativeOperation(cwd, request, { editMode: 'replace', declaredTier: 'write' });
  if (descriptor === undefined) throw new Error(`The native descriptor builder returned nothing for ${toolName}`);
  return { descriptor, decision: await makeAuthorizer(fileTools)(request, descriptor) };
};

beforeAll(async () => {
  environmentRoot = await mkdtemp(path.join(tmpdir(), 'workers-policy-'));
  for (const [name, assign] of [['workspace', (value: string) => { cwd = value; }], ['agent', (value: string) => { agentDirectory = value; }], ['outside', (value: string) => { outside = value; }]] as const) {
    const directory = path.join(environmentRoot, name);
    await mkdir(directory, { recursive: true });
    assign(await fs.realpath(directory));
  }
});

afterAll(async () => {
  if (environmentRoot.length > 0) await rm(environmentRoot, { recursive: true, force: true });
  environmentRoot = '';
});

test('Plan mode may write its local:// plan artifact through the Host authorizer', async () => {
  const { descriptor, decision } = await describeAndAuthorize('write', { path: 'local://add-helper-plan.md', content: '# Plan' }, ['read', 'write']);
  expect(descriptor.destinationPaths).toEqual([]);
  expect(descriptor.internalWriteUrls).toEqual(['local://add-helper-plan.md']);
  expect(decision).toEqual({ allowed: true });
  // A descriptor without the write URL still names no destination: the old refusal holds.
  expect(await makeAuthorizer(['read', 'write'])(
    { type: 'tool', toolName: 'write', input: { path: 'local://add-helper-plan.md', content: '# Plan' } },
    { ...descriptor, internalWriteUrls: undefined },
  )).toMatchObject({ allowed: false, code: 'UNAUTHORIZED', status: 403, detail: 'The write tool names no writable destination' });
});

test('A real filesystem write inside the workspace stays allowed and outside stays refused', async () => {
  const inside = await describeAndAuthorize('write', { path: 'src/created.ts', content: 'x' }, ['read', 'write']);
  expect(inside.descriptor.destinationPaths).toEqual([path.join(cwd, 'src', 'created.ts')]);
  expect(inside.descriptor.internalWriteUrls).toBeUndefined();
  expect(inside.decision).toEqual({ allowed: true });

  const escaping = await describeAndAuthorize('write', { path: path.join(outside, 'outside.txt'), content: 'x' }, ['read', 'write']);
  expect(escaping.decision).toMatchObject({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
  expect(escaping.decision).not.toHaveProperty('approvalRequired');
});

test('The local:// write capability follows the workspace file-write grant', async () => {
  const { descriptor, decision } = await describeAndAuthorize('write', { path: 'local://plan.md', content: 'x' }, ['read']);
  expect(descriptor.internalWriteUrls).toEqual(['local://plan.md']);
  expect(decision).toMatchObject({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
});

test('Non-local internal URLs and removed artifact URLs stay refused for a write', async () => {
  for (const target of ['agent://native', 'history://native', 'artifact://3', 'xd://memory', 'skill://flow-start']) {
    await expect(describeAndAuthorize('write', { path: target, content: 'x' }, ['read', 'write']))
      .rejects.toThrow('separate Host capability');
  }
});

test('The write URL capability belongs to `write` alone', async () => {
  const { descriptor } = await describeAndAuthorize('write', { path: 'local://plan.md', content: 'x' }, ['read', 'write']);
  const request: WorkerPolicyRequest = { type: 'tool', toolName: 'edit', input: { path: 'local://plan.md', old_string: 'a', new_string: 'b' } };
  const decision = await makeAuthorizer(['read', 'write'])(request, { ...descriptor, toolName: 'edit', effectiveMode: 'replace' });
  expect(decision).toMatchObject({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
});
