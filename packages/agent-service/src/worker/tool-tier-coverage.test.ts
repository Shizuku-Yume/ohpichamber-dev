import { afterAll, beforeAll, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { z } from 'zod';
import { JsonObjectSchema, type JsonObject, type MCPServerConfig, type MCPConfigurationState } from '@openchamber/agent-contract';
import {
  NativeOperationDescriptorSchema as HostNativeOperationDescriptorSchema,
  type HostAuthorizationScope, type HostWorkspacePolicy, type WorkerPolicyRequest,
} from '@openchamber/agent-service/private-protocol';
import { resetSettingsForTest } from '@oh-my-pi/pi-coding-agent/config/settings';
import { __resetDirsFromEnvForTests } from '@oh-my-pi/pi-utils';
import { NativeOperationDescriptorSchema, type NativeOperationDescriptor, type NativeToolTier } from '../native-policy-protocol.ts';
import { createProjectDirectoryRuntime } from '../../../web/server/lib/projects/project-directory-runtime.ts';
import { createWorkerOperationAuthorizer } from '../../../web/server/lib/host/worker-operation-authorizer.js';
import { describeNativeOperation } from './native-policy-descriptor.ts';
import { WorkerSession } from './session.ts';
import { resolveDeclaredTier } from './tool-tier.ts';

// The Host authorizer resolves its protocol schemas through the agent-service
// build output, exactly as the Supervisor's child does, so `dist/` has to be
// rebuilt after a protocol change: `bun run --cwd packages/agent-service build`.
// The preflight below turns a stale build into that instruction instead of a
// wall of protocol mismatch failures.
//
// This suite answers the one question the old `BUILTIN_TOOL_NAMES` loop could
// not: does the Host have a rule for **every tool a live worker can offer**,
// including ephemeral (vibe), MCP and extension tools? It boots a real worker,
// enumerates the live registry in each session mode, resolves each tool's own
// declared tier and asks the real Host authorizer to decide.

const rootSessionId = 'tier-coverage-root';
const workerGeneration = 'tier-coverage-generation';
const projectId = 'tier-coverage-project';
const workspaceId = 'tier-coverage-workspace';
const agentDirectoryId = 'tier-coverage-agent-directory';
const MCP_SERVER_ID = 'tier-probe';
const WRITE_TIER_EXTENSION_TOOL = 'native_tier_write_probe';
const DYNAMIC_TIER_EXTENSION_TOOL = 'native_tier_dynamic_probe';
type ModeKind = 'main' | 'plan' | 'vibe';

const directoryEnvironmentKeys = ['HOME', 'USERPROFILE', 'PI_CONFIG_DIR', 'PI_CODING_AGENT_DIR', 'OMP_PROFILE', 'PI_PROFILE', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_CACHE_HOME'] as const;

/**
 * An extension factory registers one statically-declared write tool and one
 * tool whose tier depends on its arguments — the two forms the Host must
 * classify without knowing the tool's name. Extension tools are also the
 * generic proof that a name the Host has never seen cannot fall through.
 */
const tierProbeExtension = `export default api => {
  api.registerTool({
    name: ${JSON.stringify(WRITE_TIER_EXTENSION_TOOL)}, label: 'Tier write probe',
    description: 'Declares a static write tier.',
    parameters: { type: 'object', properties: {}, required: [] }, approval: 'write',
    execute: async () => ({ content: [{ type: 'text', text: 'write tier probe' }], details: {} }),
  });
  api.registerTool({
    name: ${JSON.stringify(DYNAMIC_TIER_EXTENSION_TOOL)}, label: 'Tier dynamic probe',
    description: 'Declares a tier from its arguments.',
    parameters: { type: 'object', properties: { mode: { type: 'string' } }, required: [] },
    approval: args => args?.mode === 'exec' ? 'exec' : 'read',
    execute: async () => ({ content: [{ type: 'text', text: 'dynamic tier probe' }], details: {} }),
  });
};`;

/** The Host authorizer is plain JS; its decision is decoded before assertions. */
const AuthorizerDecisionSchema = z.object({
  allowed: z.boolean(),
  code: z.string().optional(),
  status: z.number().optional(),
  detail: z.string().optional(),
  approvalRequired: z.literal(true).optional(),
});
type AuthorizerDecision = z.infer<typeof AuthorizerDecisionSchema>;

type ToolDecision = {
  toolName: string;
  declaredTier: NativeToolTier;
  descriptor: NativeOperationDescriptor;
  decision: AuthorizerDecision;
};
type ModeAudit = { mode: ModeKind; names: string[]; enabled: string[]; decisions: ToolDecision[] };

type Harness = {
  worker: WorkerSession;
  cwd: string;
  /** A directory beside the workspace: a real path the Host must refuse for a write. */
  outside: string;
  scope: HostAuthorizationScope;
  authorize: (request: WorkerPolicyRequest, descriptor: NativeOperationDescriptor) => Promise<AuthorizerDecision>;
};

const previousEnvironment: Array<readonly [string, string | undefined]> = [];
let environmentRoot = '';
let stopMcpEndpoint: (() => void) | undefined;
let harness: Harness | undefined;

function requireHarness(): Harness {
  if (harness === undefined) throw new Error('The tier coverage worker harness is not open');
  return harness;
}

/**
 * In-workspace arguments each tool can be described and authorized from. Every
 * file tool names an existing source inside `cwd` and writes only inside it, so
 * a `read`/`write` refusal would mean a real policy gap rather than a fixture
 * mistake. Unknown tools (MCP, extension, autoresearch) take `{}` like a
 * no-argument call.
 */
function representativeInput(toolName: string): JsonObject {
  switch (toolName) {
    case 'read': return { path: 'src/source.ts' };
    case 'write': return { path: 'src/created.ts', content: 'created by the tier coverage suite' };
    case 'edit': return { path: 'src/source.ts', old_string: 'source', new_string: 'updated' };
    case 'grep': return { path: 'src', pattern: 'source' };
    case 'glob': return { path: 'src/*.ts' };
    case 'bash': return { command: 'printf tier-coverage' };
    case 'lsp': return { action: 'diagnostics', file: 'src/source.ts' };
    case 'ast_grep': return { path: 'src/*.ts', pattern: 'source' };
    case 'ast_edit': return { paths: ['src/*.ts'], ops: [{ pat: 'source', out: 'updated' }] };
    case 'debug': return { action: 'threads' };
    case 'goal': return { op: 'get' };
    case 'task': return { name: 'tier-coverage-child', prompt: 'Summarize the workspace.' };
    case DYNAMIC_TIER_EXTENSION_TOOL: return { mode: 'read' };
    default: return {};
  }
}

/**
 * A non-isolated delegation re-enters this authorizer for every child call, so
 * it grants no capability itself.
 */
const ALLOWED_DESPITE_EXEC_TIER = { task: true } satisfies Record<string, true>;
/** MCP tools declare a write tier but carry no Host-readable destination, so the Host still asks. */
const APPROVAL_DESPITE_WRITE_TIER_PREFIX = 'mcp__';
/**
 * Tools whose write tier is the Host's own argument-aware reading rather than
 * the tool's declaration. They are allowed because the Host knows what they
 * write; `write`/`edit` still pass their destination guard first.
 */
const HOST_WRITE_TIER_TOOLS: readonly string[] = ['write', 'edit', 'ast_edit', 'generate_image'];
/** Argument-aware memory write tiers: the Host decides which branch each call takes. */
const ARG_AWARE_WRITE_TIER_TOOLS: readonly string[] = ['context_notes', 'retain', 'learn'];
/** The descriptor's destinations are the only thing the Host can check for containment. */
const hasCheckableDestination = (descriptor: NativeOperationDescriptor): boolean =>
  descriptor.destinationPaths.length > 0 || descriptor.fileOps.length > 0;

async function bootHarness(): Promise<void> {
  resetSettingsForTest();
  for (const key of directoryEnvironmentKeys) {
    previousEnvironment.push([key, process.env[key]] as const);
    delete process.env[key];
  }
  environmentRoot = await mkdtemp(path.join(tmpdir(), 'tier-coverage-'));
  process.env.HOME = environmentRoot;
  process.env.USERPROFILE = environmentRoot;
  process.env.PI_CONFIG_DIR = '.omp';
  process.env.XDG_DATA_HOME = path.join(environmentRoot, 'data');
  process.env.XDG_STATE_HOME = path.join(environmentRoot, 'state');
  process.env.XDG_CACHE_HOME = path.join(environmentRoot, 'cache');
  __resetDirsFromEnvForTests();

  const workspace = path.join(environmentRoot, 'workspace');
  const agentDirectory = path.join(environmentRoot, 'agent');
  await mkdir(path.join(workspace, '.omp', 'extensions'), { recursive: true });
  await mkdir(path.join(workspace, 'src'), { recursive: true });
  await mkdir(agentDirectory, { recursive: true });
  // A real file outside the workspace: the containment check must refuse it.
  await mkdir(path.join(environmentRoot, 'outside'), { recursive: true });
  await writeFile(path.join(environmentRoot, 'outside', 'outside.txt'), 'outside\n');
  await writeFile(path.join(workspace, 'src', 'source.ts'), 'source\n');
  await writeFile(path.join(workspace, '.omp', 'extensions', 'tier-probe.ts'), tierProbeExtension);

  // A loopback MCP server keeps the MCP tool real without any external process.
  const mcpEndpoint = Bun.serve({
    hostname: '127.0.0.1', port: 0, async fetch(request) {
      if (request.method === 'GET') return new Response(null, { status: 405 });
      if (request.method === 'DELETE') return new Response(null, { status: 204 });
      const message = z.object({
        id: z.union([z.number(), z.string()]).optional(),
        method: z.string(),
        params: z.object({ protocolVersion: z.string().optional() }).optional(),
      }).parse(await request.json());
      if (message.id === undefined) return new Response(null, { status: 202 });
      if (message.method === 'initialize') {
        return Response.json({
          jsonrpc: '2.0', id: message.id, result: {
            protocolVersion: message.params?.protocolVersion ?? '2024-11-05',
            capabilities: { tools: {} }, serverInfo: { name: MCP_SERVER_ID, version: '1' },
          }
        });
      }
      return Response.json({
        jsonrpc: '2.0', id: message.id, result: {
          tools: [{ name: 'probe_tool', description: 'Tier coverage probe tool', inputSchema: { type: 'object', properties: {} } }],
        }
      });
    },
  });
  stopMcpEndpoint = () => { mcpEndpoint.stop(true); };
  const mcpServer: MCPServerConfig = {
    serverId: MCP_SERVER_ID, label: 'Tier probe', enabled: true, scope: 'project',
    transport: { type: 'http', url: mcpEndpoint.url.href },
  };
  const mcpConfiguration: MCPConfigurationState = {
    workspaceId, persistedRevision: '0', config: { servers: [mcpServer] },
  };

  const session = await WorkerSession.open({
    type: 'bootstrap', rootSessionId, workerGeneration, projectId, workspaceId, agentDirectoryId,
    cwd: workspace, agentDirectory, mcpConfigPath: path.join(agentDirectory, 'mcp.json'), mcpConfiguration,
    sessionsDirectory: path.join(environmentRoot, 'sessions'),
  }, () => { }, () => { throw new Error('The tier coverage audit opens no interaction'); },
    () => { throw new Error('The tier coverage worker must stay healthy'); },
    // Bootstrap only: the catalog configuration and the loopback MCP server
    // install their own policy requests. Every audited decision reaches the
    // real authorizer through `harness.authorize`, never this callback.
    async request => {
      if (request.type === 'mcp-server' || request.type === 'provider-entry') return;
      if (request.type === 'tool' && request.toolName === 'provider.use') return;
      throw new Error(`The tier coverage bootstrap sent an unexpected policy request: ${request.type}`);
    },
    async () => { throw new Error('The tier coverage audit invokes no Host action'); }, () => { }, () => { });

  try {
    await session.mcpStartup;
    // Offline provider and model catalogs: plan mode resolves its role model.
    const providerId = 'tier-coverage-fixture';
    await session.operation({
      type: 'catalog', revision: '1', operation: {
        type: 'catalog.provider.configure', request: {
          expectedRevision: '0', configuration: {
            providerId, name: 'Tier coverage fixture', endpoint: 'http://127.0.0.1:9/v1',
            protocol: 'chat-completions', credentialRef: null,
          }
        }
      }
    });
    for (const [revision, expectedRevision, modelId] of [['2', '1', 'tier-coverage-model'], ['3', '2', 'tier-coverage-plan-model']] as const) {
      await session.operation({
        type: 'catalog', revision, operation: {
          type: 'catalog.model.configure', request: {
            expectedRevision, model: {
              modelId, provider: providerId, name: modelId, modalities: ['text'], contextWindow: 65536, maxOutputTokens: 128,
              reasoningEffortSupported: false, reasoningOptions: [], variants: [], toolsSupported: true, enabled: true, pricing: null,
            }
          }
        }
      });
    }
    session.session.settings.setModelRole('plan', `${providerId}/tier-coverage-plan-model`);
    await session.session.settings.flush();
    const initialModel = session.session.modelRegistry.find(providerId, 'tier-coverage-model');
    if (!initialModel) throw new Error('The tier coverage fixture model is unavailable');
    await session.session.setModelTemporary(initialModel);

    const cwd = await fs.realpath(workspace);
    const realAgentDirectory = await fs.realpath(agentDirectory);
    const policy: HostWorkspacePolicy = {
      projectId, workspaceId, agentDirectoryId, cwd, agentDirectory: realAgentDirectory,
      providers: [], imageProviders: [], mcpServers: [mcpServer], fileTools: ['read', 'write'],
      shellCommands: [], agentIds: [], providerEntry: true,
    };
    const scope: HostAuthorizationScope = {
      rootSessionId, workerGeneration, projectId, workspaceId, agentDirectoryId, cwd, agentDirectory: realAgentDirectory,
    };
    const directoryOwner = createProjectDirectoryRuntime({
      fsPromises: fs, path, normalizeDirectoryPath: (value: string) => value,
    });
    const hostAuthorize = createWorkerOperationAuthorizer({
      resolvePolicy: async () => policy,
      validateDirectoryPath: directoryOwner.validateDirectoryPath,
      approvalPolicyStore: { list: () => [] },
      // No administrator policy on this machine decides the test's outcome.
      enterprisePolicyOptions: {
        env: {},
        readFile: () => { throw Object.assign(new Error('Absent policy'), { code: 'ENOENT' }); },
      },
    });
    const hostSchemaAcceptsTier = HostNativeOperationDescriptorSchema.safeParse({
      toolName: 'read', sourcePaths: [cwd], destinationPaths: [], fileOps: [], declaredTier: 'read',
    }).success;
    if (!hostSchemaAcceptsTier) {
      throw new Error('The Host protocol build is stale and drops declaredTier; run `bun run --cwd packages/agent-service build`');
    }
    harness = {
      worker: session, cwd, outside: await fs.realpath(path.join(environmentRoot, 'outside')), scope,
      authorize: async (request, descriptor) => AuthorizerDecisionSchema.parse(await hostAuthorize(scope, request, descriptor)),
    };
  } catch (error) {
    await session.close();
    throw error;
  }
}

/** Opens one session mode, enumerates the live registry and authorizes every tool in it. */
async function auditMode(mode: ModeKind): Promise<ModeAudit> {
  const { worker, cwd, authorize } = requireHarness();
  await worker.operation({ type: 'mode.set', mode });
  const names = worker.session.getAllToolNames().sort();
  const enabled = worker.session.getEnabledToolNames();
  const decisions: ToolDecision[] = [];
  for (const toolName of names) {
    const declaredTier = resolveDeclaredTier(worker.session, toolName, representativeInput(toolName));
    // The worker sends a plain-JSON copy of the call's input over IPC. Reusing
    // the object an OMP approval function inspected would carry the symbol keys
    // it attaches, which no real policy.request ever contains.
    const input = JsonObjectSchema.parse(JSON.parse(JSON.stringify(representativeInput(toolName))));
    const request: WorkerPolicyRequest = { type: 'tool', toolName, input };
    const descriptor = await describeNativeOperation(cwd, request, { editMode: 'replace', declaredTier });
    if (descriptor === undefined) throw new Error(`The native descriptor builder returned nothing for ${toolName}`);
    // The Host reads the tier off the descriptor, so a schema that dropped it
    // would silently downgrade every unknown tool to exec.
    expect(descriptor.declaredTier).toBe(declaredTier);
    decisions.push({ toolName, declaredTier, descriptor, decision: await authorize(request, descriptor) });
  }
  return { mode, names, enabled, decisions };
}

function decisionFor(audit: ModeAudit, toolName: string): AuthorizerDecision {
  const found = audit.decisions.find(row => row.toolName === toolName);
  if (found === undefined) throw new Error(`${toolName} is not registered in ${audit.mode} mode`);
  return found.decision;
}

/** Every decision either allows, or asks for approval with a reason; no tool falls off the rules. */
function expectNoBareDeny(audit: ModeAudit): void {
  const bareDenials = audit.decisions
    .filter(row => !row.decision.allowed && row.decision.approvalRequired !== true)
    .map(row => `${row.toolName}: ${row.decision.detail ?? 'no detail'}`);
  expect(bareDenials).toEqual([]);
  for (const row of audit.decisions) {
    if (row.decision.allowed) continue;
    expect(row.decision.detail?.length ?? 0).toBeGreaterThan(0);
  }
}

/**
 * Each decision follows the tier the tool declared for these arguments. A write
 * tier is only actionable when the descriptor names a destination the Host can
 * check; a declared write with nothing to check is an approval card, never a
 * silent allow.
 */
function expectMatchesDeclaredTier(audit: ModeAudit): void {
  for (const row of audit.decisions) {
    const { toolName, declaredTier, descriptor, decision } = row;
    if (declaredTier === 'read') {
      expect({ toolName, decision }).toEqual({ toolName, decision: { allowed: true } });
      continue;
    }
    if (declaredTier === 'write') {
      // MCP first: the MCP branch classifies before any tier is consulted.
      if (toolName.startsWith(APPROVAL_DESPITE_WRITE_TIER_PREFIX)) {
        expect({ toolName, decision }).toEqual({ toolName, decision: expect.objectContaining({ allowed: false, approvalRequired: true }) });
        continue;
      }
      // The Host's own write-tier readings are allowed as before.
      if (HOST_WRITE_TIER_TOOLS.includes(toolName) || ARG_AWARE_WRITE_TIER_TOOLS.includes(toolName)) {
        expect({ toolName, decision }).toEqual({ toolName, decision: { allowed: true } });
        continue;
      }
      // Everything else: a checkable in-workspace destination is the permission.
      if (hasCheckableDestination(descriptor)) {
        expect({ toolName, decision }).toEqual({ toolName, decision: { allowed: true } });
        continue;
      }
      expect({ toolName, decision }).toEqual({ toolName, decision: expect.objectContaining({ allowed: false, approvalRequired: true }) });
      continue;
    }
    if (ALLOWED_DESPITE_EXEC_TIER[toolName] === true) {
      expect({ toolName, decision }).toEqual({ toolName, decision: { allowed: true } });
      continue;
    }
    expect({ toolName, decision }).toEqual({ toolName, decision: expect.objectContaining({ allowed: false, approvalRequired: true }) });
  }
}

function expectFixtureToolsRegistered(audit: ModeAudit): void {
  const mcpTools = audit.names.filter(name => name.startsWith(APPROVAL_DESPITE_WRITE_TIER_PREFIX));
  expect(mcpTools).toHaveLength(1);
  expect(audit.names).toEqual(expect.arrayContaining([WRITE_TIER_EXTENSION_TOOL, DYNAMIC_TIER_EXTENSION_TOOL]));
  // An empty or builtins-only registry must fail loudly instead of passing.
  expect(audit.names.length).toBeGreaterThanOrEqual(25);
}

beforeAll(async () => { await bootHarness(); }, 30_000);

afterAll(async () => {
  await harness?.worker.close();
  harness = undefined;
  stopMcpEndpoint?.();
  stopMcpEndpoint = undefined;
  resetSettingsForTest();
  for (const [key, value] of previousEnvironment.splice(0)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  __resetDirsFromEnvForTests();
  if (environmentRoot.length > 0) await rm(environmentRoot, { recursive: true, force: true });
  environmentRoot = '';
});

test('main mode authorizes every registered builtin, MCP and extension tool', async () => {
  const audit = await auditMode('main');
  expect(audit.names).toEqual(expect.arrayContaining(['bash', 'write', 'edit', 'read']));
  expect(audit.names).not.toContain('vibe_spawn');
  expect(audit.enabled).toContain('bash');
  expectFixtureToolsRegistered(audit);
  expectNoBareDeny(audit);
  expectMatchesDeclaredTier(audit);
  // The live toolset shows the tiers the Host used to guess from its name lists.
  expect(decisionFor(audit, 'read')).toEqual({ allowed: true });
  expect(decisionFor(audit, 'write')).toEqual({ allowed: true });
  expect(decisionFor(audit, 'edit')).toEqual({ allowed: true });
  expect(decisionFor(audit, 'bash')).toMatchObject({ allowed: false, approvalRequired: true });
  expect(decisionFor(audit, 'eval')).toMatchObject({ allowed: false, approvalRequired: true });
  // A tool that declares no approval at all fails closed to an approval prompt.
  expect(decisionFor(audit, 'run_experiment')).toMatchObject({ allowed: false, approvalRequired: true });
  // A declared write with no destination the Host can check is an approval card.
  expect(decisionFor(audit, WRITE_TIER_EXTENSION_TOOL)).toMatchObject({ allowed: false, approvalRequired: true });
  expect(decisionFor(audit, DYNAMIC_TIER_EXTENSION_TOOL)).toEqual({ allowed: true });
}, 30_000);

test('plan mode authorizes every registered tool the same way', async () => {
  const audit = await auditMode('plan');
  expect(audit.names).toEqual(expect.arrayContaining(['bash', 'write', 'edit', 'read']));
  expectFixtureToolsRegistered(audit);
  expectNoBareDeny(audit);
  expectMatchesDeclaredTier(audit);
}, 30_000);

test('vibe mode authorizes its ephemeral tools instead of falling through', async () => {
  const audit = await auditMode('vibe');
  expect(audit.names).toEqual(expect.arrayContaining(['vibe_spawn', 'vibe_send', 'vibe_wait', 'vibe_kill', 'vibe_list']));
  // The mode's whole point is the ephemeral set: an empty registry must fail.
  expect(audit.enabled).toContain('vibe_spawn');
  expect(audit.enabled).toContain('vibe_list');
  expect(audit.enabled).not.toContain('bash');
  const main = await auditMode('main');
  expect(audit.names.length).toBeGreaterThan(main.names.length);
  expectFixtureToolsRegistered(audit);
  expectNoBareDeny(audit);
  expectMatchesDeclaredTier(audit);
  // The observed production failure: an exec-tier spawn is a prompt, never a refusal.
  expect(decisionFor(audit, 'vibe_spawn')).toMatchObject({ allowed: false, approvalRequired: true });
  expect(decisionFor(audit, 'vibe_send')).toMatchObject({ allowed: false, approvalRequired: true });
  for (const toolName of ['vibe_wait', 'vibe_kill', 'vibe_list']) {
    expect({ toolName, decision: decisionFor(audit, toolName) }).toEqual({ toolName, decision: { allowed: true } });
  }
}, 30_000);

/**
 * The extension probe declares `approval: 'write'` for every call, so the Host's
 * only remaining question is whether the descriptor names a destination it can
 * check. These three cases are that question answered three ways.
 */
function extensionWriteDescriptor(destinationPaths: string[], fileOps: NativeOperationDescriptor['fileOps'] = []): NativeOperationDescriptor {
  return NativeOperationDescriptorSchema.parse({
    toolName: WRITE_TIER_EXTENSION_TOOL, sourcePaths: [], destinationPaths, fileOps, declaredTier: 'write',
  });
}

test('a declared write is allowed inside the workspace and refused outside it', async () => {
  const { worker, cwd, outside, authorize } = requireHarness();
  await worker.operation({ type: 'mode.set', mode: 'main' });
  const input: JsonObject = {};
  expect(resolveDeclaredTier(worker.session, WRITE_TIER_EXTENSION_TOOL, input)).toBe('write');

  // No destination the Host can check: the user must see the call.
  expect(await authorize({ type: 'tool', toolName: WRITE_TIER_EXTENSION_TOOL, input }, extensionWriteDescriptor([]))).toMatchObject({
    allowed: false, code: 'UNAUTHORIZED', status: 403, approvalRequired: true,
    detail: `The ${WRITE_TIER_EXTENSION_TOOL} tool declares a file write but names no destination the Host can check, so it requires approval`,
  });

  // An in-workspace destination is the permission: the declared write goes through.
  const inside = path.join(cwd, 'src', 'created.ts');
  expect(await authorize(
    { type: 'tool', toolName: WRITE_TIER_EXTENSION_TOOL, input },
    extensionWriteDescriptor([inside], [{ kind: 'write', path: inside }]),
  )).toEqual({ allowed: true });

  // A destination outside the workspace is a hard denial with no approval path,
  // even though the tool declares a write tier the workspace would grant.
  const outsideFile = path.join(outside, 'outside.txt');
  const escaping = await authorize(
    { type: 'tool', toolName: WRITE_TIER_EXTENSION_TOOL, input },
    extensionWriteDescriptor([outsideFile], [{ kind: 'write', path: outsideFile }]),
  );
  expect(escaping).toMatchObject({
    allowed: false, code: 'UNAUTHORIZED', status: 403,
    detail: `The ${WRITE_TIER_EXTENSION_TOOL} tool targets a path outside the authorized workspace`,
  });
  // Not a card: an approval grant cannot widen the workspace.
  expect(escaping.approvalRequired).toBeUndefined();
}, 30_000);

test('a rename destination outside the workspace is a hard denial too', async () => {
  const { cwd, outside, authorize } = requireHarness();
  // The fileOps destination is checked even when destinationPaths is empty, so a
  // rename cannot carry the write out of the tree.
  const insideDir = path.join(cwd, 'src');
  expect(await authorize(
    { type: 'tool', toolName: WRITE_TIER_EXTENSION_TOOL, input: {} },
    extensionWriteDescriptor([], [{ kind: 'rename', path: path.join(insideDir, 'source.ts'), to: path.join(outside, 'moved.ts') }]),
  )).toMatchObject({
    allowed: false, code: 'UNAUTHORIZED', status: 403,
    detail: `The ${WRITE_TIER_EXTENSION_TOOL} tool targets a path outside the authorized workspace`,
  });
}, 30_000);

test('an MCP server outside the workspace configuration is a named hard denial, not a bare one', async () => {
  const { cwd, authorize } = requireHarness();
  const toolName = 'mcp__absent_server_probe_tool';
  const request: WorkerPolicyRequest = { type: 'tool', toolName, input: {} };
  const descriptor = await describeNativeOperation(cwd, request, { editMode: 'replace', declaredTier: 'write' });
  if (descriptor === undefined) throw new Error('The native descriptor builder returned nothing for the unconfigured MCP tool');
  // The only unconditioned refusal left: the workspace never configured that
  // server. It is a named hard denial, not the old unnamed policy fall-through.
  const decision = await authorize(request, descriptor);
  expect(decision).toMatchObject({ allowed: false, code: 'UNAUTHORIZED', status: 403 });
  expect(decision.approvalRequired).toBeUndefined();
  expect(decision.detail).toMatch(new RegExp(`^The ${toolName} tool .*MCP server`));
}, 30_000);

test('an argument-dependent extension tier decides the Host decision', async () => {
  const { worker, cwd, authorize } = requireHarness();
  await worker.operation({ type: 'mode.set', mode: 'main' });
  const input: JsonObject = { mode: 'exec' };
  expect(resolveDeclaredTier(worker.session, DYNAMIC_TIER_EXTENSION_TOOL, input)).toBe('exec');
  const request: WorkerPolicyRequest = { type: 'tool', toolName: DYNAMIC_TIER_EXTENSION_TOOL, input };
  const descriptor = await describeNativeOperation(cwd, request, { editMode: 'replace', declaredTier: 'exec' });
  if (descriptor === undefined) throw new Error('The native descriptor builder returned nothing for the dynamic extension tool');
  expect(await authorize(request, descriptor)).toMatchObject({ allowed: false, approvalRequired: true });
}, 30_000);

test('OMP 19 browser launch options and malformed options cannot bypass Host execution consent', async () => {
  const { worker, cwd, authorize } = requireHarness();
  await worker.operation({ type: 'mode.set', mode: 'main' });
  const inputs: JsonObject[] = [
    { action: 'open', app: '/browser', argv: ['--private'], target: 'new-tab', insecure: true },
    { action: 'open', app: {}, argv: 'malformed', target: [], insecure: 'malformed' },
    {},
  ];
  for (const input of inputs) {
    const request: WorkerPolicyRequest = { type: 'tool', toolName: 'browser', input };
    const declaredTier = resolveDeclaredTier(worker.session, 'browser', input);
    expect(declaredTier).toBe('exec');
    const descriptor = await describeNativeOperation(cwd, request, { editMode: 'replace', declaredTier });
    if (!descriptor) throw new Error('Browser descriptor is required');
    expect(await authorize(request, descriptor)).toMatchObject({ allowed: false, approvalRequired: true });
  }
}, 30_000);
