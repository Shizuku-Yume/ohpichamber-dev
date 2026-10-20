# 50: Native session cache warming and SessionWarmingCheckbox cutover

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 93d519221527e15cf52a5dde0d6ddf011c7527bb
**Started:** 2026-10-18
**Finished:** 2026-10-20T19:59:51Z

**Delivers:** Retained `SessionWarmingCheckbox` state read/write wired to a canonical workspace cache-warming endpoint (`/api/agent/v1/workspaces/:workspaceId/cache-warming`), backed by native SDK prompt cache warming persistence and active-root session application using existing workspace catalog revision/authorization. Bun Agent Service worker owns the native SDK; Host authentication and workspace authorization remain authoritative without OpenCode config or custom host-side ping/timer loops.

**Blocked by:** None
**Files:** `packages/agent-contract/src/warming.ts`, `packages/agent-contract/src/warming.test.ts`, `packages/agent-contract/src/index.ts`, `packages/agent-service/src/catalogs/protocol.ts`, `packages/agent-service/src/supervisor/workspace-routes.ts`, `packages/agent-service/src/supervisor/workspaces.ts`, `packages/agent-service/src/supervisor/catalog-warming.test.ts`, `packages/agent-service/src/worker/catalog-warming.ts`, `packages/agent-service/src/worker/catalog-warming.test.ts`, `packages/agent-service/src/worker/catalogs.ts`, `packages/agent-service/src/worker/session.ts`, `packages/agent-service/src/worker/stateless.ts`, `packages/agent-service/DOCUMENTATION.md`, `packages/ui/src/api/canonicalClient.ts`, `packages/ui/src/api/canonicalClient-warming.test.ts`, `packages/ui/src/components/sections/openchamber/SessionWarmingCheckbox.tsx`, `packages/web/server/lib/host/canonical-routes.js`, `packages/web/server/lib/host/canonical-warming-routes.test.js`, `.workflow/tasks/omp-through-m3/50-native-cache-warming.md`
**Read first:** `.workflow/specs/omp-through-m3.md` W6, W9, W10; `packages/agent-contract/src/catalogs.ts`; `packages/agent-service/src/worker/session.ts`; `packages/agent-service/src/supervisor/workspaces.ts`; installed native SDK `@oh-my-pi/pi-coding-agent/session/settings.ts` (`cfgProvidersCacheWarming`), `agent-session.ts` (`setCacheWarmingMode`), and `sdk.ts` (`CacheWarmer`); `packages/ui/src/components/sections/openchamber/SessionWarmingCheckbox.tsx`
**Covers:** W6, W9, W10

## Installed Native SDK Owner & Evidence

Prompt cache keep-alive / warming is an implemented native feature in `@oh-my-pi/pi-coding-agent`, verified in installed scoped Bun source:
- `session/settings.ts`: exports `cfgProvidersCacheWarming` (`id: "providers.cacheWarming"`, `type: "enum"`, `values: ["off", "streaming", "idle"] as const`, `default: "idle"`).
- `session/agent-session.ts`: `AgentSession.setCacheWarmingMode(mode: CacheWarmingMode): CacheWarmingMode` provides session-scoped runtime override and notifies the session warmer via `cfgProvidersCacheWarming.listen(this, () => warmer.onModeChanged())`.
- `sdk.ts`: enables native `CacheWarmer` unless `options.cacheWarming === false`, replaying the last request with a one-token budget shortly before its prompt-cache entry expires.
- Source evidence: grep in installed scoped `.bun` source confirms actual native warmer logic and configuration handles, rather than speculative Host or UI timers.

## Architecture & Boundaries

- **Worker ownership:** Dedicated Bun Agent Service worker owns `Settings`, `AgentSession`, and `CacheWarmer`. All native SDK state and execution reside in the worker, accessed through Canonical Client and Host Gateway. Node Host and UI never import or run the native SDK.
- **Host authentication & authorization:** Host Gateway enforces user authentication and workspace authorization on all warming routes. Host does not parse or manage OpenCode configuration files, nor does it run its own warm loop, ping interval, or keep-alive timer.
- **Canonical API & wire contract:**
  - `GET /api/agent/v1/workspaces/:workspaceId/cache-warming` returns `CacheWarmingState`: `{ workspaceId, revision, mode }`, where `mode` is `"off" | "streaming" | "idle"`.
  - `PUT /api/agent/v1/workspaces/:workspaceId/cache-warming` accepts `CacheWarmingUpdateRequest`: `{ expectedRevision, mode }`.
  - Response returns committed persistence `{ workspaceId, revision, mode }` alongside explicit active-worker apply outcomes: `{ status: "applied" | "partial" | "failed" | "no-active-workers", workers: CacheWarmingWorkerApplyOutcome[] }`.
  - If worker fanout is partial or an active worker fails, the response reports explicit outcomes; the service never pretends the mode was applied when a worker failed or was not running.
