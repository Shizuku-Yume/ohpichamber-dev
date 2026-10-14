# 32: Project native child subagents, session registry, and history navigation

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 420faf4a76a3ebd6349dbdf0d679a12139f687ba

**Delivers:** Real native child subagent projection, session indexing, Host listing route, Canonical Client methods, and child transcript history navigation end-to-end for Web and Electron, backed by the pinned OMP SDK TaskTool without OpenCode fallbacks or dummy child success.

**Blocked by:** 13
**Files:** `packages/agent-service/src/supervisor/service.ts`, `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/worker/session.ts`, `packages/agent-service/src/worker/projection.ts`, `packages/web/server/lib/host/canonical-routes.js`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/stores/globalSessionStructure.ts`, `packages/agent-contract/src/session.ts`, focused tests in `packages/agent-service/`, `packages/web/`, `packages/ui/`

**Read first:** `.workflow/specs/omp-through-m3.md` M2/M3/W3/W7/W9/W10; `.workflow/omp-migration/scope.md` `SCOPE-3.2`, `SCOPE-4.1`, `SCOPE-4.3`; `.workflow/omp-migration/contracts.md` subagent endpoint (`GET /api/agent/v1/subagents`, line 96) and capabilities; `packages/agent-service/src/supervisor/service.ts:54, 325-328`; `packages/web/server/lib/host/canonical-routes.js:128-137`; `packages/agent-service/src/sessions/registry.ts:44-50, 97-106`; `packages/agent-service/src/worker/session.ts:174-189`; `packages/agent-service/src/worker/projection.ts`; `packages/ui/src/api/canonicalClient.ts`; `packages/ui/src/stores/globalSessionStructure.ts:27, 46`; `agent://ScoutM3SubagentBoundary` findings
**Covers:** W3, W7

**Check:** Verify initial absence/false capability: `AgentService` statically returns `subagents: false` at `packages/agent-service/src/supervisor/service.ts:54`, `canonical-routes.js:128-137` proxies `subagents: false`, `GET /api/agent/v1/subagents` returns 404, `packages/agent-service/src/sessions/registry.ts` lists only root sessions, and `CanonicalClient` lacks `listSubagents`. After implementation, run focused package tests: `bun test packages/agent-service/src/sessions/ packages/agent-service/src/worker/ packages/web/server/lib/host/`. Then run one controlled loopback provider scenario using the built Bun service, Host Gateway, and native SDK (`createAgentSession` with native `TaskTool`): SDK-native child execution owned by root worker, actual topology source/runtime verified; parent session executes prompt spawning a child subagent; observe live child session scope and status (`running` -> `completed`); query `GET /api/agent/v1/subagents?sessionId=:rootSessionId` returning `SubagentSchema[]`; read child history and cursor via `GET /api/agent/v1/sessions/:childSessionId/history` from SDK-owned JSONL artifacts without leaking internal filesystem paths; verify stable child IDs across cold reopen; verify cross-root and foreign workspace access denial; and verify root move/deletion lifecycle. No mock SDK, dummy child success, or permanent smoke runner infrastructure.

- [x] Expose `subagents: true` in `AgentService` capabilities (`packages/agent-service/src/supervisor/service.ts`) and proxy through Host Gateway (`packages/web/server/lib/host/canonical-routes.js`).
- [x] Implement `GET /api/agent/v1/subagents` endpoint on Agent Service and Host Gateway matching `contracts.md:96`, returning `SubagentSchema[]` for a given `sessionId`.
- [x] Subscribe worker projection and session registry to native `TaskTool` child session lifecycle events, tracking child sessions with `parentSessionId` and `rootSessionId` under the owning root worker.
- [x] Support child session history reading and cursor pagination via canonical routes without leaking private SDK paths or internal artifact filenames.
- [x] Enforce root worker authorization and workspace scope boundary: reject cross-root or foreign workspace child access requests.
- [x] Preserve child session lifecycle across root worker operations: cold reopen with stable child IDs, root workspace relocation/move, and cleanup on root session deletion.
- [x] Add `listSubagents(sessionId: string): Promise<Subagent[]>` to `CanonicalClient` in `packages/ui/src/api/canonicalClient.ts` and populate `parentSessionId` in `globalSessionStructure.ts` for downstream UI consumers (Tasks 14 and 15).
**Verification status:** Implementation and focused service/UI tests pass. The required controlled loopback native-provider scenario and a dedicated Host list/child-history regression are still pending; do not mark M3 acceptance complete until those proofs run.
