# 06: Final convergence, full workspace gate, and release-readiness report

**Effort:** final-main-audit
**Blocked by:** 01, 02, 03, 04, 05
**Covers:** W1, W2, W3, W4, W5
**Files:** `.workflow/development.md`; `.workflow/done/final-main-audit/closeout.md`; `.workflow/specs/final-main-audit.md`
**Read first:** `.workflow/specs/final-main-audit.md`; `.claude/skills/flow-verify/SKILL.md`; `.claude/skills/flow-close/SKILL.md`
**Check:** `bun install --frozen-lockfile && bun run brand:generate --check && bun run check && bun run type-check && bun run lint 2>&1 | tee /tmp/final-audit-lint.log && ! grep -qE ': warning ' /tmp/final-audit-lint.log && bun run dead-code && bun run docs:validate && VITEST_MAX_WORKERS=2 bun run test && .workflow/bin/workflow validate` → every single command exits 0 with zero warnings and zero dead-code findings; `FINAL-AUDIT-REPORT.md` written in `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task06/`.
**Base commit:** 78e7d4f5e2fd9ec50ed86d8a7c6a17821abfb67b
**Status:** paused

- [ ] Reconcile all merged changes from tasks 01–05 on `final-main-audit/integration`, rebuild `packages/agent-service`, and run the complete root gate above (fixing any cross-task interaction cleanly and re-running).
- [ ] Spawn an independent read-only reviewer worker to perform an effort-close `flow-verify` audit across `main...final-main-audit/integration` and inspect the screenshots/receipts from tasks 04 and 05.
- [ ] Write `/home/shizuku/Project/ohpichamber-omp-artifacts/final-main-audit-2026-11-18/task06/FINAL-AUDIT-REPORT.md` (summarizing code style/quality results, UI/i18n compliance, Web/Mobile/AppImage/CLI walkthrough receipts, full gate timings, and M7 readiness), update `.workflow/development.md`, write `.workflow/done/final-main-audit/closeout.md`, mark `.workflow/specs/final-main-audit.md` `**Status:** done`, archive task 06, merge `final-main-audit/integration` cleanly into `main`, and prune `final-main-audit` worktrees/branches so `main` is spotless.

## Progress

- Rebased the audit candidate (`final-main-audit/06-verified`) on integration containing PR #2 (`78e7d4f5e`). Agent Service build, root check, type-check and lint passed after the rebase; the focused admission routes and Worker tests passed. Removed an unused internal type export to restore the root dead-code gate; Agent Service type-check, lint and the affected tests passed after the fix.
- The pre-PR #2 aggregate on Ubuntu 22.04 failed three M0 files and the Web PIDFD test because the host's glibc does not export the required symbols. The affected PIDFD tests passed in Ubuntu 24.04. The same host aggregate reported a separate Git network test failure at the final local listener's positive-control assertion (`['/attempt', '/attempt']`); the focused test passed. The cause of the duplicate request was not established.
- In Ubuntu 24.04, the post-PR #2 aggregate found a test that parsed Oxlint's default human-readable diagnostics as Unix output. The test now requests Unix output explicitly; all 31 script files passed in the container and its three targeted assertions passed on the host.
- Check after: partial. The Ubuntu 24.04 aggregate completed 5/7 suites (Agent Service 631 pass, 10 skip, 0 fail). Scripts passed on the corrected test. Web reported 31 failures, including missing `ssh-keygen` and `bzip2`, and process-cleanup timeouts in a container with unreaped orphans. Not all Web failures were diagnosed. Neither aggregate run establishes a green root gate.
- Regular workspace lint had no warnings. A separate anti-slop scan found 16 diagnostics on changed lines relative to `main`, including two on a line changed in PR #2. The strict W1/W2 zero-fork-authored finding gate has not been demonstrated.
- Evidence: `/home/ubuntu/ohpichamber-assessment/final-main-audit/FINAL-AUDIT-REPORT.md` and adjacent logs. The maintainer's artifact root and tasks 04–05 raw receipts are not available in this environment. Task 04's existing waiver does not waive this task's check or review.
- Review: skipped — a fresh independent reviewer is not available in the audit session, and the raw task 04–05 receipts are not present.
- Resume: run the full gate on a fully provisioned Linux host with PIDFD support and an init process, resolve or obtain a decision on the W1/W2 anti-slop findings, and have a fresh reviewer inspect the prior receipts. Leave final sign-off and landing pending until the applicable checks and maintainer acceptance are recorded.
