<<<<<<< HEAD
import { describe, expect, test } from "bun:test"
import type { CanonicalEvent, CatalogUpdate, SessionSnapshot } from "@openchamber/agent-contract"
import { applyDirectoryEvent, installSessionSnapshot } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"
||||||| bc50ba56aa
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { Project } from '@/lib/opencode/model';
import { opencodeClient } from '@/lib/opencode/client';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import { useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { ChildStoreManager } from './child-store';
import { useGlobalSyncStore } from './global-sync-store';
import { createEventRoutingIndex, handleEvent } from './sync-context';
=======
import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from 'bun:test';
import type { Project } from '@/lib/opencode/model';
import { opencodeClient } from '@/lib/opencode/client';
import { getRuntimeApiBaseUrl, getRuntimeKey, switchRuntimeEndpoint } from '@/lib/runtime-switch';
import { useAgentsStore } from '@/stores/useAgentsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useCommandsStore } from '@/stores/useCommandsStore';
import { useSkillsStore } from '@/stores/useSkillsStore';
import { useSkillsCatalogStore } from '@/stores/useSkillsCatalogStore';
import { useMcpConfigStore } from '@/stores/useMcpConfigStore';
import { usePluginsStore } from '@/stores/usePluginsStore';
import { ChildStoreManager } from './child-store';
import { useGlobalSyncStore } from './global-sync-store';
import { createEventRoutingIndex, handleEvent } from './sync-context';
>>>>>>> upstream/main

<<<<<<< HEAD
const snapshot = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  session: {
    sessionId: "session-1", projectId: "project-1", workspaceId: "workspace-1", displayPath: ".",
    rootSessionId: "session-1", createdAt: 1, updatedAt: 1, epoch: "epoch-1", headSequence: "0",
    runtimeStatus: "idle", activeRunId: null, mode: { kind: "main" },
  },
  cursor: "epoch-1:0", activeRun: null,
  branch: { branchId: "branch-1", branchVersion: "0", leafMessageId: null },
  window: { firstTurnId: null, lastTurnId: null, firstMessageId: null, lastMessageId: null, hasEarlier: false },
  turns: [], messages: [], approvals: [], questions: [],
  requestRecovery: { pendingSet: "replace", priorEpochs: "expired" }, ...overrides,
})
||||||| bc50ba56aa
const originalListAgents = opencodeClient.listAgents;
const originalListProjects = opencodeClient.listProjects;
const originalAgentLoad = useAgentsStore.getState().loadAgents;
const originalConfigLoad = useConfigStore.getState().loadAgents;
const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
let childStores: ChildStoreManager;
let agentLoads: Array<string | null | undefined> = [];
let sdkReads: Array<string | null | undefined> = [];
=======
const originalListAgents = opencodeClient.listAgents;
const originalListProjects = opencodeClient.listProjects;
const originalAgentLoad = useAgentsStore.getState().loadAgents;
const originalConfigLoad = useConfigStore.getState().loadAgents;
const originalRuntime = getRuntimeKey();
const originalBase = getRuntimeApiBaseUrl();
// The coalescing window in sync-catalog-refresh.ts.
const CATALOG_RELOAD_DEBOUNCE_MS = 250;
let childStores: ChildStoreManager;
let agentLoads: Array<string | null | undefined> = [];
let sdkReads: Array<string | null | undefined> = [];
>>>>>>> upstream/main

const state = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE, session: [{ ...snapshot().session, metadata: null, metadataRevision: "0", archiveRevision: "0" }],
  sessionTotal: 1, ...overrides,
})

