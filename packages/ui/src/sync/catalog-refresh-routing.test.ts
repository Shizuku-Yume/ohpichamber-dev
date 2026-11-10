<<<<<<< HEAD
import { describe, expect, test } from "bun:test"
import type { CanonicalEvent, CatalogUpdate, SessionSnapshot } from "@openchamber/agent-contract"
import { applyDirectoryEvent, installSessionSnapshot } from "./event-reducer"
import { INITIAL_STATE, type State } from "./types"
=======
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
>>>>>>> bc50ba56a

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

const state = (overrides: Partial<State> = {}): State => ({
  ...INITIAL_STATE, session: [{ ...snapshot().session, metadata: null, metadataRevision: "0", archiveRevision: "0" }],
  sessionTotal: 1, ...overrides,
})

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
    }

const event = (sequence: string, catalogUpdate: CatalogFixture): CanonicalEvent => ({
  sessionId: "session-1", epoch: "epoch-1", sequence, timestamp: Number(sequence), type: "catalog.updated", catalog: catalogUpdate,
})

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
=======
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
    }
  });

  test('an open-directory event refreshes its Settings list without reading unrelated locations', async () => {
    handleEvent('/workspace/project', { type: 'catalog.updated', properties: { kind: 'agent' } }, childStores, createEventRoutingIndex(), getRuntimeKey());
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(agentLoads).toContain('/workspace/project');
    expect(agentLoads).not.toContain('/workspace/unrelated');
    expect(sdkReads).toEqual([]);
  });
>>>>>>> bc50ba56a

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
