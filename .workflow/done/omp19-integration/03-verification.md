# 03: Full integration verification

**Effort:** omp19-integration
**Blocked by:** 02
**Covers:** W5, W6
**Check:** `bun run type-check` at root and `bun test src --timeout 15000` in packages/agent-service → passes, or remaining test failures reproduced on origin/main

- [x] Run full checks through mobile and affected lint/dead-code checks.
- [x] Reproduce any remaining test failure on origin/main (none remain).
- [x] Record review availability, update development status, remove obsolete failure inventory and commit locally.

## Progress

Check after: full root `bun run type-check` passed through mobile: `No type errors in 3,888 files across 5 projects` and `[check] 5/5 steps passed`. Full Agent Service `bun test src --timeout 15000` passed: 661 pass, 12 skip, 0 fail, 6586 expect calls; 673 tests across 79 files in 351.68 seconds. No failure is being excused as pre-existing, so a remaining-failure baseline reproduction is unnecessary.

Evidence: `/home/ubuntu/omp19-artifacts/logs/stage2-type-check-final2.log`, `stage2-agent-tests-final.log`, `stage2-focused-final2.log`, `stage2-contract-tests.log`, `stage2-ui-lint-final.log` and `stage2-dead-code-final.log`. Service/contract lint and dead-code checks completed without diagnostics. UI lint exited zero with two exhaustive-deps warnings in unchanged MobileApp.tsx. Contract tests passed 271/271; focused service tests passed 206/206. Targeted historical todo and local-log UI tests passed; visual rendering was not checked.

The detached-service IPC-disconnect test passes in the full run. The Stage 1 worker stderr and service readiness gate establish the removed seance import as the readiness startup blocker; development.md owns the diagnosis. No readiness bypass, compatibility shim or capability expansion was added.

Review: skipped — this environment has no reviewer-subagent tool. W6's fresh workflow/security review remains unverified for effort close; this records degraded-mode execution, not review acceptance.

Source commits: `9818d5fae` (native lifecycle and canonical todos), `b84d10e3d` (settings mirrors and URL policy). Workflow evidence is committed separately. No push, main merge or changelog changes were performed. Packaged/non-Linux certification and external-provider checks are outside this stage's evidence.
