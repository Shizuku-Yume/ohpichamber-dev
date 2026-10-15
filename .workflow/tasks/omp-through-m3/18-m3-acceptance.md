# 18: Run the M3 integrated acceptance gate

**Effort:** omp-through-m3
**Task type:** feature
**Base commit:** 3f4afa751888da3e0b6b795ad31534fa6c8a9c6b

**Delivers:** One current acceptance packet proves M0-to-M3 behavior on Web and Electron, records platform/provider limitations, and closes only the gates supported by observed evidence.

**Blocked by:** 10, 11, 14, 15, 16, 17, 32
**Files:** `.workflow/development.md`, `.workflow/omp-migration/implementation-plan.md`, `.workflow/specs/omp-through-m3.md`, acceptance artifacts under `.workflow/omp-migration/m3/`

**Read first:** `.workflow/specs/omp-through-m3.md` W1-W10; `.workflow/tasks/omp-through-m3/32-m3-native-subagent-navigation.md`; all task artifacts; architecture/contracts/scope; package validation commands; existing M0 evidence
**Covers:** W1, W2, W3, W4, W5, W6, W7, W8, W9, W10

**Check:** `bun run type-check && bun run lint && bun run build && bun run test && bun run dead-code && bun run docs:validate && .workflow/bin/workflow validate --no-color`, once after integration, plus observed connected Web/Electron W1-W10 acceptance. Reuse current task-17 observations where unchanged. Every required item must pass or carry an explicit maintainer acceptance decision; merely reporting a blocker does not pass or archive this gate.

- [ ] Run one non-duplicative acceptance matrix covering every W1-W10 item and both Web/Electron where applicable.
- [ ] Include failure, reconnect, restart, CAS, queue durability, partial-result and scope-isolation scenarios.
- [ ] Review dead-code output and remove obsolete agent exports/imports rather than suppressing findings.
- [ ] Record exact command output/artifact paths, environment and known provider/platform limitations.
- [ ] Mark M3 complete only if every required acceptance item has evidence; otherwise keep the gate open with the next task.

## Progress

**Status:** active
**Integrated evidence:** combined native UI settings/Guest packet `74` tests / `578` assertions passed; session-actions `66` tests / `208` assertions passed; Electron `43/43` test files and syntax type-check passed; focused Host startup passes without legacy proxy registration; docs validation passed (`696` pages / `58` links); workflow validation passed (`42` task files). Sessionless workspace MCP backend (`7ab670325`) and legacy retirement (`3c4b8e7a6`) are integrated: canonical workspace MCP is the sole settings/config authority, old `/api/config/mcp*` routes and OpenCode MCP client are retired, and focused contract, native session+MCP, isolated UI, and Web config suites passed alongside real `AgentService` HTTP smoke (see `.workflow/tasks/omp-through-m3/17-m3-host-integration.md` for detailed counts and smoke boundaries).
**Open gate evidence (superseded by the 2026-10-16 baseline below):** the earlier Web package run reported `386` files / `6441` tests passing; UI type-check, changed-slice oxlint and dead-code remain open. Packaged staging commits (`7d0cfa7a6`, `f3a7c17f0`) and earlier isolated staging tests passed, but packaged Electron runtime certification without OpenCode remains open. Real `AgentService` HTTP smoke passed, but connected Web/Electron W7–W10 Host/UI acceptance is not certified. Pinned SDK source analysis confirmed no native portable archive API exists; JSONL alone cannot preserve subagent trees, artifacts, or image blobs, so isolated-space archive requires native Agent Service-owned transfer and deleted-space read-only admission (that transfer is now implemented; no canonical legacy transcript importer was added).
**2026-10-16 baseline (this tree, Linux x64, Node 24.18.0 / Bun 1.4.2):** `bun run type-check` exits `2` with `735` errors, all inside the `packages/ui` test project (`tsconfig.test.json`); the UI production project and the contract, service, web and Electron type-checks are clean. `bun run --cwd packages/web test` passes `381` files / `6408` tests; the `packages/ui` isolated runner passes `728` of `807` files; Electron `43/43`; SDK `23/23`; `agent-service` `101` tests plus `76` across its sessions/worker suites. `bun run docs:validate` passes `696` pages / `58` links and `.workflow/bin/workflow validate` passes `42` task files. `bun run dead-code` still exits `1` on the repository baseline, and this wave deleted the eighteen modules it reported unreferenced. Real startup smoke starts the Host with its supervised Bun Agent Service: `/api/agent/v1/ready` answers `{"ready":true,"engine":"omp","version":"1.0.0"}` while an unauthenticated `/api/agent/v1/sessions` answers `401`, so authenticated connected Web/Electron acceptance remains the open W7–W10 item. Isolated-space archive import is canonical (Host scope selection plus Agent Service `/internal/archive/import` with rollback), and the OpenCode CLI upgrade surface is retired.

**Decision:** M3 is not complete. Keep Task 18 active until W7–W10 connected Web/Electron native child, timeline, sidebar, Guest, packaged Electron runtime, and remaining legacy-consumer cutovers have observed evidence.
**Next slice:** finish the `packages/ui` test-project migration, cut the 31/15 legacy UI callers (`@/lib/opencode/model` types and `@/lib/opencode/client` calls) over to the canonical contract and client, retire the managed-OpenCode lifecycle owners they depend on, complete packaged Electron certification, and run connected Web/Electron W7–W10 acceptance. Credential handoff outcomes are already verified in the composed M2 receipt; no startup credential importer remains in the current Host path.
- [ ] Verify native subagent execution, timeline navigation, sidebar hierarchy and child history recovery end-to-end on Web and Electron without OpenCode fallbacks.
