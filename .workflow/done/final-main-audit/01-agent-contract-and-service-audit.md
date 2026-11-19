# 01: Audit and polish agent-contract and agent-service code quality

**Effort:** final-main-audit
**Task type:** refactor
**Blocked by:** None
**Covers:** W1
**Files:** `packages/agent-contract/**`; `packages/agent-service/**`
**Read first:** `.workflow/specs/final-main-audit.md`; `AGENTS.md` Validation & Correctness Invariants; `.workflow/omp-migration/architecture.md`; `.workflow/omp-migration/contracts.md`
**Check:** `bunx oxlint packages/agent-contract packages/agent-service && bun run --cwd packages/agent-contract type-check && bun run --cwd packages/agent-service type-check && bun run --cwd packages/agent-contract test && bun test --timeout 15000 packages/agent-service/src && bun run --cwd packages/agent-service build` → all exit 0 with 0 errors and 0 warnings.
**Base commit:** a4a8d19d2d3e5b6936afe35dd69db22fb0520db6
**Review:** pass (base a4a8d19d2d3e5b6936afe35dd69db22fb0520db6)
**Check after:** rework-round-2 receipts in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task01/rework-round2/`:

- `oxlint-all.log` / `.exit` — `bunx oxlint packages/agent-contract packages/agent-service` → exit 0, 0 diagnostics (0 errors, 0 warnings)
- `contract-typecheck` → exit 0; `service-typecheck` → exit 0 (18 OMP declaration packages prepared, clean)
- `contract-lint` → exit 0; `service-lint` → exit 0 (0 errors, 0 warnings)
- `contract-test.log` → exit 0, 270 pass / 0 fail / 0 skip, 1676 expects, 27 files
- `service-test-full.log` → exit 0, 610 pass / 0 fail / 10 skip, 6223 expects, 620 tests, 77 files
- `service-named-tests.log` → exit 0, 10 pass / 0 fail across `service-error-cause.test.ts`, `service-surface-routes.test.ts`, `workers.spare.test.ts`
- `service-build.log` → exit 0, 3 entry points bundled from 76 modules
- `check.log` → exit 0, 5/5 steps passed (type-check 3,842 files/5 projects; upstream-gaps 675 allowlisted, 0 unallowlisted)
- `antislop-current.log` → exit 1 by design (pre-existing backlog), 350 findings in 50 files: agent-contract 9, agent-service 341; every file at or below the `cf8df4f03b` baseline of 458 (per-file table in `../rework/per-file-delta.txt`), and `worker/host-tool.ts` at 14 (≤21)
- `git-status.log` → 12 intended modified files, no untracked or scratch files

- [x] Run `bunx oxlint` across `packages/agent-contract` and `packages/agent-service` and remove all lint findings (0 errors, 0 warnings); the separate `anti-slop` backlog is reduced and counted, not eliminated — 350 findings remain against the `cf8df4f03b` baseline of 458, with no file above baseline (`antislop-current.log`, `../rework/per-file-delta.txt`).
- [x] Audit worker lifecycle, process/timer cleanup, IPC error envelopes, and OMP SDK boundary encapsulation across `packages/agent-service/src/supervisor/` and `src/worker/`; the errors reported against `1239d2e3e7` are fixed and covered by tests (`service-test-full.log`, `service-named-tests.log`).
- [x] Rebuild `packages/agent-service/dist` and pass all contract and service tests (`service-build.log` exit 0; `contract-test.log` 270/0 fail; `service-test-full.log` 610 pass / 0 fail). README/`DOCUMENTATION.md` were not re-reviewed in this rework; no receipt claims otherwise.

## Progress

Receipts: `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task01/rework-round2/` (round 2, after rework) and `.../task01/rework/` (round 1). `cf8df4f03b` anti-slop baseline: 458 findings, 55 files.

- **(a) `packages/agent-service` type-check failures fixed with real contract types, no casts.** `auto-title.ts` replaced the `asContentDomain` typeof/Object probing with `userContentTexts`, typed from `Extract<AgentMessage, { role: 'user' }>['content']`, and removed the duplicated JSDoc block; `usage.ts` now reads `parsedAssistant.data` for `duration`/`ttft` and builds an `AssistantMessage` with `api: message.api` instead of `message.api as string | undefined` (the 4 errors at `auto-title.ts:94`, `usage.ts:107/110/116`). Proof: `service-typecheck.exit` = 0, `check.log` (type-check 3,842 files, 5 projects), `service-test-full.log` 610/0 fail, `service-named-tests.log` 10/0 fail.
- **(b) `bun run lint` failures fixed.** `catalog-models.ts:908` types `imageOptions` as `Parameters<typeof generateImage>[1]` instead of `any`; `workers.spare.test.ts` restores `attempts += 1` in the `warmSessionWorker` wrapper through a typed public method (`registry.warmSessionWorker = (input, environment) => {…}`) and drops the synthetic `spareRefillBlocked = true` mutation, so the production refusal path is exercised and line 170's `expect(attempts).toBe(1)` holds. Proof: `service-lint.exit` = 0, `oxlint-all.exit` = 0 with an empty log, `service-named-tests.log` (`workers.spare.test.ts` "a refused refill does not retry from its own settle" passes).
- **(c) `ReferenceError: AgentService is not defined` fixed.** `service-error-cause.test.ts`, `service-surface-routes.test.ts` (and `service-registration.test.ts`) import the value `{ AgentService }` from `./service.ts` again; the four now cleaned helpers parse HTTP bodies with `z.json().parse(...)` and `service-registration.test.ts` asserts the 503 envelope through `ProblemDetailsSchema.parse` instead of `toMatchObject`. Proof: `service-test-full.log` 0 fail across the three supervisor files, `service-named-tests.log` 10 pass / 0 fail.
- **(d) Anti-slop back under the `cf8df4f03b` baseline.** `host-tool.ts` removed `input?: unknown` in favor of the exported `HostToolEnablementInput` inferred from `HostToolEnablementInputSchema`; `normalizeHostToolEnablement` now branches on parsed values rather than `typeof`. Current 350 findings vs baseline 458 (contract 9 vs 12, service 341 vs 446); `host-tool.ts` 14 vs baseline 21; no file above baseline. Proof: `antislop-current.log` / `.exit`, `per-file-current.counts`, `../rework/per-file-delta.txt`.
- **(e) Non-blocking cleanups.** Duplicate JSDoc and stray `SAFETY:` comment gone from `auto-title.ts`; `session.ts` and the supervisor tests use schema-derived types instead of generic `SAFETY:` casts; `mcp.ts` validates each server entry individually (`MCPServerEntrySchema.safeParse` per entry, skipping malformed ones) over a `JsonValueSchema` record, with lenient `.catch` field parsing and `LenientStringListSchema` for `args`/`disabledServers`, so one bad entry no longer rejects every server. Proof: new `mcp.test.ts` cases "skips non-object server entries without dropping valid servers and handles odd field types leniently" and "fails closed with MCP_CONFIG_READ_FAILED when unmanaged file is wholly non-object" in `service-test-full.log`; new `host-tool.test.ts` case "normalizeHostToolEnablement preserves valid flags when an entry has a non-boolean value".
- **(f) This task file.** The Progress line pointing at the nonexistent `packages/agent-service/TODO.md` is deleted; `Check after:` now cites the round-2 receipts with each command's exit code and counts.

- **Independent review:** fresh reviewer, read-only, no blockers. The reviewer found two major behavior regressions in the leniency rework — `mcp.ts` dropped every server when one entry was malformed, and `host-tool.ts` dropped valid enablement flags when any value was non-boolean — plus four minors. All were fixed before landing and are covered by the new `mcp.test.ts` and `host-tool.test.ts` cases above (`service-test-full.log`).