<<<<<<< HEAD
type CatalogFixture = CatalogUpdate
const catalog = (kind: "mcp" | "skills", revision: string, workspaceId = "workspace-1"): CatalogFixture => kind === "mcp"
  ? {
      kind, state: {
        runtimeStatus: "ready", appliedRevision: "1", catalogRevision: revision,
        worker: { workspaceId, rootSessionId: "session-1", workerGeneration: "worker-1" }, activeServers: [], tools: [],
      },
    }
  : {
      kind, state: {
        runtimeStatus: "ready", persistedSources: { workspace: "1", agent: "1" }, appliedSources: { workspace: "1", agent: "1" },
        catalogRevision: revision, worker: { workspaceId, rootSessionId: "session-1", workerGeneration: "worker-1" },
        agentDirectoryId: "agent-dir-1", skills: [],
      },
||||||| bc50ba56aa
beforeEach(() => {
  agentLoads = [];
  sdkReads = [];
  childStores = new ChildStoreManager();
  childStores.ensureChild('/workspace/project', { bootstrap: false });
  childStores.ensureChild('/workspace/unrelated', { bootstrap: false });
  useProjectsStore.setState({ projects: [{ id: 'ambient', path: '/workspace/ambient' }], activeProjectId: 'ambient' });
  useAgentsStore.setState({ loadAgents: async (directory) => { agentLoads.push(directory); return true; } });
  useConfigStore.setState({ loadAgents: async () => true });
  opencodeClient.listAgents = async (directory) => { sdkReads.push(directory); return []; };
  useGlobalSyncStore.getState().actions.reset();
});

afterEach(() => {
  opencodeClient.listAgents = originalListAgents;
  opencodeClient.listProjects = originalListProjects;
  useAgentsStore.setState({ loadAgents: originalAgentLoad });
  useConfigStore.setState({ loadAgents: originalConfigLoad });
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
  childStores.disposeAll();
});

describe('catalog refresh routing', () => {
  test('one config burst refreshes each Settings resource once across derived events', async () => {
    const config = spyOn(opencodeClient, 'getConfig').mockResolvedValue({});
    const providers = spyOn(useConfigStore.getState(), 'loadProviders').mockResolvedValue(undefined);
    const commands = spyOn(useCommandsStore.getState(), 'loadCommands').mockResolvedValue(true);
    const skills = spyOn(useSkillsStore.getState(), 'loadSkills').mockResolvedValue(true);
    const catalog = spyOn(useSkillsCatalogStore.getState(), 'loadCatalog').mockResolvedValue(true);
    const mcp = spyOn(useMcpConfigStore.getState(), 'loadMcpConfigs').mockResolvedValue(true);
    const plugins = spyOn(usePluginsStore.getState(), 'loadPlugins').mockResolvedValue(true);
    const spies = [config, providers, commands, skills, catalog, mcp, plugins];
    try {
      for (const kind of ['config', 'agent', 'provider', 'model', 'plugin', 'skill', 'command'] as const) {
        handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind } }, childStores, createEventRoutingIndex(), getRuntimeKey());
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(agentLoads.sort()).toEqual(['/workspace/ambient', '/workspace/project']);
      for (const resource of spies) expect(resource).toHaveBeenCalledTimes(1);
    } finally {
      for (const spy of spies) spy.mockRestore();
=======
beforeEach(() => {
  agentLoads = [];
  sdkReads = [];
  childStores = new ChildStoreManager();
  childStores.ensureChild('/workspace/project', { bootstrap: false });
  childStores.ensureChild('/workspace/unrelated', { bootstrap: false });
  useProjectsStore.setState({ projects: [{ id: 'ambient', path: '/workspace/ambient' }], activeProjectId: 'ambient' });
  useAgentsStore.setState({ loadAgents: async (directory) => { agentLoads.push(directory); return true; } });
  useConfigStore.setState({ loadAgents: async () => true });
  opencodeClient.listAgents = async (directory) => { sdkReads.push(directory); return []; };
  useGlobalSyncStore.getState().actions.reset();
});

afterEach(() => {
  opencodeClient.listAgents = originalListAgents;
  opencodeClient.listProjects = originalListProjects;
  useAgentsStore.setState({ loadAgents: originalAgentLoad });
  useConfigStore.setState({ loadAgents: originalConfigLoad });
  switchRuntimeEndpoint({ apiBaseUrl: originalBase, runtimeKey: originalRuntime });
  childStores.disposeAll();
});

describe('catalog refresh routing', () => {
  test('one config burst refreshes each Settings resource once per affected directory', () => {
    const config = spyOn(opencodeClient, 'getConfig').mockResolvedValue({});
    const providers = spyOn(useConfigStore.getState(), 'loadProviders').mockResolvedValue(undefined);
    const commands = spyOn(useCommandsStore.getState(), 'loadCommands').mockResolvedValue(true);
    const skills = spyOn(useSkillsStore.getState(), 'loadSkills').mockResolvedValue(true);
    const catalog = spyOn(useSkillsCatalogStore.getState(), 'loadCatalog').mockResolvedValue(true);
    const mcp = spyOn(useMcpConfigStore.getState(), 'loadMcpConfigs').mockResolvedValue(true);
    const plugins = spyOn(usePluginsStore.getState(), 'loadPlugins').mockResolvedValue(true);
    const spies = [config, providers, commands, skills, catalog, mcp, plugins];
    jest.useFakeTimers();
    try {
      for (const kind of ['config', 'agent', 'provider', 'model', 'plugin', 'skill', 'command'] as const) {
        handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind } }, childStores, createEventRoutingIndex(), getRuntimeKey());
      }
      jest.advanceTimersByTime(CATALOG_RELOAD_DEBOUNCE_MS);
      expect(agentLoads.sort()).toEqual(['/workspace/ambient', '/workspace/project']);
      expect(commands.mock.calls.map(([directory]) => directory).sort()).toEqual(['/workspace/ambient', '/workspace/project']);
      for (const resource of [config, providers, skills, catalog, mcp, plugins]) expect(resource).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
      for (const spy of spies) spy.mockRestore();
>>>>>>> upstream/main
    }

<<<<<<< HEAD
const event = (sequence: string, catalogUpdate: CatalogFixture): CanonicalEvent => ({
  sessionId: "session-1", epoch: "epoch-1", sequence, timestamp: Number(sequence), type: "catalog.updated", catalog: catalogUpdate,
})
||||||| bc50ba56aa
  test('an open-directory event refreshes its Settings list without reading unrelated locations', async () => {
    handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind: 'agent' } }, childStores, createEventRoutingIndex(), getRuntimeKey());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(agentLoads).toContain('/workspace/project');
    expect(agentLoads).not.toContain('/workspace/unrelated');
    expect(sdkReads).toEqual([]);
  });
=======
  test('an open-directory event refreshes its Settings list without reading unrelated locations', () => {
    jest.useFakeTimers();
    try {
      handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind: 'agent' } }, childStores, createEventRoutingIndex(), getRuntimeKey());
      jest.advanceTimersByTime(CATALOG_RELOAD_DEBOUNCE_MS);
      expect(agentLoads).toContain('/workspace/project');
      expect(agentLoads).not.toContain('/workspace/unrelated');
      expect(sdkReads).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
>>>>>>> upstream/main

<<<<<<< HEAD
describe("canonical catalog updates", () => {
  test("publishes only native MCP and skills catalog kinds", () => {
    let current = installSessionSnapshot(state(), snapshot())
    const mcp = applyDirectoryEvent(current, event("1", catalog("mcp", "1")))
    expect(mcp.kind).toBe("applied")
    current = mcp.state
    const skills = applyDirectoryEvent(current, event("2", catalog("skills", "2")))
    expect(skills.kind).toBe("applied")
    expect(skills.state.catalog["session-1\nmcp"]?.kind).toBe("mcp")
    expect(skills.state.catalog["session-1\nskills"]?.kind).toBe("skills")
  })
||||||| bc50ba56aa
  test('a queued catalog batch is discarded after a runtime switch', async () => {
    handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind: 'agent' } }, childStores, createEventRoutingIndex(), getRuntimeKey());
    switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-b.test', runtimeKey: 'runtime-b' });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(agentLoads).toEqual([]);
    expect(sdkReads).toEqual([]);
  });
=======
  test('a queued catalog batch is discarded after a runtime switch', () => {
    jest.useFakeTimers();
    try {
      handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind: 'agent' } }, childStores, createEventRoutingIndex(), getRuntimeKey());
      switchRuntimeEndpoint({ apiBaseUrl: 'https://runtime-b.test', runtimeKey: 'runtime-b' });
      jest.advanceTimersByTime(CATALOG_RELOAD_DEBOUNCE_MS);
      expect(agentLoads).toEqual([]);
      expect(sdkReads).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });
>>>>>>> upstream/main

  test("rejects a catalog update from another workspace for snapshot recovery", () => {
    const base = installSessionSnapshot(state(), snapshot())
    const result = applyDirectoryEvent(base, event("1", catalog("mcp", "1", "other-workspace")))
    expect(result.kind).toBe("resnapshot")
    expect(result.state).toBe(base)
  })

  test("retains the latest catalog revision and ignores stale duplicate delivery", () => {
    let current = installSessionSnapshot(state(), snapshot())
    current = applyDirectoryEvent(current, event("1", catalog("mcp", "2"))).state
    const duplicate = applyDirectoryEvent(current, event("1", catalog("mcp", "1")))
    expect(duplicate.kind).toBe("duplicate")
    expect(duplicate.state.catalog["session-1\nmcp"]?.state.catalogRevision).toBe("2")
  })
})
