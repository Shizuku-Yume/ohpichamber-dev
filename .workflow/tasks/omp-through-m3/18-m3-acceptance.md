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
**Integrated evidence:** combined native UI settings/Guest packet `74` tests / `578` assertions passed; session-actions `66` tests / `208` assertions passed; Electron `43/43` test files and syntax type-check passed; focused Host startup passes without legacy proxy registration; docs validation passed (`696` pages / `58` links); workflow validation passed (`42` task files).
**Open gate evidence:** full Web tests exit 1 after retiring the obsolete generic OpenCode proxy/worktree route suites; the current failures are retained quota and walkthrough callers (`server/lib/quota/providers/kilo.test.js` reports 22 failures; walkthrough job/route tests report missing migrated service callbacks), with output at `artifact://2979`. UI type-check, changed-slice oxlint and dead-code remain failing; artifacts are `artifact://2952`, `artifact://2951`, and `artifact://2957`.
**Decision:** M3 is not complete. Keep Task 18 active until W7-W10 connected Web/Electron native child, timeline, sidebar, Guest, packaging and remaining legacy-consumer evidence is current.
**Next slice:** retire the remaining OpenCode proxy/lifecycle consumers and tests; replace the isolated-space archive's Host OpenCode import owner with a canonical session/archive contract. Credential handoff outcomes are already verified in the composed M2 receipt; no startup credential importer remains in the current Host path.
- [ ] Verify native subagent execution, timeline navigation, sidebar hierarchy and child history recovery end-to-end on Web and Electron without OpenCode fallbacks.
