# 07: Define the Canonical Agent Service contract package

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** ab643bd95a1541796c30aa1e00a197fd5b6975a3
**Base branch:** omp-through-m3/m1-integration
**Started:** 2026-10-12T14:46:09+00:00
**Finished:** 2026-10-12T16:00:37+00:00

**Delivers:** Versioned internal Agent Service types and validation cover sessions, projects, messages, events, approvals/questions, queue records, catalogs, shell jobs, cursors and typed errors without importing SDK objects into Host Gateway or UI.

**Blocked by:** 21
**Files:** `packages/agent-contract/`, `.workflow/omp-migration/contracts.md`, package manifests and contract tests

**Read first:** `.workflow/specs/omp-through-m3.md` M2/W3-W6; `.workflow/omp-migration/contracts.md`; architecture process boundary; M0 artifacts; existing SDK and runtime contract conventions
**Covers:** W3, W4, W5, W6

**Check:** `bun test packages/agent-contract` → valid and invalid fixtures exercise every exported DTO, event envelope, cursor and error class; no contract imports `@opencode/*` or leaks SDK class instances.

- [x] Define DTOs from verified behavior and intentional service projections, not inherited OpenCode shapes.
- [x] Define event sequence/cursor rules, replay semantics, terminal states and restart invalidation.
- [x] Define CAS versions for approvals/questions and queue state transitions.
- [x] Define catalog, completion and Guest Shell result/error shapes with bounded output and redaction rules.
- [x] Keep SDK-private types behind the service package boundary.

## Progress

Dirty at start: none after the accepted M1 gate commit on the isolated integration branch. Task21 is archived and landed as `ab643bd95a1541796c30aa1e00a197fd5b6975a3`. The original dirty main tree remains untouched. The coordinator owns package manifests, lockfile, Docker workspace registration, combined event schemas/public exports, contract documentation and the single integration check.

Parallel implementation uses `/tmp/ohpi-m2-contract-core-20261012` for primitive/error/session/metadata/message/prompt/request/snapshot schemas and `/tmp/ohpi-m2-contract-catalog-20261012` for queue/catalog/Shell/completion schemas. Both start from the landed gate commit and own disjoint files. Workers skip builds, lint, tests and formatters; the coordinator runs focused contract checks and a real Bun/Node wire-serialization smoke after integration.

Check before: `packages/agent-contract` does not exist, so the named contract Check cannot run. Reuse the reviewed M0 input identities and M1 metadata evidence; do not probe SDK behavior again. The earlier schema map identified missing Project/Agent/Run/page/command/Shell/completion shapes and the obsolete scalar goal draft. The new contract preserves typed Host operational metadata under `openchamber`, never exports the draft `goal?: string` or private absolute workspace mappings, and adds only the deliberate public shapes required by these consumers.

Surface behavior: Web/PWA uses JSON-safe records through the authenticated Host; Electron uses the same contract through its Node Host; hosted mobile and Capacitor use the active remote Host and run no local SDK/service; Guest Shell receives capability-scoped Shell records through its existing Guest bridge, not an interactive PTY or SDK object. VS Code extension support stays retired.


## Verification and review

The integrated package exports strict JSON DTO/schema families through compiled `dist/index.js` and declarations. Added workspace manifest/lock registration, Docker manifest copying, executable knip entries, and the package README. Protocol documentation now points to the schemas instead of retaining obsolete draft declarations; it records exact catalog/config/auth/profile, Shell and completion routes and transport-normalized events. Host operational metadata stays typed under `openchamber`; live outer-run identity stays separate from inner turns and independent Host revisions. The redundant `RunCreateAck` alias was removed; creation returns `Run`.

- `bun test packages/agent-contract`: 126 passed across 14 files in 139 ms. Final observed Host-error compatibility and fixture/alias corrections then passed only the affected three files: 14 passed, 0 failed in 58 ms. Unchanged fixtures were not rerun.
- Final `bun run build`, the real Bun/Node wire smoke, and `bun run lint` passed together in 2.95 seconds. The build includes strict type checking and declarations, so a duplicate standalone type-check was not run. Full authored oxlint passed; final changed-path oxlint also passed.
- The temporary smoke used Node 24.18.0 and Bun 1.4.2 with a private actual HTTP/SSE listener and compiled package imports: three JSON records and two SSE frames retained full unsigned-64 counters, an independently revisioned partial Host operational record, and unsequenced invalidation. The listener closed and child exited 0. Receipt: `/tmp/ohpi-m2-contract-wire-receipt-20261012.json`. This proves the contract wire boundary, not Agent Service, SDK or provider execution.
- `bun install --offline --ignore-scripts --frozen-lockfile`: checked 1,416 installs across 1,547 packages with no changes in 31 ms.
- Final `bun run dead-code` reports only the unchanged baseline four i18n exports and eight UI types; it remains non-green. The new executed tests are registered as entries and the direct duplicate acknowledgement export is gone. No suppression or baseline cleanup was added.

The single integration check found stale authored fixtures and field-binding naming errors; those were repaired rather than adding defensive runtime paths. A later concrete producer check added the exact existing Host Problem codes, not guessed aliases/status mappings. Requirements review `M2ContractRequirement07` and source quality/security review `M2ContractQuality07` passed with zero findings, including the bounded final compatibility/alias delta. No M0/M1 suite, root application build, platform/container probe or provider call was repeated. Release notes and the original dirty main tree remain untouched.

Next: task08 installs the retained source-derived SDK inputs portably and builds the real supervised Bun service with dedicated workers. Contract readiness is not that runtime gate.

The temporary wire smoke source was removed after its receipt was retained. Final `.workflow/bin/workflow validate --no-color` passed for 41 task files in 0.07 seconds; existing Python deprecation warnings are unchanged.