- **UI state mapping in `SessionWarmingCheckbox`:**
  - Checkbox unchecked (`false`) maps to `"off"`.
  - Checkbox checked (`true`) maps to `"idle"`.
  - Native `"streaming"` mode returned by the service is displayed truthfully without silent flattening.
  - Availability is not relabeled as execution proof: checking the box reflects configured mode, not guaranteed prompt cache hit or active request execution.
- **Persistence & live application:**
  - Persistence: `Settings.loadIsolated({ cwd, agentDir: join(cwd, '.omp') })` scopes writes to the workspace's `.omp/config.yml`; mode is written via `cfgProvidersCacheWarming.set(settings, mode)` and `await settings.flush()`. Authoritative reads use `Settings.loadReadOnly({ cwd, agentDir })` preserving inherited native settings.
  - Active session application: active worker fanout applies `session.setCacheWarmingMode(mode)` across generation-qualified live worker sessions for the workspace.
  - Partial write error semantics: if service catalog-revision persistence fails after native settings flush, the native config remains saved on disk, the previous service revision is restored in memory, live application is skipped (`liveApplication: 'not-started'`), and the mutation fails with HTTP 503 `SERVICE_UNAVAILABLE` carrying typed `CacheWarmingPartialWriteDetails`. The system makes no claim of atomic rollback across the native file write and service revision file.
  - Reuses existing workspace catalog revision / CAS and worker lifecycle; no new retry loops, separate caches, or custom polling architectures are introduced.
- **Runtime surface across platforms:**
  - Web, Electron, and mobile connect to the same selected Host.
  - Mobile runs UI only and connects to the Host Gateway; there is no local mobile worker.
- **Module ownership & coordination:**
  - Owns `warming.ts` schema/module in `agent-contract`, worker warming handler in `agent-service`, `SessionWarmingCheckbox.tsx` in `packages/ui`, and Host routes in `packages/web`.
  - Coordinates generic protocol, router, and catalog coordinator updates with the Task 49 provider owner, preserving OAuth casing conventions.
  - Touches no provider UI files (`packages/ui/src/components/sections/providers/*`).

## Check

- Unit and contract tests for `CacheWarmingStateSchema`, `CacheWarmingUpdateRequestSchema`, and `CacheWarmingApplyResultSchema`.
- Worker tests verifying deterministic native config reopen (mode persists to disk via `Settings.flush` and reloads on reopen) and live mode update via `session.setCacheWarmingMode`.
- No external provider network calls are needed to verify this state and configuration contract.
- Parent runs integration tests and connected UI verification once after task delivery.

## Acceptance

- [x] Canonical contract defines `CacheWarmingStateSchema`, `CacheWarmingUpdateRequestSchema`, and `CacheWarmingApplyResultSchema` with uint64 decimal revision counters.
- [x] Agent Service implements `GET /api/agent/v1/workspaces/:workspaceId/cache-warming` and `PUT /api/agent/v1/workspaces/:workspaceId/cache-warming` under workspace revision CAS.
- [x] Worker persists mode via `cfgProvidersCacheWarming` and `Settings.flush`, and updates live sessions via `session.setCacheWarmingMode`.
- [x] Fanout returns explicit active-worker apply outcomes; partial application is never reported as full success.
- [x] `SessionWarmingCheckbox` cuts over to `CanonicalClient`, mapping unchecked to `"off"` and checked to `"idle"`, while reading `"streaming"` truthfully.
- [x] Host authentication and workspace authorization guard the warming routes without custom keep-alive loops or OpenCode config files.
- [x] Node Host and UI remain free of native SDK imports.
- [x] Tests verify deterministic config reopen and live mode update without external provider calls.

## Progress

Task 50 is implemented and integrated across commits `220f2fb6271812fdca70d4b35e8b764f1fbfa563` and correction `e4f67e02471ecfcd4d545ce51b2c021f55100123` integrated alongside Task 49 native provider management (preserving OAuth case conventions).

### Implementation summary

1. **Canonical warming contract (`packages/agent-contract/src/warming.ts`):**
   - Defines `CacheWarmingModeSchema` (`"off" | "streaming" | "idle"`), `CacheWarmingStateSchema`, `CacheWarmingUpdateRequestSchema`, `CacheWarmingWorkerApplyOutcomeSchema`, `CacheWarmingApplyResultSchema`, and `CacheWarmingPartialWriteDetailsSchema`.
   - Exported from `packages/agent-contract/src/index.ts`.
   - Contract validation tests in `packages/agent-contract/src/warming.test.ts`.

