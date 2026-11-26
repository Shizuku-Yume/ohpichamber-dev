# 04: Native forms and selector presentation

**Effort:** omp19-integration
**Blocked by:** None
**Covers:** W7
**Check:** `bun test src/worker/interaction.test.ts src/interaction/manager.test.ts` in packages/agent-service; contract requests and UI question/FormDock suites pass
**Base commit:** 79d474a8da

- [x] Parse native HTML forms into canonical questions and safe existing UI presentation.
- [x] Preserve native values, defaults, optional/disabled fields, Other answers and selector hints.
- [x] Preserve current answers across timeout and message interruption using the canonical CAS flow.

## Progress

Shared Web/PWA, Electron, hosted mobile and Capacitor use FormDock. Guest SDK and mobile execution ownership are unchanged.

Check after: full Agent Service suite passes 677 tests, 12 skipped, 0 failed, including interaction/manager/form regressions; contracts pass 273 tests. Existing affected UI suites pass 231 tests across 12 files. No dedicated FormDock suite exists; shared controls/helpers/actions cover its boundaries. Focused form/native/projection/real HTTP tests pass 126 tests. Receipts: `/home/ubuntu/omp19-artifacts/logs/stage2b-*`. UI visually unverified.

Review: skipped — no fresh reviewer-subagent tool is available; required at effort close.
