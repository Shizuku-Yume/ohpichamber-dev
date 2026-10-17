# 35: Converge the UI test project after caller cutover

**Effort:** omp-through-m3
**Task type:** refactor
**Base commit:** e1be47c36
**Finished:** 2026-10-17

**Delivers:** The UI test-project diagnostics are resolved without weakening the canonical contract or compiler configuration.

**Blocked by:** None
**Files:** `packages/ui/tsconfig.test.json`, directly paired UI fixtures and helpers
**Read first:** `.workflow/specs/omp-through-m3.md` W7-W10; Tasks 17, 33 and 34; UI sync/store documentation
**Covers:** W7, W9, W10

**Check:** `bunx tsc --noEmit --pretty false -p packages/ui/tsconfig.test.json` exits 0; `bun run --cwd packages/ui type-check` exits 0; the 21-file packet passes 264 tests / 984 assertions; the four final lint-repaired files pass 72 tests / 145 assertions.

- [x] The UI test project type-check passes without exclusions or compatibility aliases.
- [x] Remaining fixtures use canonical client/DTO contracts or explicit historical data fixtures.
- [x] No production fallback, adapter or guessed contract was added.
- [x] Final diagnostics, focused tests, package type-check and lint-ratchet results are recorded.

## Findings

Nine anti-slop findings introduced by the fixture edits were removed. Ten unchanged baseline findings remain in four fixture files under the repository ratchet policy. Connected runtime acceptance and residual production caller closure remain Task17/36 work.