2. **Agent Service worker persistence & application (`packages/agent-service/src/worker/`):**
   - `NativeCacheWarming`:
     - Reads via `Settings.loadReadOnly({ cwd: this.context.cwd, agentDir: this.context.agentDirectory })` to preserve natural inherited settings from the selected agent directory.
     - Persists mode via `Settings.loadIsolated({ cwd: this.context.cwd, agentDir: join(this.context.cwd, '.omp') })`, setting `cfgProvidersCacheWarming.set(settings, state.mode)` and `await settings.flush()`, writing directly into the workspace `.omp/config.yml`.
     - Live application via `session.setCacheWarmingMode(mode)` on active `AgentSession` instances.
   - Integrated into `WorkerCatalogs`, `StatelessWorker`, and `WorkerSession`.

3. **Supervisor coordination & revision handling (`packages/agent-service/src/supervisor/`):**
   - `WorkspaceRoutes` dispatches `GET /api/agent/v1/workspaces/:workspaceId/cache-warming` and `PUT /api/agent/v1/workspaces/:workspaceId/cache-warming`.
   - `WorkspaceCatalogs`:
     - Serializes mutations per `agentDirectoryId` under workspace catalog revision CAS.
     - Dispatches generation-qualified worker fanout across active sessions (`kind === 'session'`, `state === 'ready' || 'starting'`), checking `workerGeneration` and returning explicit per-worker outcomes (`applied`, `failed`).
     - Handles partial-write failures: if `this.persist()` fails after native settings flush, the previous service revision is restored, live application is skipped (`liveApplication: 'not-started'`), and a `WorkerOperationError(503, 'SERVICE_UNAVAILABLE')` is thrown containing `CacheWarmingPartialWriteDetails`. The system makes no claim of atomic rollback across native config and service revision file.

4. **Host Gateway routing (`packages/web/server/lib/host/canonical-routes.js`):**
   - Registers authenticated and workspace-scoped `GET` and `PUT /workspaces/:workspaceId/cache-warming`.
   - Validates response matching selected workspace.

5. **Canonical Client (`packages/ui/src/api/canonicalClient.ts`):**
   - Exposes `readCacheWarming(workspaceId, signal)` and `updateCacheWarming(workspaceId, input, signal)`.

6. **UI Component (`packages/ui/src/components/sections/openchamber/SessionWarmingCheckbox.tsx`):**
   - Reads workspace cache-warming state via `canonicalClient.readCacheWarming`.
   - Maps checkbox unchecked to `"off"`, checked to `"idle"`.
   - Displays native `"streaming"` mode truthfully without flattening.
   - On partial-write failure (HTTP 503 carrying `CacheWarmingPartialWriteDetails`), reflects the persisted configured mode and partial-write error message, and disables further writes until reload.
   - Reports save state using `reportSettingsSaveState`.

### Verification status

- **Authored unit and boundary tests:**
  - `packages/agent-contract/src/warming.test.ts`
  - `packages/agent-service/src/worker/catalog-warming.test.ts`
  - `packages/agent-service/src/supervisor/catalog-warming.test.ts`
  - `packages/web/server/lib/host/canonical-warming-routes.test.js`
  - `packages/ui/src/api/canonicalClient-warming.test.ts`
- **Component test cleanup:** Deleted `module.mock` component tests and removed echo tests per project testing discipline.
- **Focused verification (2026-10-19):** Passed `bun test packages/agent-contract/src/warming.test.ts packages/agent-service/src/worker/catalog-warming.test.ts packages/agent-service/src/supervisor/catalog-warming.test.ts packages/ui/src/api/canonicalClient-warming.test.ts packages/web/server/lib/host/canonical-warming-routes.test.js` (27 tests, 230 assertions). Connected UI and parent integration checks remain pending.
- **Task status:** Remains `active` (not archived, acceptance items unticked); no M3 completion claimed.

### Verification on integration HEAD (2026-10-21)

- Resumed on `omp-through-m3/recovery-20261013` at HEAD `6f5a09f3c`. Recorded Base `93d519221527e15cf52a5dde0d6ddf011c7527bb` resolves to a commit but is a sibling snapshot, not an ancestor of HEAD; the implementation record names commits `220f2fb6` and `e4f67e02`.
- Dirty at start (resume/landing; preserved, never staged): `packages/agent-service/src/sessions/registry-native.test.ts`, `packages/agent-service/src/sessions/registry.ts`, `packages/agent-service/src/supervisor/service.ts`, `packages/ui/src/sync/DOCUMENTATION.md`, `packages/ui/src/sync/bootstrap.test.ts`, `packages/ui/src/sync/bootstrap.ts`, `packages/ui/src/sync/child-store.test.ts`, `packages/ui/src/sync/child-store.ts`, `packages/ui/src/sync/retry.ts`, `packages/ui/src/sync/session-message-loader.ts`, `packages/ui/src/sync/sync-context.tsx`, `.workflow/omp-migration/m3/task36-recovery-guest-2026-10-20.json`.
- Prior-evidence check: the focused packet's 2026-10-19 evidence was not reused. Later commits `dcbd55f7d` (contract/worker/supervisor), `ab70fb2bf` (Host routes) and `66fbdec99` (canonical client/checkbox) changed the warming source after that record. Re-running the exact five-file packet produced **27 pass, 0 fail, 231 expect() calls** (one more assertion than 2026-10-19).
- Focused behavior covered by that packet: contract schemas/revision counters; native settings flush/reopen from workspace disk without touching shared or sibling config; all three modes applied to a live session without sending a turn; validation before disk write; serialized CAS and durable owner revision; no live session is not counted/applied; partial/failed fanout with exact generations; retired generation cannot acknowledge; only this workspace's ready/starting sessions targeted; native-flush failure leaves revision unchanged and never fans out; supervisor revision failure reports committed native configuration with `liveApplication: 'not-started'`; Host unauthenticated/unauthorized/enterprise/origin/strict-body/malformed-response/stale-CAS boundaries.
- Connected isolated Web smoke: Host `127.0.0.1:3164` with `HOME=/tmp/ohpi-task50-home`, workspace/chats `/tmp/ohpi-task50-home/.config/openchamber/chats`, workspace `ws_e7138f54-6d1c-4718-914b-66583edf0222`, dist index `c438247e…`. `/auth/session` returned `200 {authenticated:true,disabled:true}` with a signed passwordless session cookie; `/api/agent/v1/ready` returned `200 {ready:true,engine:"omp"}`. No provider network was used.
  1. **Native streaming readback:** with `providers.cacheWarming: streaming` in the workspace `.omp/config.yml`, `GET /api/agent/v1/workspaces/<id>/cache-warming` returned `200 {revision:"0",mode:"streaming"}`; the Sessions row displayed `Streaming mode`, checkbox checked and enabled. Native mode is shown truthfully, not flattened to idle/off.
  2. **Unchecked → off:** clicking the checkbox sent `PUT …/cache-warming {"expectedRevision":"0","mode":"off"}` → `200`; the row showed `Off` and `Saved; no active workers to apply this mode.`; native config became `providers.cacheWarming: "off"`; `GET` returned `{revision:"1",mode:"off"}`.
  3. **Checked → idle:** the next click sent `PUT {"expectedRevision":"1","mode":"idle"}` → `200`; the row showed `Idle mode` with the same outcome; native config became `providers.cacheWarming: idle`; `GET` returned `{revision:"2",mode:"idle"}`.
  4. **Partial write (deterministically induced, isolated only):** after `chmod 500` on `/tmp/ohpi-task50-home/.config/openchamber/agent-state` (restored to `700` immediately), unchecking sent `PUT {"expectedRevision":"2","mode":"off"}` → `503`. Native config was already saved as `"off"`; the checkbox and its info control were disabled; the status read `Native configuration was saved, but the revision could not be committed and live application did not start. Reload before changing this setting again.` Service owner revision remained `"2"` and `GET` returned `{revision:"2",mode:"off"}`. Reload recovered an enabled `Off` row with no partial message. This matches the supervisor partial-write semantics; no live application was claimed.
- Surface list: Web exercised; Electron uses the same Host Gateway and UI but was not launched; hosted mobile/Capacitor use the same Host UI and have no local worker. No custom polling or keep-alive timer exists in the warming paths; the UI reads on mount/runtime change, and native SDK ownership stays in the Bun worker. No native SDK import exists under `packages/ui/src` or `packages/web/server`.
- Evidence receipt: `.workflow/omp-migration/m3/task50-cache-warming-2026-10-21.json`.
- Limitations: no active session was open, so the connected outcome was `no-active-workers`; `applied`/partial fanout is covered by focused supervisor tests, not the browser run. Electron/mobile were not separately launched. No provider request, prompt, cache hit, or native warmer execution ran; configured mode is not execution proof.
- Review boundary: comparison point `93d5192` via the recorded implementation commits plus current HEAD `6f5a09f3c`; paths are the warming contract, worker/supervisor, Host routes, canonical client and `SessionWarmingCheckbox`; trust boundaries are Host authentication/workspace scope and worker-owned native settings. Own quality pass found no blocking defect: mode mapping, partial disable, and reload recovery match the contract. Own security pass found no blocking defect: Host tests cover unauthenticated/unauthorized/origin/enterprise boundaries, no secrets are exposed, and the worker remains the only SDK owner. Advisory reviewers were not awaited per the user's instruction; their conclusions are not claimed.
